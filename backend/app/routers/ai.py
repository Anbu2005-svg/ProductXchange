import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.ai import vision, description, pricing

router = APIRouter(prefix="/ai", tags=["ai"])

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/suggest-listing")
async def suggest_listing(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """AI suggests; the student reviews/edits before publishing (nothing is saved here)."""
    filename = file.filename or "image.jpg"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WebP images are supported for AI suggestion.")

    content = await file.read(MAX_IMAGE_SIZE + 1)
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5 MB.")

    import anyio
    attrs = await anyio.to_thread.run_sync(vision.analyze_image, content)

    # Sanitize AI output to prevent XSS from malicious/compromised AI endpoints
    from app.core.security import sanitize_text

    def _sanitize_dict(d: dict) -> dict:
        return {k: sanitize_text(v) if isinstance(v, str) else v for k, v in d.items()}

    safe_attrs = _sanitize_dict(attrs) if attrs else {}
    text = description.generate_listing_text(safe_attrs)
    safe_text = _sanitize_dict(text) if text else {}
    price = pricing.suggest_price(db, safe_attrs.get("category", ""), safe_attrs.get("condition")) if safe_attrs else None
    return {"attributes": safe_attrs, "title": safe_text.get("title"), "description": safe_text.get("description"), "suggested_price": price}
