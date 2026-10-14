from typing import Optional, Any
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.core.database import get_db
from app.core.security import get_current_admin, sanitize_text
from app.models.user import User
from app.models.product import Product, ProductStatus
from app.models.transaction import Transaction
from app.models.report import Report

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return {
        "total_users": db.query(func.count(User.id)).scalar(),
        "verified_users": db.query(func.count(User.id)).filter(User.is_verified == True).scalar(),  # noqa: E712
        "active_listings": db.query(func.count(Product.id)).filter(Product.status == ProductStatus.ACTIVE).scalar(),
        "total_transactions": db.query(func.count(Transaction.id)).scalar(),
        "open_reports": db.query(func.count(Report.id)).filter(Report.resolved == False).scalar(),  # noqa: E712
    }


@router.get("/analytics/breakdown")
def analytics_breakdown(db: Session = Depends(get_db)):
    """Aggregate statistics for admin dashboard charts."""
    categories = (
        db.query(Product.category, func.count(Product.id))
        .filter(Product.status != ProductStatus.REMOVED)
        .group_by(Product.category)
        .all()
    )
    tx_states = (
        db.query(Transaction.state, func.count(Transaction.id))
        .group_by(Transaction.state)
        .all()
    )
    tx_types = (
        db.query(Product.transaction_type, func.count(Product.id))
        .filter(Product.status != ProductStatus.REMOVED)
        .group_by(Product.transaction_type)
        .all()
    )
    return {
        "categories": [{"category": c[0] or "Uncategorized", "count": c[1]} for c in categories],
        "transaction_states": [{"state": str(s[0].value if hasattr(s[0], "value") else s[0]), "count": s[1]} for s in tx_states],
        "transaction_types": [{"type": str(t[0].value if hasattr(t[0], "value") else t[0]), "count": t[1]} for t in tx_types],
    }


@router.get("/users")
def list_users(
    q: Optional[str] = None,
    blocked: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q and q.strip():
        safe_q = f"%{q.strip()}%"
        query = query.filter(or_(User.email.ilike(safe_q), User.full_name.ilike(safe_q), User.college.ilike(safe_q)))
    if blocked is not None:
        query = query.filter(User.is_blocked_flag == blocked)

    total = query.count()
    users = query.order_by(User.id.desc()).offset(skip).limit(min(limit, 100)).all()
    return {
        "total": total,
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "avatar_url": u.avatar_url,
                "college": u.college,
                "is_verified": u.is_verified,
                "is_admin": u.is_admin,
                "is_blocked_flag": u.is_blocked_flag,
                "avg_rating": u.avg_rating,
                "rating_count": u.rating_count,
                "created_at": str(u.created_at) if u.created_at else None,
            }
            for u in users
        ],
    }


@router.get("/reports")
def list_reports(resolved: bool = False, db: Session = Depends(get_db)):
    return db.query(Report).filter(Report.resolved == resolved).order_by(Report.created_at.desc()).all()


@router.post("/reports/{report_id}/resolve")
def resolve_report(report_id: int, admin_notes: str = "", db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.resolved = True
    report.admin_notes = sanitize_text(admin_notes[:2000]) if admin_notes else ""
    db.commit()
    return {"message": "Report resolved"}


@router.post("/users/{user_id}/suspend")
def suspend_user(user_id: int, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend your own admin account.")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot suspend an administrator account.")
    user.is_blocked_flag = True
    db.commit()
    return {"message": "User suspended"}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_blocked_flag = False
    db.commit()
    return {"message": "User reinstated"}


@router.post("/listings/{product_id}/remove")
def remove_listing(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if product:
        product.status = ProductStatus.REMOVED
        db.commit()
    return {"message": "Listing removed"}


def _sanitize_csv_cell(val: Any) -> str:
    """Neutralize spreadsheet formula injection (CWE-1236) by escaping formula prefixes."""
    s = str(val) if val is not None else ""
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


@router.get("/export/{resource}")
def export_data(resource: str, db: Session = Depends(get_db)):
    """Export tabular datasets to CSV for moderation and admin analysis."""
    output = io.StringIO()
    writer = csv.writer(output)

    if resource == "users":
        writer.writerow(["ID", "Email", "Full Name", "College", "Verified", "Admin", "Suspended", "Rating", "Joined At"])
        users = db.query(User).order_by(User.id.asc()).all()
        for u in users:
            writer.writerow([
                _sanitize_csv_cell(u.id),
                _sanitize_csv_cell(u.email),
                _sanitize_csv_cell(u.full_name or ""),
                _sanitize_csv_cell(u.college or ""),
                _sanitize_csv_cell(u.is_verified),
                _sanitize_csv_cell(u.is_admin),
                _sanitize_csv_cell(u.is_blocked_flag),
                _sanitize_csv_cell(u.avg_rating),
                _sanitize_csv_cell(str(u.created_at)),
            ])

    elif resource == "products":
        writer.writerow(["ID", "Seller ID", "Title", "Category", "Type", "Price", "Condition", "Status", "Created At"])
        products = db.query(Product).order_by(Product.id.asc()).all()
        for p in products:
            writer.writerow([
                _sanitize_csv_cell(p.id),
                _sanitize_csv_cell(p.seller_id),
                _sanitize_csv_cell(p.title),
                _sanitize_csv_cell(p.category),
                _sanitize_csv_cell(p.transaction_type.value if hasattr(p.transaction_type, "value") else str(p.transaction_type)),
                _sanitize_csv_cell(p.price or 0),
                _sanitize_csv_cell(p.condition or ""),
                _sanitize_csv_cell(p.status.value if hasattr(p.status, "value") else str(p.status)),
                _sanitize_csv_cell(str(p.created_at)),
            ])

    elif resource == "transactions":
        writer.writerow(["ID", "Product ID", "Buyer ID", "Seller ID", "State", "Agreed Price", "Created At", "Updated At"])
        txs = db.query(Transaction).order_by(Transaction.id.asc()).all()
        for t in txs:
            writer.writerow([
                _sanitize_csv_cell(t.id),
                _sanitize_csv_cell(t.product_id),
                _sanitize_csv_cell(t.buyer_id),
                _sanitize_csv_cell(t.seller_id),
                _sanitize_csv_cell(t.state.value if hasattr(t.state, "value") else str(t.state)),
                _sanitize_csv_cell(t.agreed_price or ""),
                _sanitize_csv_cell(str(t.created_at)),
                _sanitize_csv_cell(str(t.updated_at)),
            ])

    elif resource == "reports":
        writer.writerow(["ID", "Reporter ID", "Reported User ID", "Reported Product ID", "Reason", "Details", "Resolved", "Created At"])
        reports = db.query(Report).order_by(Report.id.asc()).all()
        for r in reports:
            writer.writerow([
                _sanitize_csv_cell(r.id),
                _sanitize_csv_cell(r.reporter_id),
                _sanitize_csv_cell(r.reported_user_id or ""),
                _sanitize_csv_cell(r.reported_product_id or ""),
                _sanitize_csv_cell(r.reason),
                _sanitize_csv_cell(r.details or ""),
                _sanitize_csv_cell(r.resolved),
                _sanitize_csv_cell(str(r.created_at)),
            ])

    else:
        raise HTTPException(status_code=400, detail="Invalid resource. Choose from: users, products, transactions, reports")

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=productxchange_{resource}.csv"},
    )
