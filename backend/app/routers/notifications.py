import ipaddress
from typing import Optional, Dict, Any
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db, is_sqlite
from app.core.security import get_current_user, decode_access_token
from app.core.rate_limit import check_rate_limit
from app.core.websocket import manager
from app.models.user import User
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

DISALLOWED_PUSH_HOSTS = {
    "localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254", "metadata.google.internal"
}


class PushSubscriptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str
    p256dh: Optional[str] = None
    auth: Optional[str] = None


def _validate_push_endpoint(endpoint: str):
    if not endpoint or len(endpoint) > 1024:
        raise HTTPException(status_code=400, detail="Invalid push subscription endpoint length")
    if not endpoint.startswith("https://"):
        raise HTTPException(status_code=400, detail="Push subscription endpoint must use HTTPS")
    try:
        parsed = urlparse(endpoint)
        hostname = (parsed.hostname or "").lower()
        if not hostname or hostname in DISALLOWED_PUSH_HOSTS:
            raise HTTPException(status_code=400, detail="Disallowed push endpoint host")

        # SSRF defense: block private, loopback, link-local, and reserved IP ranges
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise HTTPException(status_code=400, detail="Private network endpoints are forbidden")
        except ValueError:
            pass

        if hostname.startswith("10.") or hostname.startswith("192.168.") or hostname.startswith("172."):
            raise HTTPException(status_code=400, detail="Private network endpoints are forbidden")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed push endpoint URL")



# In-memory fallback cache for fast push dispatch
_push_subscriptions: Dict[int, list] = {}


def create_notification(db: Session, user_id: int, type: str, title: str, message: str = None, link: str = None):
    """Helper to create a notification from anywhere in the app."""
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        link=link,
    )
    db.add(notif)
    # Don't commit here — let the caller commit as part of their transaction


@router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        .count()
    )
    return {"count": count}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Marked as read"}


@router.post("/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.websocket("/ws")
async def websocket_notifications(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Real-time push notifications socket."""
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

    await manager.connect_user(user.id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_user(user.id, websocket)


@router.get("/push-config")
def get_push_config():
    """Returns Web Push service configuration and public key for browser subscription."""
    return {
        "enabled": True,
        "publicKey": "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
        "service": "web-push-pwa",
    }


@router.post("/push-subscription")
def subscribe_push(
    payload: PushSubscriptionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Registers or updates a browser Web Push subscription for the authenticated student."""
    if not payload.endpoint:
        raise HTTPException(status_code=400, detail="Missing subscription endpoint")

    # Security: Validate push endpoint to protect against SSRF and internal scanning
    _validate_push_endpoint(payload.endpoint)

    # Save to in-memory store for instantaneous push dispatch
    subs = _push_subscriptions.setdefault(user.id, [])
    if payload.endpoint not in [s.get("endpoint") for s in subs]:
        subs.append(payload.model_dump())

    # Persist to database
    try:
        if is_sqlite:
            db.execute(
                text("""
                    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
                    VALUES (:user_id, :endpoint, :p256dh, :auth)
                    ON CONFLICT(endpoint) DO UPDATE SET
                        p256dh = excluded.p256dh,
                        auth = excluded.auth
                """),
                {"user_id": user.id, "endpoint": payload.endpoint, "p256dh": payload.p256dh, "auth": payload.auth},
            )
        else:
            db.execute(
                text("""
                    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
                    VALUES (:user_id, :endpoint, :p256dh, :auth)
                    ON CONFLICT(endpoint) DO UPDATE SET
                        p256dh = EXCLUDED.p256dh,
                        auth = EXCLUDED.auth
                """),
                {"user_id": user.id, "endpoint": payload.endpoint, "p256dh": payload.p256dh, "auth": payload.auth},
            )
        db.commit()
    except Exception:
        db.rollback()

    return {"status": "subscribed", "endpoint": payload.endpoint}


@router.post("/test-push")
async def send_test_push(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sends a real-time push notification test to the current user's devices."""
    # Security: Rate limit test pushes to 6 per minute to prevent flooding
    allowed, retry_after = check_rate_limit(f"test_push:{user.id}", 6, 60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many test notifications. Please wait {retry_after} seconds before testing again.",
        )

    test_title = "🔔 ProductXchange Alert"
    test_message = "Push notifications are active! You'll receive instant alerts for offers and meetup handoffs."
    test_link = "/deals"

    # Save as notification
    create_notification(
        db=db,
        user_id=user.id,
        type="PUSH_TEST",
        title=test_title,
        message=test_message,
        link=test_link,
    )
    db.commit()

    # Dispatch via active WebSocket connection if online
    await manager.send_user_notification(user.id, {
        "type": "PUSH_ALERT",
        "title": test_title,
        "body": test_message,
        "link": test_link,
        "icon": "/icons/icon-192x192.png",
    })

    return {
        "success": True,
        "title": test_title,
        "message": test_message,
        "subscribers_active": len(_push_subscriptions.get(user.id, [])),
    }


