from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    college: Optional[str] = None
    phone: Optional[str] = None
    is_verified: bool
    is_admin: bool = False
    avg_rating: float
    rating_count: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_radius_pref_km: int

    class Config:
        from_attributes = True


class PublicUserOut(BaseModel):
    id: int
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    college: Optional[str] = None
    is_verified: bool
    avg_rating: float
    rating_count: int

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    full_name: Optional[str] = None
    college: Optional[str] = None

