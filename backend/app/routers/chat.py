from typing import Optional
import json
import time
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, decode_access_token
from app.core.rate_limit import rate_limit_dependency
from app.core.websocket import manager
from app.models.user import User
from app.models.message import Conversation, Message
from app.models.report import Block
from app.schemas.transaction import MessageCreate

router = APIRouter(prefix="/chat", tags=["chat"])


def _blocked_between(db: Session, a: int, b: int) -> bool:
    return db.query(Block).filter(
        or_(
            and_(Block.blocker_id == a, Block.blocked_id == b),
            and_(Block.blocker_id == b, Block.blocked_id == a),
        )
    ).first() is not None


@router.post("/conversations/start")
def start_conversation(other_user_id: int, product_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if other_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot start a conversation with yourself")

    other_user = db.query(User).filter(User.id == other_user_id).first()
    if not other_user or other_user.is_blocked_flag:
        raise HTTPException(status_code=404, detail="User not found")

    if _blocked_between(db, user.id, other_user_id):
        raise HTTPException(status_code=403, detail="Cannot message this user")

    existing = db.query(Conversation).filter(
        or_(
            and_(Conversation.user_a_id == user.id, Conversation.user_b_id == other_user_id),
            and_(Conversation.user_a_id == other_user_id, Conversation.user_b_id == user.id),
        ),
        Conversation.product_id == product_id,
    ).first()
    if existing:
        return {"conversation_id": existing.id}

    convo = Conversation(product_id=product_id, user_a_id=user.id, user_b_id=other_user_id)
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return {"conversation_id": convo.id}


@router.get("/conversations")
def list_conversations(
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    safe_skip = max(0, skip)
    safe_limit = min(max(1, limit), 100)
    return (
        db.query(Conversation)
        .filter(or_(Conversation.user_a_id == user.id, Conversation.user_b_id == user.id))
        .order_by(Conversation.created_at.desc())
        .offset(safe_skip)
        .limit(safe_limit)
        .all()
    )


@router.get("/unread-count")
def get_unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns total count of unread messages across all user conversations."""
    convo_ids = [
        c.id for c in db.query(Conversation.id).filter(
            or_(Conversation.user_a_id == user.id, Conversation.user_b_id == user.id)
        ).all()
    ]
    if not convo_ids:
        return {"unread_count": 0}

    unread = db.query(Message).filter(
        Message.conversation_id.in_(convo_ids),
        Message.sender_id != user.id,
        Message.read == False,  # noqa: E712
    ).count()
    return {"unread_count": unread}


@router.get(
    "/conversations/{conversation_id}/messages",
    dependencies=[Depends(rate_limit_dependency(max_requests=60, window_seconds=60))],
)
def get_messages(
    conversation_id: int,
    skip: int = 0,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo or user.id not in (convo.user_a_id, convo.user_b_id):
        raise HTTPException(status_code=403, detail="Not part of this conversation")

    # Mark all incoming messages in this conversation as read
    db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.sender_id != user.id,
        Message.read == False,  # noqa: E712
    ).update({"read": True}, synchronize_session=False)
    db.commit()

    safe_skip = max(0, skip)
    safe_limit = min(max(1, limit), 200)
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .offset(safe_skip)
        .limit(safe_limit)
        .all()
    )


@router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: int, payload: MessageCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo or user.id not in (convo.user_a_id, convo.user_b_id):
        raise HTTPException(status_code=403, detail="Not part of this conversation")

    other_id = convo.user_b_id if user.id == convo.user_a_id else convo.user_a_id
    if _blocked_between(db, user.id, other_id):
        raise HTTPException(status_code=403, detail="Cannot message this user")

    content = payload.content.strip().replace("\x00", "")
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be blank")

    msg = Message(conversation_id=conversation_id, sender_id=user.id, content=content, image_url=payload.image_url)
    db.add(msg)

    # Notify the recipient
    from app.routers.notifications import create_notification
    create_notification(
        db, other_id, "NEW_MESSAGE",
        "New message received 💬",
        f"{content[:80]}{'...' if len(content) > 80 else ''}",
        f"/chat/{conversation_id}"
    )

    other_user = db.query(User).filter(User.id == other_id).first()
    if other_user and other_user.email:
        from app.services.email_service import send_new_message_alert
        send_new_message_alert(
            other_user.email,
            user.full_name or "Campus student",
            content[:120],
            f"http://localhost:3000/chat/{conversation_id}",
        )

    db.commit()
    db.refresh(msg)

    # Broadcast real-time message to active WebSocket listeners
    msg_dict = {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "content": msg.content,
        "image_url": msg.image_url,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }
    await manager.broadcast_chat(conversation_id, msg_dict)
    await manager.send_user_notification(
        other_id,
        {
            "type": "NEW_MESSAGE",
            "title": "New message received 💬",
            "message": f"{content[:80]}{'...' if len(content) > 80 else ''}",
            "link": f"/chat/{conversation_id}",
            "conversation_id": conversation_id,
        },
    )

    return msg


@router.websocket("/ws/{conversation_id}")
async def websocket_chat(
    websocket: WebSocket,
    conversation_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Real-time bi-directional chat socket."""
    # Allow authentication via query param OR secure HttpOnly cookie
    auth_token = token
    if not auth_token:
        cookie_token = websocket.cookies.get("access_token")
        if cookie_token:
            auth_token = cookie_token[7:] if cookie_token.startswith("Bearer ") else cookie_token

    if not auth_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user_id = int(decode_access_token(auth_token))
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.is_blocked_flag:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo or user.id not in (convo.user_a_id, convo.user_b_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    other_id = convo.user_b_id if user.id == convo.user_a_id else convo.user_a_id
    if _blocked_between(db, user.id, other_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect_chat(conversation_id, websocket)
    last_msg_time = 0.0
    recent_msg_count = 0
    last_typing_time = 0.0

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue

            if data.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            if data.get("type") == "typing":
                now = time.time()
                if now - last_typing_time < 1.0:
                    continue
                last_typing_time = now
                await manager.broadcast_chat(conversation_id, {
                    "type": "typing",
                    "sender_id": user.id,
                    "is_typing": bool(data.get("is_typing", True)),
                })
                continue

            now = time.time()
            if now - last_msg_time < 3.0:
                recent_msg_count += 1
                if recent_msg_count > 6:
                    await websocket.send_text(json.dumps({"error": "Rate limit exceeded. Please wait a few seconds."}))
                    continue
            else:
                recent_msg_count = 1
                last_msg_time = now

            from app.core.security import sanitize_text
            content = sanitize_text((data.get("content") or "").strip())
            if not content:
                continue
            if len(content) > 5000:
                content = content[:5000]

            image_url = data.get("image_url")
            if image_url:
                from app.routers.products import _is_safe_image_url
                if not _is_safe_image_url(str(image_url)):
                    image_url = None

            msg = Message(
                conversation_id=conversation_id,
                sender_id=user.id,
                content=content,
                image_url=image_url,
            )
            db.add(msg)
            from app.routers.notifications import create_notification
            create_notification(
                db, other_id, "NEW_MESSAGE",
                "New message received 💬",
                f"{content[:80]}{'...' if len(content) > 80 else ''}",
                f"/chat/{conversation_id}"
            )
            db.commit()
            db.refresh(msg)

            msg_dict = {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "sender_id": msg.sender_id,
                "content": msg.content,
                "image_url": msg.image_url,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }
            await manager.broadcast_chat(conversation_id, msg_dict)
            await manager.send_user_notification(
                other_id,
                {
                    "type": "NEW_MESSAGE",
                    "title": "New message received 💬",
                    "message": f"{content[:80]}{'...' if len(content) > 80 else ''}",
                    "link": f"/chat/{conversation_id}",
                    "conversation_id": conversation_id,
                },
            )
    except WebSocketDisconnect:
        manager.disconnect_chat(conversation_id, websocket)

