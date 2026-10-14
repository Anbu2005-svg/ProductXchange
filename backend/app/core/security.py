from datetime import datetime, timedelta, timezone
from typing import Optional
import html
import re
import secrets
import time

import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

# Token blacklist store (Redis with in-memory fallback)
_redis_client = None
try:
    import redis
    _r = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    _r.ping()
    _redis_client = _r
except Exception:
    _redis_client = None

_local_revoked_tokens: dict[str, float] = {}
_last_token_prune: float = 0.0


def _prune_expired_revoked_tokens(now: float):
    """Periodically purge expired revoked tokens from in-memory blacklist."""
    global _last_token_prune
    if now - _last_token_prune < 300.0 and len(_local_revoked_tokens) < 1000:
        return
    _last_token_prune = now
    expired = [t for t, exp in _local_revoked_tokens.items() if now > exp]
    for t in expired:
        _local_revoked_tokens.pop(t, None)


def revoke_token(token: str):
    """Blacklist an access token upon user logout."""
    if not token:
        return
    now = time.time()
    ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    if _redis_client:
        try:
            _redis_client.setex(f"blacklist:{token}", ttl, "1")
            return
        except Exception:
            pass
    _prune_expired_revoked_tokens(now)
    _local_revoked_tokens[token] = now + ttl


def is_token_revoked(token: str) -> bool:
    """Check if token is blacklisted."""
    if not token:
        return False
    if _redis_client:
        try:
            if _redis_client.get(f"blacklist:{token}"):
                return True
        except Exception:
            pass
    now = time.time()
    _prune_expired_revoked_tokens(now)
    expires_at = _local_revoked_tokens.get(token)
    if expires_at is not None:
        if now > expires_at:
            _local_revoked_tokens.pop(token, None)
            return False
        return True
    return False


def sanitize_text(text: Optional[str]) -> Optional[str]:
    """Sanitize user input to prevent stored XSS attacks."""
    if text is None:
        return None
    cleaned = text.replace("\x00", "").strip()
    return html.escape(cleaned)


def validate_password_strength(password: str) -> str:
    """Validate password length and basic character diversity."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(password) > 72:
        raise ValueError("Password must not exceed 72 characters")
    if not any(c.isalpha() for c in password):
        raise ValueError("Password must contain at least one letter")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one digit")
    return password


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {"sub": subject, "exp": expire, "jti": secrets.token_hex(16)}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> str:
    if is_token_revoked(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked or logged out",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise JWTError()
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_token(request: Request, header_token: Optional[str]) -> Optional[str]:
    if header_token:
        return header_token
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        if cookie_token.startswith("Bearer "):
            return cookie_token[7:]
        return cookie_token
    return None



def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    raw_token = _extract_token(request, token)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = decode_access_token(raw_token)
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if user.is_blocked_flag:
        raise HTTPException(status_code=403, detail="User account is suspended")
    return user


def get_optional_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    raw_token = _extract_token(request, token)
    if not raw_token:
        return None
    try:
        user_id = decode_access_token(raw_token)
        uid = int(user_id)
        user = db.query(User).filter(User.id == uid).first()
        if user and not user.is_blocked_flag:
            return user
    except Exception:
        return None
    return None


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
