from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72, description="Password must be between 8 and 72 characters")
    full_name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    college: Optional[str] = Field(None, max_length=150)

    @field_validator("password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        from app.core.security import validate_password_strength
        return validate_password_strength(v)

    @field_validator("full_name", "college", "phone", mode="before")
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            from app.core.security import sanitize_text
            return sanitize_text(v)
        return v



class LoginRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OTPVerifyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    phone: str = Field(..., min_length=5, max_length=20)
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


class LocationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_radius_pref_km: Optional[int] = Field(10, ge=1, le=100)

