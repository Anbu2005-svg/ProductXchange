from typing import Optional
from datetime import datetime
import json
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.transaction import TransactionState


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    product_id: int
    offer_amount: Optional[float] = Field(None, ge=0.0, le=10000000.0)
    rental_period_days: Optional[int] = Field(None, ge=1, le=365)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("notes", mode="before")
    @classmethod
    def sanitize_notes(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v


class TransactionAction(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: str = Field(..., pattern=r"^(accept|reject|counter|confirm|complete|cancel)$")
    counter_amount: Optional[float] = Field(None, ge=0.0, le=10000000.0)
    message: Optional[str] = Field(None, max_length=1000)

    @field_validator("message", mode="before")
    @classmethod
    def sanitize_message(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v


class BriefProduct(BaseModel):
    id: int
    title: str
    price: Optional[float] = None
    transaction_type: str
    pickup_area: Optional[str] = None
    image_urls: list[str] = []
    status: str

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


class BriefUser(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str

    model_config = ConfigDict(from_attributes=True)

    @field_validator("email", mode="after")
    @classmethod
    def mask_user_email(cls, v: str) -> str:
        if not v or "@" not in v:
            return v
        parts = v.split("@")
        name, domain = parts[0], parts[1]
        if len(name) <= 2:
            masked = name[0] + "*"
        else:
            masked = name[0] + "*" * (len(name) - 2) + name[-1]
        return f"{masked}@{domain}"


class OfferOut(BaseModel):
    id: int
    proposed_by_id: int
    amount: float
    message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TransactionOut(BaseModel):
    id: int
    product_id: int
    buyer_id: int
    seller_id: int
    state: TransactionState
    agreed_price: Optional[float]
    rental_period_days: Optional[int]
    buyer_completed: bool = False
    seller_completed: bool = False
    created_at: datetime
    updated_at: datetime
    product: Optional[BriefProduct] = None
    buyer: Optional[BriefUser] = None
    seller: Optional[BriefUser] = None
    offers: list[OfferOut] = []
    handshake_pin: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HandshakeVerify(BaseModel):
    model_config = ConfigDict(extra='forbid')
    pin: str = Field(..., min_length=4, max_length=12)


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    transaction_id: int
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1500)

    @field_validator("comment", mode="before")
    @classmethod
    def sanitize_comment(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    reported_user_id: Optional[int] = None
    reported_product_id: Optional[int] = None
    reason: str = Field(..., min_length=2, max_length=100)
    details: Optional[str] = Field(None, max_length=2000)

    @field_validator("reason", "details", mode="before")
    @classmethod
    def sanitize_report(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    content: str = Field(..., min_length=1, max_length=5000)
    image_url: Optional[str] = Field(None, max_length=500)

    @field_validator("content", mode="before")
    @classmethod
    def sanitize_content(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://") or v.startswith("/uploads/")):
            raise ValueError("image_url must start with http://, https://, or /uploads/")
        return v

