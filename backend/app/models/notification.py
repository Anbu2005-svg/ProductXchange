from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func, Text

from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # OFFER_RECEIVED, OFFER_ACCEPTED, DEAL_CONFIRMED, DEAL_COMPLETED, NEW_MESSAGE, REVIEW_RECEIVED
    title = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    link = Column(String, nullable=True)  # URL to navigate to
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
