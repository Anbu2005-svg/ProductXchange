from typing import Optional, List
import json
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.product import TransactionType, ProductStatus


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    title: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=4000)
    category: str = Field(..., min_length=1, max_length=60)
    condition: Optional[str] = Field(None, max_length=50)
    price: Optional[float] = Field(None, ge=0.0, le=10000000.0)
    transaction_type: TransactionType
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    pickup_area: Optional[str] = Field(None, max_length=150)
    has_3d: Optional[bool] = False
    image_angles: Optional[dict] = None

    @field_validator("title", "description", "pickup_area", mode="before")
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v

    @field_validator("image_angles")
    @classmethod
    def validate_image_angles(cls, v):
        if not v:
            return v
        valid_angles = {"front", "right", "back", "left", "top", "bottom"}
        for k, url in v.items():
            clean_k = str(k).strip().lower()
            if clean_k not in valid_angles:
                raise ValueError(f"Invalid 3D angle face '{clean_k}'")
            if not isinstance(url, str):
                raise ValueError("Angle URL must be a string")
            u = url.strip()
            if not (u.startswith("/uploads/") or u.startswith("https://")):
                raise ValueError(f"Untrusted image URL for angle '{clean_k}'")
        return v


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    title: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=4000)
    category: Optional[str] = Field(None, max_length=60)
    condition: Optional[str] = Field(None, max_length=50)
    price: Optional[float] = Field(None, ge=0.0, le=10000000.0)
    has_3d: Optional[bool] = None
    image_angles: Optional[dict] = None

    @field_validator("title", "description", mode="before")
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v

    @field_validator("image_angles")
    @classmethod
    def validate_image_angles(cls, v):
        if not v:
            return v
        valid_angles = {"front", "right", "back", "left", "top", "bottom"}
        for k, url in v.items():
            clean_k = str(k).strip().lower()
            if clean_k not in valid_angles:
                raise ValueError(f"Invalid 3D angle face '{clean_k}'")
            if not isinstance(url, str):
                raise ValueError("Angle URL must be a string")
            u = url.strip()
            if not (u.startswith("/uploads/") or u.startswith("https://")):
                raise ValueError(f"Untrusted image URL for angle '{clean_k}'")
        return v



class ProductOut(BaseModel):
    id: int
    seller_id: int
    title: str
    description: Optional[str] = None
    category: str
    condition: Optional[str] = None
    price: Optional[float] = None
    transaction_type: TransactionType
    pickup_area: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    image_urls: List[str] = []
    has_3d: bool = False
    image_angles: Optional[dict] = None
    college: Optional[str] = None
    status: ProductStatus
    created_at: datetime
    distance_m: Optional[float] = None  # populated only by /products/nearby
    is_expired: bool = False
    days_remaining: int = 30
    can_bump: bool = False

    model_config = ConfigDict(from_attributes=True)

    @field_validator("image_urls", mode="before")
    @classmethod
    def parse_image_urls(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [v]
        return v or []

    @field_validator("image_angles", mode="before")
    @classmethod
    def parse_image_angles(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return v
