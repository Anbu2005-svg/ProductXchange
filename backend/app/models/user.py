from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, func
from geoalchemy2 import Geography

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)

    college = Column(String, nullable=True)  # optional metadata, not a gate
    verification_method = Column(String, nullable=True)  # college_email | phone_otp | gov_id
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    is_blocked_flag = Column(Boolean, default=False)  # admin-level suspension

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    location_radius_pref_km = Column(Integer, default=10)

    avg_rating = Column(Float, default=0.0)
    rating_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
