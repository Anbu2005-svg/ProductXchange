import enum
from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, func, Enum, Text, Boolean, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class TransactionState(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    COUNTERED = "COUNTERED"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


# Valid transitions enforced in services/transaction_service.py
VALID_TRANSITIONS = {
    TransactionState.PENDING: {TransactionState.ACCEPTED, TransactionState.REJECTED, TransactionState.COUNTERED, TransactionState.CANCELLED},
    TransactionState.COUNTERED: {TransactionState.ACCEPTED, TransactionState.REJECTED, TransactionState.COUNTERED, TransactionState.CANCELLED},
    TransactionState.ACCEPTED: {TransactionState.CONFIRMED, TransactionState.CANCELLED},
    TransactionState.CONFIRMED: {TransactionState.COMPLETED, TransactionState.CANCELLED},
    TransactionState.REJECTED: set(),
    TransactionState.COMPLETED: set(),
    TransactionState.CANCELLED: set(),
}


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    state = Column(Enum(TransactionState), default=TransactionState.PENDING, index=True)
    agreed_price = Column(Float, nullable=True)
    rental_period_days = Column(Integer, nullable=True)  # for RENT type
    notes = Column(Text, nullable=True)
    buyer_completed = Column(Boolean, default=False, nullable=False)
    seller_completed = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product = relationship("Product")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])
    offers = relationship("Offer", back_populates="transaction", order_by="Offer.created_at")


class Offer(Base):
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    proposed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    message = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transaction = relationship("Transaction", back_populates="offers")
