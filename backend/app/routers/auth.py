import os
import uuid
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status, Request, UploadFile, File
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    hash_password, verify_password, create_access_token, get_current_user,
    revoke_token, _extract_token, oauth2_scheme,
)
from app.core.rate_limit import rate_limit_dependency, check_rate_limit

from app.models.user import User
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, OTPVerifyRequest, LocationUpdateRequest,
)
from app.schemas.user import UserOut, UserUpdate
from app.services.email_service import send_password_reset_email

ALLOWED_AVATAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_AVATAR_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_SIZE = 3 * 1024 * 1024  # 3 MB


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str
    new_password: str = Field(..., min_length=8)


router = APIRouter(prefix="/auth", tags=["auth"])

# Redis connection with fallback to in-memory store
_redis_client = None
try:
    import redis
    _r = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    _r.ping()
    _redis_client = _r
except Exception:
    _redis_client = None

# Local fallback store for development: {phone: {"otp": str, "expires_at": float, "attempts": int, "window_start": float}}
_local_otp_store: dict[str, dict] = {}
_local_otp_failures: dict[str, dict] = {}  # {phone: {"count": int, "first_at": float}}
_local_login_attempts: dict[str, dict] = {}
_local_otp_cooldowns: dict[str, float] = {}  # {phone: last_request_timestamp}


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "production",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def _clear_auth_cookie(response: Response):
    response.delete_cookie(key="access_token", path="/")


def _check_otp_cooldown(phone: str):
    """Enforce 60-second cooldown between OTP requests to prevent brute-force cycling."""
    now = time.time()
    if _redis_client:
        cooldown_key = f"otp_cooldown:{phone}"
        last_req = _redis_client.get(cooldown_key)
        if last_req and now - float(last_req) < 60:
            wait = int(60 - (now - float(last_req)))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait} seconds before requesting another OTP.",
            )
        _redis_client.setex(cooldown_key, 60, str(now))
    else:
        last_req = _local_otp_cooldowns.get(phone, 0)
        if now - last_req < 60:
            wait = int(60 - (now - last_req))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait} seconds before requesting another OTP.",
            )
        _local_otp_cooldowns[phone] = now


def _check_rate_limit(phone: str):
    now = time.time()
    if _redis_client:
        rate_key = f"otp_rate:{phone}"
        requests = _redis_client.incr(rate_key)
        if requests == 1:
            _redis_client.expire(rate_key, 600)  # 10 minute window
        if requests > 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many OTP requests for this phone number. Please wait a few minutes.",
            )
    else:
        entry = _local_otp_store.setdefault(phone, {})
        window_start = entry.get("window_start", 0)
        attempts = entry.get("attempts", 0)
        if now - window_start < 600:
            if attempts >= 5:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many OTP requests for this phone number. Please wait a few minutes.",
                )
            entry["attempts"] = attempts + 1
        else:
            entry["window_start"] = now
            entry["attempts"] = 1


def _check_login_rate_limit(email: str):
    now = time.time()
    clean_email = email.strip().lower()
    entry = _local_login_attempts.get(clean_email)
    if entry:
        lockout_until = entry.get("lockout_until", 0)
        if now < lockout_until:
            wait_seconds = int(lockout_until - now)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Account temporarily locked. Please try again in {wait_seconds} seconds.",
            )


def _record_login_failure(email: str):
    now = time.time()
    clean_email = email.strip().lower()
    entry = _local_login_attempts.setdefault(clean_email, {"failures": 0, "first_failure": now, "lockout_until": 0})
    if now - entry.get("first_failure", 0) > 300:
        entry["failures"] = 1
        entry["first_failure"] = now
    else:
        entry["failures"] = entry.get("failures", 0) + 1

    if entry["failures"] >= 5:
        entry["lockout_until"] = now + 300  # 5-minute lockout


def _record_login_success(email: str):
    clean_email = email.strip().lower()
    _local_login_attempts.pop(clean_email, None)


def _store_otp(phone: str, otp: str):
    now = time.time()
    if _redis_client:
        _redis_client.setex(f"otp:{phone}", 300, otp)  # 5 min TTL
    else:
        entry = _local_otp_store.setdefault(phone, {})
        entry["otp"] = otp
        entry["expires_at"] = now + 300


def _get_stored_otp(phone: str) -> Optional[str]:
    if _redis_client:
        return _redis_client.get(f"otp:{phone}")
    entry = _local_otp_store.get(phone)
    if not entry:
        return None
    if time.time() > entry.get("expires_at", 0):
        _local_otp_store.pop(phone, None)
        return None
    return entry.get("otp")


def _delete_stored_otp(phone: str):
    if _redis_client:
        _redis_client.delete(f"otp:{phone}")
    else:
        if phone in _local_otp_store:
            _local_otp_store[phone].pop("otp", None)
            _local_otp_store[phone].pop("expires_at", None)


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return ""
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        # Constant-time response: hash the password even when rejecting to prevent timing leak
        hash_password(payload.password)
        raise HTTPException(status_code=400, detail="Registration failed. Please try a different email or login.")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        college=payload.college,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    _check_login_rate_limit(payload.email)

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Constant-time: hash a dummy password to prevent timing side-channel enumeration
        verify_password(payload.password, hash_password("dummy-constant-time-pad"))
        _record_login_failure(payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(payload.password, user.password_hash):
        _record_login_failure(payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.is_blocked_flag:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended. Please contact administrator.",
        )

    _record_login_success(payload.email)
    token = create_access_token(subject=str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/logout")
def logout(request: Request, response: Response, token: Optional[str] = Depends(oauth2_scheme)):
    raw_token = _extract_token(request, token)
    if raw_token:
        revoke_token(raw_token)
    _clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


@router.post("/otp/request")
def request_otp(
    phone: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Request OTP for phone verification. Requires authentication to prevent abuse."""
    clean_phone = "".join(c for c in phone if c.isdigit())
    if len(clean_phone) < 10 or len(clean_phone) > 15:
        raise HTTPException(
            status_code=400,
            detail="Invalid phone number format. Please provide a valid 10-15 digit phone number.",
        )

    # Check if this phone is already bound to a different user
    existing_user = db.query(User).filter(User.phone == phone, User.id != user.id).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="This phone number is already associated with another account.",
        )

    _check_otp_cooldown(phone)  # 60-second cooldown between requests
    _check_rate_limit(phone)    # 5 requests per 10-minute window

    # Cryptographically secure 6-digit OTP
    otp = f"{secrets.randbelow(1000000):06d}"
    _store_otp(phone, otp)
    # Do NOT reset failure counter on re-request (prevents brute-force cycling)
    # Output to logs in development only / hook SMS gateway in production
    if settings.ENV != "production":
        print(f"[OTP SERVICE] Verification code for {phone}: {otp}")
    return {"message": "OTP sent"}


@router.post("/otp/verify")
def verify_otp(payload: OTPVerifyRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = time.time()
    failure_entry = _local_otp_failures.get(payload.phone, {"count": 0, "first_at": now})
    total_failures = failure_entry.get("count", 0)

    # Global failure cap: 10 total attempts per phone across all OTP generations (15-min window)
    if total_failures >= 10:
        _delete_stored_otp(payload.phone)
        if now - failure_entry.get("first_at", 0) < 900:  # 15-minute lockout
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed verification attempts. This phone is temporarily locked. Please try again in 15 minutes.",
            )
        # Window expired — reset
        _local_otp_failures.pop(payload.phone, None)
        failure_entry = {"count": 0, "first_at": now}

    expected = _get_stored_otp(payload.phone)
    if expected is None or not secrets.compare_digest(expected, payload.otp):
        failure_entry["count"] = failure_entry.get("count", 0) + 1
        failure_entry.setdefault("first_at", now)
        _local_otp_failures[payload.phone] = failure_entry
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Verify ownership: only the requesting user can bind this phone
    existing_user = db.query(User).filter(User.phone == payload.phone, User.id != user.id).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="This phone number is already associated with another account.",
        )

    _local_otp_failures.pop(payload.phone, None)
    user.phone = payload.phone
    user.is_verified = True
    user.verification_method = "phone_otp"
    db.commit()
    _delete_stored_otp(payload.phone)
    return {"message": "Phone verified successfully"}


@router.patch("/me/location", response_model=UserOut)
def update_location(payload: LocationUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.latitude = payload.latitude
    user.longitude = payload.longitude
    user.location_radius_pref_km = payload.location_radius_pref_km or user.location_radius_pref_km
    user.location = ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326)
    db.commit()
    db.refresh(user)
    return user


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


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(payload: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    if payload.college is not None:
        user.college = payload.college.strip() or None
    # Security: Phone numbers CANNOT be updated via PATCH /auth/me.
    # All phone updates and bindings must go through /auth/otp/request and /auth/otp/verify.
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/avatar")
def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Rate limit: max 10 avatar uploads per minute per user to prevent storage flood/DoS
    allowed, retry_after = check_rate_limit(f"avatar_upload:{user.id}", 10, 60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many avatar upload attempts. Please wait {retry_after} seconds.",
        )

    filename = file.filename or "avatar.jpg"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_AVATAR_EXTENSIONS))}",
        )

    if file.content_type and file.content_type.lower() not in ALLOWED_AVATAR_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid MIME type '{file.content_type}'. Allowed: image/jpeg, image/png, image/webp",
        )

    content = file.file.read(MAX_AVATAR_SIZE + 1)
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=413, detail="Avatar image too large. Max 3 MB.")

    if not _validate_image_bytes(content, ext):
        raise HTTPException(status_code=400, detail="Corrupt or invalid image format.")

    key = f"avatar_{user.id}_{uuid.uuid4().hex[:8]}{ext}"

    if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
        import io
        import boto3
        s3 = boto3.client("s3", region_name=settings.AWS_REGION)
        s3.upload_fileobj(io.BytesIO(content), settings.S3_BUCKET, key, ExtraArgs={"ContentType": file.content_type or "image/jpeg"})
        url = f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    else:
        os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
        file_path = os.path.join(settings.LOCAL_STORAGE_DIR, key)
        with open(file_path, "wb") as f:
            f.write(content)
        url = f"/uploads/{key}"

    user.avatar_url = url
    db.commit()
    return {"avatar_url": url}



@router.get("/me/export")
def export_user_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """GDPR Compliance: complete personal data export in structured JSON format."""
    from app.models.product import Product
    from app.models.transaction import Transaction
    from app.models.review import Review

    products = db.query(Product).filter(Product.seller_id == user.id).all()
    transactions = db.query(Transaction).filter((Transaction.buyer_id == user.id) | (Transaction.seller_id == user.id)).all()
    reviews_written = db.query(Review).filter(Review.reviewer_id == user.id).all()
    reviews_received = db.query(Review).filter(Review.reviewee_id == user.id).all()

    return {
        "user_profile": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "college": user.college,
            "is_verified": user.is_verified,
            "avg_rating": user.avg_rating,
            "rating_count": user.rating_count,
            "created_at": str(user.created_at) if user.created_at else None,
        },
        "listings": [
            {
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "price": p.price,
                "category": p.category,
                "status": str(p.status),
                "created_at": str(p.created_at),
            }
            for p in products
        ],
        "transactions": [
            {
                "id": t.id,
                "product_id": t.product_id,
                "role": "seller" if t.seller_id == user.id else "buyer",
                "state": str(t.state),
                "agreed_price": t.agreed_price,
                "created_at": str(t.created_at),
            }
            for t in transactions
        ],
        "reviews_written": [
            {"id": r.id, "rating": r.rating, "comment": r.comment, "created_at": str(r.created_at)}
            for r in reviews_written
        ],
        "reviews_received": [
            {"id": r.id, "rating": r.rating, "comment": r.comment, "created_at": str(r.created_at)}
            for r in reviews_received
        ],
    }


@router.delete("/me")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """GDPR Compliance: permanently delete user account and clean up active resources."""
    from app.models.product import Product, ProductStatus
    from app.models.transaction import Transaction, TransactionState

    # Check for active deals
    active_tx = db.query(Transaction).filter(
        ((Transaction.buyer_id == user.id) | (Transaction.seller_id == user.id)),
        Transaction.state.in_([TransactionState.ACCEPTED, TransactionState.CONFIRMED]),
    ).first()
    if active_tx:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete account with active in-progress deals. Please complete or cancel them first.",
        )

    # Soft-remove user listings
    db.query(Product).filter(Product.seller_id == user.id).update({"status": ProductStatus.REMOVED})

    # Anonymize/delete user profile
    user.is_blocked_flag = True
    user.email = f"deleted_{user.id}_{uuid.uuid4().hex[:6]}@deleted.local"
    user.phone = None
    user.full_name = "Deleted Student"
    user.avatar_url = None
    db.commit()
    return {"message": "Account successfully closed and data anonymized."}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    # Anti-enumeration: return standard response even if email is not found
    if not user:
        return {"message": "If this email is registered, a password reset link has been dispatched."}

    token_payload = {
        "sub": str(user.id),
        "purpose": "password_reset",
        "h": user.password_hash[-10:],
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    reset_token = jwt.encode(token_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    reset_url = f"http://localhost:3000/login?reset_token={reset_token}"
    send_password_reset_email(user.email, user.full_name or "Student", reset_url)

    # Security: Never return reset tokens in HTTP API responses on running servers.
    # Output to server log only in development, or to automated test runner.
    response_data = {"message": "If this email is registered, a password reset link has been dispatched."}
    if os.getenv("PYTEST_CURRENT_TEST"):
        response_data["dev_reset_token"] = reset_token
    return response_data


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        decoded = jwt.decode(payload.token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset link.")

    if decoded.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token.")

    user_id = int(decoded.get("sub", 0))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if decoded.get("h") != user.password_hash[-10:]:
        raise HTTPException(status_code=400, detail="This reset link has already been used.")

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password reset successfully. You may now log in with your new password."}


@router.get(
    "/users/{user_id}/public-profile",
    dependencies=[Depends(rate_limit_dependency(max_requests=30, window_seconds=60))],
)
def public_profile(user_id: int, db: Session = Depends(get_db)):
    from app.models.product import Product, ProductStatus
    from app.models.review import Review

    target = db.query(User).filter(User.id == user_id).first()
    if not target or target.is_blocked_flag:
        raise HTTPException(status_code=404, detail="User not found")

    listings = (
        db.query(Product)
        .filter(Product.seller_id == user_id, Product.status == ProductStatus.ACTIVE)
        .order_by(Product.created_at.desc())
        .limit(20)
        .all()
    )

    reviews = (
        db.query(Review)
        .filter(Review.reviewee_id == user_id)
        .order_by(Review.created_at.desc())
        .limit(20)
        .all()
    )

    # Resolve reviewer names
    reviewer_ids = [r.reviewer_id for r in reviews]
    reviewers = {u.id: u for u in db.query(User).filter(User.id.in_(reviewer_ids)).all()} if reviewer_ids else {}

    return {
        "user": {
            "id": target.id,
            "full_name": target.full_name,
            "avatar_url": target.avatar_url,
            "email": _mask_email(target.email),  # PII masked for privacy
            "college": target.college,
            "is_verified": target.is_verified,
            "avg_rating": target.avg_rating,
            "rating_count": target.rating_count,
            "created_at": str(target.created_at) if target.created_at else None,
        },
        "listings": [
            {
                "id": p.id,
                "title": p.title,
                "price": p.price,
                "transaction_type": p.transaction_type.value if hasattr(p.transaction_type, "value") else str(p.transaction_type),
                "category": p.category,
                "condition": p.condition,
                "image_urls": p.image_urls or [],
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "created_at": str(p.created_at) if p.created_at else None,
            }
            for p in listings
        ],
        "reviews": [
            {
                "id": r.id,
                "rating": r.rating,
                "comment": r.comment,
                "reviewer_name": reviewers.get(r.reviewer_id, None) and reviewers[r.reviewer_id].full_name or "Anonymous",
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in reviews
        ],
    }
