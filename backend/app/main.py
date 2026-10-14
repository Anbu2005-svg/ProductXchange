import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import PlainTextResponse

from app.core.config import settings
from app.core.database import Base, engine, is_sqlite, init_db
from app.core.rate_limit import get_client_ip, check_rate_limit
from app.core.logging_config import StructuredLoggingMiddleware
from app.routers import auth, products, transactions, chat, trust, admin, ai, notifications, analytics
import app.models  # noqa: F401 - ensure all models are registered

# Auto-initialize database tables (SQLite local database)
init_db()

app = FastAPI(title=settings.PROJECT_NAME)


# 1. Security Headers Middleware (OWASP recommended)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: https: blob:; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 ws://localhost:8000 ws://127.0.0.1:8000; "
        "frame-ancestors 'none';"
    )
    if settings.ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


# 2. Rate Limiting Middleware for Sensitive Routes
RATE_LIMIT_RULES = {
    "/auth/register": (10, 60),       # 10 registrations / minute per IP
    "/auth/login": (25, 60),          # 25 login requests / minute per IP
    "/auth/otp/request": (5, 60),     # 5 OTP requests / minute per IP (prevents SMS toll fraud)
    "/auth/users/": (30, 60),         # 30 profile lookups / minute per IP (anti-scraping)
    "/ai/suggest-listing": (20, 60),  # 20 AI suggestions / minute per IP
    "/reports": (10, 60),             # 10 reports / minute per IP (prevents moderation spam)
    "/chat/conversations": (60, 60),  # 60 chat requests / minute per IP (anti-polling-DDoS)
    "/analytics/sustainability": (20, 60),  # 20 sustainability queries / minute per IP (anti-algorithmic-DoS)
}

@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    path = request.url.path
    for prefix, (max_reqs, window) in RATE_LIMIT_RULES.items():
        if path.startswith(prefix):
            client_ip = get_client_ip(request)
            key = f"rl:{prefix}:{client_ip}"
            allowed, retry_after = check_rate_limit(key, max_reqs, window)
            if not allowed:
                return PlainTextResponse(
                    content=f"Too many requests. Please slow down and try again in {retry_after} seconds.",
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                )
    return await call_next(request)


# 3. Structured Logging Middleware
app.add_middleware(StructuredLoggingMiddleware)

# 4. Secure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.ENV == "development" else [o for o in settings.CORS_ORIGINS if "localhost" not in o],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Total-Count", "X-Request-ID"],
)


# 4. Secure Static Files Handler (disallows script execution, dotfiles, and non-image extensions)
ALLOWED_STATIC_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

class SecureStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        # Prevent directory traversal and null-byte injection
        normalized_path = path.lower()
        if ".." in path or "\x00" in path or "%00" in normalized_path or "%2e" in normalized_path:
            return PlainTextResponse("Forbidden: invalid path sequence", status_code=403)
        ext = os.path.splitext(path)[1].lower()
        # Strictly require a valid whitelisted image extension (blocks .env, directories, scripts)
        if not ext or ext not in ALLOWED_STATIC_EXTENSIONS:
            return PlainTextResponse("Forbidden: file type not permitted", status_code=403)
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'"
        return response

os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
app.mount("/uploads", SecureStaticFiles(directory=settings.LOCAL_STORAGE_DIR, check_dir=False), name="uploads")


# 5. Application Routers
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(transactions.router)
app.include_router(chat.router)
app.include_router(trust.router)
app.include_router(admin.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(analytics.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.PROJECT_NAME}

