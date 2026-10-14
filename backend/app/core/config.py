import os
from pydantic_settings import BaseSettings

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DEFAULT_SQLITE_PATH = os.path.join(BACKEND_DIR, "productxchange.db").replace("\\", "/")


class Settings(BaseSettings):
    # Core
    PROJECT_NAME: str = "ProductXchange"
    ENV: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Local Database (defaults to local SQLite file in backend/productxchange.db)
    DATABASE_URL: str = f"sqlite:///{DEFAULT_SQLITE_PATH}"

    # Redis (with automatic in-memory fallback for local development)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    JWT_SECRET: str = "CHANGE_ME_IN_PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Local Storage
    STORAGE_BACKEND: str = "local"  # "local" or "s3"
    LOCAL_STORAGE_DIR: str = os.path.join(BACKEND_DIR, "uploads")
    S3_BUCKET: str = ""
    AWS_REGION: str = "ap-south-1"

    # Discovery defaults
    DEFAULT_SEARCH_RADIUS_KM: int = 10
    MAX_SEARCH_RADIUS_KM: int = 100

    class Config:
        env_file = (os.path.join(BACKEND_DIR, ".env"), ".env")


settings = Settings()

# Security check: fail-fast if default JWT secret is used in production
if settings.ENV == "production" and (settings.JWT_SECRET in ("CHANGE_ME_IN_PRODUCTION", "anbu-productxchange-secret-key-2026") or len(settings.JWT_SECRET) < 32):
    raise ValueError("CRITICAL SECURITY ERROR: Insecure or default JWT_SECRET detected in production! Set a random 32+ character secret.")

# Normalize relative sqlite paths to always point to backend/productxchange.db
if settings.DATABASE_URL in ("sqlite:///./productxchange.db", "sqlite:///productxchange.db"):
    settings.DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"

# Normalize LOCAL_STORAGE_DIR to always point to backend/uploads
if not os.path.isabs(settings.LOCAL_STORAGE_DIR) or settings.LOCAL_STORAGE_DIR in ("./uploads", "uploads"):
    settings.LOCAL_STORAGE_DIR = os.path.join(BACKEND_DIR, "uploads")
