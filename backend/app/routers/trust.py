from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.transaction import Transaction, TransactionState
from app.models.review import Review
from app.models.report import Report, Block
from app.schemas.transaction import ReviewCreate, ReportCreate

router = APIRouter(tags=["trust"])


@router.post("/reviews")
def create_review(payload: ReviewCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == payload.transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if user.id not in (tx.buyer_id, tx.seller_id):
        raise HTTPException(status_code=403, detail="Not a party to this transaction")
    if tx.state != TransactionState.COMPLETED:
        raise HTTPException(status_code=400, detail="Can only review completed transactions")
    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    reviewee_id = tx.seller_id if user.id == tx.buyer_id else tx.buyer_id
    existing = db.query(Review).filter(
        Review.transaction_id == tx.id,
        Review.reviewer_id == user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You have already reviewed this transaction")

    review = Review(transaction_id=tx.id, reviewer_id=user.id, reviewee_id=reviewee_id,
                     rating=payload.rating, comment=payload.comment)
    db.add(review)

    reviewee = db.query(User).filter(User.id == reviewee_id).first()
    total = reviewee.avg_rating * reviewee.rating_count + payload.rating
    reviewee.rating_count += 1
    reviewee.avg_rating = round(total / reviewee.rating_count, 2)

    db.commit()
    return {"message": "Review submitted"}


@router.post("/reports")
def create_report(payload: ReportCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not payload.reported_user_id and not payload.reported_product_id:
        raise HTTPException(status_code=400, detail="Must report a user or a listing")
    if payload.reported_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")

    # Prevent duplicate spam reports while previous report is pending
    query = db.query(Report).filter(Report.reporter_id == user.id, Report.resolved == False)  # noqa: E712
    if payload.reported_user_id:
        query = query.filter(Report.reported_user_id == payload.reported_user_id)
    if payload.reported_product_id:
        query = query.filter(Report.reported_product_id == payload.reported_product_id)
    if query.first():
        raise HTTPException(
            status_code=400,
            detail="You already have an open report pending review for this item or user.",
        )

    report = Report(
        reporter_id=user.id,
        reported_user_id=payload.reported_user_id,
        reported_product_id=payload.reported_product_id,
        reason=payload.reason,
        details=payload.details,
    )
    db.add(report)
    db.commit()
    return {"message": "Report submitted, our team will review it"}


@router.post("/users/{user_id}/block")
def block_user(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    existing = db.query(Block).filter(Block.blocker_id == user.id, Block.blocked_id == user_id).first()
    if not existing:
        db.add(Block(blocker_id=user.id, blocked_id=user_id))
        db.commit()
    return {"message": "User blocked"}


@router.delete("/users/{user_id}/block")
def unblock_user(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Block).filter(Block.blocker_id == user.id, Block.blocked_id == user_id).delete()
    db.commit()
    return {"message": "User unblocked"}
