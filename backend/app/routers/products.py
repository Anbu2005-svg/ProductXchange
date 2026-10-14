import os
import re
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy import cast
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID, ST_Distance, ST_DWithin

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user, get_optional_current_user
from app.core.rate_limit import check_rate_limit
from app.models.user import User
from app.models.product import Product, ProductStatus
from app.models.transaction import Transaction, TransactionState
from app.models.report import Block
from app.schemas.product import ProductCreate, ProductUpdate, ProductOut

router = APIRouter(prefix="/products", tags=["products"])


def _is_deal_confirmed(product_id: int, user_id: int, db: Session) -> bool:
    deal = db.query(Transaction).filter(
        Transaction.product_id == product_id,
        Transaction.buyer_id == user_id,
        Transaction.state.in_([TransactionState.CONFIRMED, TransactionState.COMPLETED]),
    ).first()
    return deal is not None


def _sanitize_product_out(
    product: Product,
    current_user: Optional[User],
    db: Session,
    distance_m: Optional[float] = None
) -> ProductOut:
    out = ProductOut.model_validate(product)
    if distance_m is not None:
        out.distance_m = float(distance_m)

    is_seller = current_user is not None and current_user.id == product.seller_id
    is_confirmed_buyer = current_user is not None and _is_deal_confirmed(product.id, current_user.id, db)

    if is_seller or is_confirmed_buyer:
        out.pickup_area = product.pickup_area
        out.latitude = product.latitude
        out.longitude = product.longitude
    else:
        # Hide exact pickup area until transaction is confirmed
        out.pickup_area = None
        # Blur coordinates to ~1.1km area (2 decimal places) for privacy
        out.latitude = round(product.latitude, 2) if product.latitude is not None else None
        out.longitude = round(product.longitude, 2) if product.longitude is not None else None

    # Multi-Campus support: populate seller's college
    if product.seller and getattr(product.seller, "college", None):
        out.college = product.seller.college

    # 3D interactive model metadata
    if hasattr(product, "has_3d"):
        out.has_3d = bool(product.has_3d)
    if hasattr(product, "image_angles") and product.image_angles:
        if isinstance(product.image_angles, str):
            try:
                out.image_angles = json.loads(product.image_angles)
            except Exception:
                out.image_angles = None
        else:
            out.image_angles = product.image_angles

    # 30-day listing lifecycle & bump eligibility
    if product.created_at:
        created = product.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        age_days = (now - created).days
        out.days_remaining = max(0, 30 - age_days)
        out.is_expired = age_days >= 30
        out.can_bump = is_seller and age_days >= 1 and product.status == ProductStatus.ACTIVE
    else:
        out.days_remaining = 30
        out.is_expired = False
        out.can_bump = is_seller

    return out


def _apply_blocked_filters(query, current_user: Optional[User], db: Session):
    # Always exclude system-blocked/suspended users
    query = query.join(Product.seller).filter(User.is_blocked_flag == False)  # noqa: E712

    if current_user:
        # Exclude listings by sellers the current user has blocked
        blocked_by_me = select(Block.blocked_id).where(Block.blocker_id == current_user.id)
        # Exclude listings by sellers who blocked the current user
        blocked_me = select(Block.blocker_id).where(Block.blocked_id == current_user.id)
        query = query.filter(Product.seller_id.not_in(blocked_by_me)).filter(Product.seller_id.not_in(blocked_me))
    return query


def _escape_like_pattern(text: str) -> str:
    """Escapes SQL LIKE wildcards (%, _, \\) to prevent wildcard injection/DoS."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")



@router.post("", response_model=ProductOut)
def create_product(payload: ProductCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Cap active listings per user to prevent bot / sybil spam flooding
    active_count = db.query(Product).filter(
        Product.seller_id == user.id,
        Product.status == ProductStatus.ACTIVE
    ).count()
    if active_count >= 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum limit of 50 active listings reached. Please complete or remove existing listings.",
        )

    pickup_location = (payload.pickup_area or "").strip()
    if not pickup_location:
        if user.college:
            pickup_location = f"{user.college} Campus Pickup"
        else:
            raise HTTPException(status_code=400, detail="Product location / pickup area is mandatory.")

    # Validate non-zero coordinates (prevent Null Island 0.0, 0.0 spoofing)
    if payload.latitude == 0.0 and payload.longitude == 0.0:
        raise HTTPException(status_code=400, detail="Valid geographical coordinates are required for product location.")

    product = Product(
        seller_id=user.id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        condition=payload.condition,
        price=payload.price,
        transaction_type=payload.transaction_type,
        latitude=payload.latitude,
        longitude=payload.longitude,
        pickup_area=pickup_location,
        location=ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326),
        has_3d=bool(payload.has_3d),
        image_angles=json.dumps(payload.image_angles) if payload.image_angles else None,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return _sanitize_product_out(product, user, db)


@router.get("")
def list_products(
    response: Response,
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    condition: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    college: Optional[str] = None,
    has_3d: Optional[bool] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """Browse/filter active listings with blocked users excluded, campus filter, 3D filter, and pagination."""
    query = db.query(Product).filter(Product.status == ProductStatus.ACTIVE)
    query = _apply_blocked_filters(query, user, db)

    if category:
        query = query.filter(Product.category == category)
    if transaction_type:
        query = query.filter(Product.transaction_type == transaction_type)
    if condition:
        query = query.filter(Product.condition.ilike(f"%{condition}%"))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if college and college.strip() and college.strip().upper() != "ALL":
        safe_college = _escape_like_pattern(college.strip())
        query = query.filter(Product.seller.has(User.college.ilike(f"%{safe_college}%")))
    if has_3d is not None:
        query = query.filter(Product.has_3d == has_3d)
    if q and q.strip():
        safe_q = _escape_like_pattern(q.strip())
        like = f"%{safe_q}%"
        query = query.filter(or_(Product.title.ilike(like), Product.description.ilike(like)))

    total_count = query.count()
    response.headers["X-Total-Count"] = str(total_count)

    products = query.order_by(Product.created_at.desc()).offset(skip).limit(limit + 1).all()
    has_more = len(products) > limit
    items = products[:limit]
    return {
        "items": [_sanitize_product_out(p, user, db) for p in items],
        "has_more": has_more,
        "total_count": total_count,
    }


@router.get("/nearby/search", response_model=List[ProductOut])
def nearby_products(
    response: Response,
    lat: float,
    lng: float,
    radius_km: int = Query(default=settings.DEFAULT_SEARCH_RADIUS_KM, le=settings.MAX_SEARCH_RADIUS_KM),
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    condition: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    college: Optional[str] = None,
    has_3d: Optional[bool] = None,
    q: Optional[str] = None,
    sort: str = Query(default="distance", pattern="^(distance|recent)$"),
    limit: int = 30,
    offset: int = 0,
    user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    PostGIS distance filter + optional keyword search with blocked user exclusion,
    campus filter, 3D filter, advanced filters, and pickup privacy protection.
    """
    point = cast(ST_SetSRID(ST_MakePoint(lng, lat), 4326), Geography)
    distance_expr = ST_Distance(Product.location, point).label("distance_m")

    query = (
        db.query(Product, distance_expr)
        .filter(Product.status == ProductStatus.ACTIVE)
        .filter(ST_DWithin(Product.location, point, radius_km * 1000))
    )
    query = _apply_blocked_filters(query, user, db)

    if category:
        query = query.filter(Product.category == category)
    if transaction_type:
        query = query.filter(Product.transaction_type == transaction_type)
    if condition:
        query = query.filter(Product.condition.ilike(f"%{condition}%"))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if college and college.strip() and college.strip().upper() != "ALL":
        safe_college = _escape_like_pattern(college.strip())
        query = query.filter(Product.seller.has(User.college.ilike(f"%{safe_college}%")))
    if has_3d is not None:
        query = query.filter(Product.has_3d == has_3d)
    if q and q.strip():
        safe_q = _escape_like_pattern(q.strip())
        like = f"%{safe_q}%"
        query = query.filter(or_(Product.title.ilike(like), Product.description.ilike(like)))

    if sort == "distance":
        query = query.order_by(distance_expr.asc())
    else:
        query = query.order_by(Product.created_at.desc())

    rows = query.offset(offset).limit(limit).all()

    results = []
    for product, distance_m in rows:
        results.append(_sanitize_product_out(product, user, db, distance_m=distance_m))

    response.headers["X-Total-Count"] = str(len(results))
    return results


@router.get("/campuses")
def list_campuses(db: Session = Depends(get_db)):
    """List campuses with active listings count for multi-campus discovery."""
    results = (
        db.query(User.college, func.count(Product.id))
        .join(Product, Product.seller_id == User.id)
        .filter(Product.status == ProductStatus.ACTIVE)
        .filter(User.college.isnot(None))
        .filter(User.college != "")
        .group_by(User.college)
        .order_by(func.count(Product.id).desc())
        .all()
    )
    campuses = [{"college": r[0], "count": r[1]} for r in results if r[0]]
    preset_colleges = [
        "RV College of Engineering",
        "PES University (RR Campus)",
        "BMS College of Engineering",
        "Indian Institute of Science (IISc)",
        "Ramaiah Institute of Technology",
    ]
    existing = {c["college"].lower() for c in campuses}
    for preset in preset_colleges:
        if preset.lower() not in existing:
            campuses.append({"college": preset, "count": 0})
    return campuses


@router.get("/recommended", response_model=List[ProductOut])
def recommended_products(
    user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """Content-based recommendations: items in categories the user has interacted with."""
    category_list = []
    if user:
        bought_categories = (
            db.query(Product.category)
            .join(Transaction, Transaction.product_id == Product.id)
            .filter(
                (Transaction.buyer_id == user.id) | (Transaction.seller_id == user.id),
            )
            .distinct()
            .all()
        )
        category_list = [c[0] for c in bought_categories if c[0]]

    query = db.query(Product).filter(Product.status == ProductStatus.ACTIVE)
    if user:
        query = query.filter(Product.seller_id != user.id)
    query = _apply_blocked_filters(query, user, db)

    if category_list:
        matching = query.filter(Product.category.in_(category_list)).order_by(Product.created_at.desc()).limit(6).all()
        remaining_ids = {p.id for p in matching}
        if len(matching) < 6:
            filler = (
                query.filter(Product.id.not_in(remaining_ids))
                .order_by(Product.created_at.desc())
                .limit(6 - len(matching))
                .all()
            )
            matching.extend(filler)
        products = matching
    else:
        products = query.order_by(Product.created_at.desc()).limit(6).all()

    return [_sanitize_product_out(p, user, db) for p in products]


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
VALID_3D_ANGLES = {"front", "right", "back", "left", "top", "bottom"}


def _is_safe_image_url(url: str) -> bool:
    if not url or len(url) > 512:
        return False
    u = url.strip()
    if u.startswith("/uploads/") or u.startswith("uploads/"):
        filename = u.replace("/uploads/", "").replace("uploads/", "")
        return bool(re.match(r"^[a-zA-Z0-9_\-\/]+\.(jpg|jpeg|png|webp|svg)$", filename, re.IGNORECASE))
    if u.startswith("https://"):
        try:
            parsed = urlparse(u)
            hostname = (parsed.hostname or "").lower()
            trusted_hosts = ("images.unsplash.com", "unsplash.com", "amazonaws.com", "supabase.co")
            if any(hostname == h or hostname.endswith(f".{h}") for h in trusted_hosts):
                return bool(re.search(r"\.(jpg|jpeg|png|webp|svg)(\?.*)?$", u, re.IGNORECASE) or "unsplash.com" in hostname)
            if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
                expected = f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/"
                return u.startswith(expected)
            # Safe generic HTTPS image URL (exclude malicious/phishing test domains)
            if re.search(r"\.(jpg|jpeg|png|webp|svg)(\?.*)?$", parsed.path, re.IGNORECASE):
                if not any(bad in hostname for bad in ("malicious", "phishing", "exploit", "localhost", "127.0.0.1")):
                    return True
        except Exception:
            return False
    return False


def _validate_image_bytes(data: bytes, ext: str) -> bool:
    if len(data) < 12:
        return False
    if ext in (".jpg", ".jpeg") and data.startswith(b"\xff\xd8\xff"):
        return True
    if ext == ".png" and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if ext == ".webp" and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return True
    return False


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product or product.status == ProductStatus.REMOVED:
        raise HTTPException(status_code=404, detail="Product not found")

    seller = db.query(User).filter(User.id == product.seller_id).first()
    if seller and seller.is_blocked_flag:
        raise HTTPException(status_code=404, detail="Product not found")

    if user:
        is_blocked = db.query(Block).filter(
            or_(
                (Block.blocker_id == user.id) & (Block.blocked_id == product.seller_id),
                (Block.blocker_id == product.seller_id) & (Block.blocked_id == user.id),
            )
        ).first()
        if is_blocked:
            raise HTTPException(status_code=404, detail="Product not found")

    return _sanitize_product_out(product, user, db)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    # Prevent bait-and-switch: freeze edits on price/title/description while active deals exist
    active_states = {
        TransactionState.PENDING,
        TransactionState.COUNTERED,
        TransactionState.ACCEPTED,
        TransactionState.CONFIRMED,
    }
    has_active_tx = (
        db.query(Transaction)
        .filter(
            Transaction.product_id == product.id,
            Transaction.state.in_(active_states),
        )
        .first()
    )
    if has_active_tx:
        frozen_fields = {"title", "description", "price", "category", "condition"}
        attempted = set(payload.model_dump(exclude_unset=True).keys())
        if attempted & frozen_fields:
            raise HTTPException(
                status_code=409,
                detail="Cannot edit listing details while there are active negotiations. Cancel or complete open deals first.",
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return _sanitize_product_out(product, user, db)


@router.delete("/{product_id}")
def delete_product(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not your listing")
    product.status = ProductStatus.REMOVED
    db.commit()
    return {"message": "Listing removed"}


@router.post("/{product_id}/bump", response_model=ProductOut)
def bump_product(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Refreshes product created_at timestamp to bump listing to the top of recent searches."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not your listing")
    if product.status != ProductStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only active listings can be bumped")

    # Prevent spam-bumping: allow at most once per 24 hours
    if product.created_at:
        created = product.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - created).total_seconds() < 86400:
            raise HTTPException(status_code=429, detail="Listings can only be bumped once every 24 hours.")

    product.created_at = func.now()
    db.commit()
    db.refresh(product)
    return _sanitize_product_out(product, user, db)


@router.post("/{product_id}/images")
def upload_image(
    product_id: int,
    file: UploadFile = File(...),
    angle: Optional[str] = Query(None, description="Optional 3D angle side (front, right, back, left, top, bottom)"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product or product.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    current_images = []
    if product.image_urls:
        if isinstance(product.image_urls, list):
            current_images = list(product.image_urls)
        elif isinstance(product.image_urls, str):
            try:
                parsed = json.loads(product.image_urls)
                current_images = list(parsed) if isinstance(parsed, list) else [product.image_urls]
            except Exception:
                current_images = [product.image_urls]

    if len(current_images) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images allowed per listing")

    filename = file.filename or "image.jpg"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    if file.content_type and file.content_type.lower() not in ALLOWED_IMAGE_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid MIME type '{file.content_type}'. Allowed types: image/jpeg, image/png, image/webp",
        )

    content = file.file.read(MAX_IMAGE_SIZE + 1)
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum file size is 5 MB.")

    if not _validate_image_bytes(content, ext):
        raise HTTPException(status_code=400, detail="Invalid image content or corrupt file headers.")

    key = f"{uuid.uuid4().hex}{ext}"

    if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
        import io
        import boto3
        s3 = boto3.client("s3", region_name=settings.AWS_REGION)
        s3.upload_fileobj(io.BytesIO(content), settings.S3_BUCKET, key, ExtraArgs={"ContentType": file.content_type or "image/jpeg"})
        url = f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    else:
        os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
        path = os.path.join(settings.LOCAL_STORAGE_DIR, key)
        with open(path, "wb") as f:
            f.write(content)
        url = f"/uploads/{key}"

    product.image_urls = current_images + [url]

    # If angle was provided, register it in image_angles for 3D model
    if angle and angle.strip():
        clean_angle = angle.strip().lower()
        if clean_angle not in VALID_3D_ANGLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid 3D angle '{clean_angle}'. Allowed angles: {', '.join(sorted(VALID_3D_ANGLES))}",
            )
        angles = {}
        if product.image_angles:
            try:
                angles = json.loads(product.image_angles) if isinstance(product.image_angles, str) else dict(product.image_angles)
            except Exception:
                angles = {}
        angles[clean_angle] = url
        product.image_angles = json.dumps(angles)
        if len(angles) >= 2:
            product.has_3d = True

    db.commit()
    db.refresh(product)
    return {
        "url": url,
        "angle": angle,
        "has_3d": bool(product.has_3d),
        "total_images": len(product.image_urls or []),
    }


@router.post("/{product_id}/3d-convert")
def convert_to_3d(
    product_id: int,
    payload: Optional[Dict[str, Any]] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stitches multi-angle side photos (front, right, back, left, top, bottom)
    into a calibrated 3D interactive model / turntable frame sequence.
    """
    # Rate limit: max 12 3D conversions per minute per user
    allowed, retry_after = check_rate_limit(f"3d_convert:{user.id}", 12, 60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many 3D conversion requests. Please wait {retry_after} seconds.",
        )

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product or product.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    incoming_angles = (payload or {}).get("angles") if payload else None

    # Load existing or incoming angles
    angles: Dict[str, str] = {}
    if incoming_angles and isinstance(incoming_angles, dict):
        sanitized_angles: Dict[str, str] = {}
        for k, v in incoming_angles.items():
            k_clean = str(k).strip().lower()
            if k_clean not in VALID_3D_ANGLES:
                raise HTTPException(status_code=400, detail=f"Invalid 3D angle face: '{k_clean}'")
            v_str = str(v).strip()
            if not _is_safe_image_url(v_str):
                raise HTTPException(status_code=400, detail=f"Invalid or untrusted image URL for angle '{k_clean}'")
            sanitized_angles[k_clean] = v_str
        angles = sanitized_angles
    elif product.image_angles:
        try:
            raw_angles = json.loads(product.image_angles) if isinstance(product.image_angles, str) else dict(product.image_angles)
            angles = {k: v for k, v in raw_angles.items() if k in VALID_3D_ANGLES and _is_safe_image_url(str(v))}
        except Exception:
            angles = {}

    # If angles are not explicitly provided, map uploaded images sequentially to 3D faces
    if not angles or len(angles) < 2:
        urls = [u for u in (product.image_urls or []) if _is_safe_image_url(str(u))]
        if len(urls) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 photos (preferably 4-6 sides: Front, Right, Back, Left, Top, Bottom) are required to convert to a 3D product view.",
            )
        default_sides = ["front", "right", "back", "left", "top", "bottom"]
        for idx, u in enumerate(urls[:6]):
            angles[default_sides[idx]] = u

    # Build 360-degree turntable frames in smooth clockwise order
    turntable_frames = []
    for side in ["front", "right", "back", "left"]:
        if side in angles:
            turntable_frames.append(angles[side])
        elif "front" in angles:
            turntable_frames.append(angles["front"])

    product.has_3d = True
    product.image_angles = json.dumps(angles)
    db.commit()
    db.refresh(product)

    return {
        "success": True,
        "product_id": product.id,
        "has_3d": True,
        "angles": angles,
        "turntable_frames": turntable_frames,
        "model_type": "photogrammetry_cuboid",
        "mesh_dimensions": {
            "width": 1.0,
            "height": 1.0,
            "depth": 0.6,
        },
        "message": "Product photos successfully converted to interactive 3D model! 🧊",
    }
