import enum
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, func, Enum, ARRAY, Text, Boolean
)
from sqlalchemy.types import UserDefinedType
from sqlalchemy.orm import relationship
from geoalchemy2 import Geography

from sqlalchemy.ext.compiler import compiles
from app.core.database import Base


class VectorType(UserDefinedType):
    def __init__(self, dimensions=1024):
        self.dimensions = dimensions

    def get_col_spec(self, **kw):
        return f"vector({self.dimensions})"


@compiles(VectorType, "sqlite")
def compile_vector_sqlite(element, compiler, **kw):
    return "TEXT"


@compiles(VectorType, "postgresql")
def compile_vector_pg(element, compiler, **kw):
    return f"vector({element.dimensions})"


class TransactionType(str, enum.Enum):
    BUY = "BUY"
    EXCHANGE = "EXCHANGE"
    RENT = "RENT"
    DONATE = "DONATE"


class ProductStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    SOLD = "SOLD"
    REMOVED = "REMOVED"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, index=True, nullable=False)
    condition = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    transaction_type = Column(Enum(TransactionType), nullable=False, index=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    pickup_area = Column(String, nullable=True)  # human-readable, hidden until deal confirmed

    image_urls = Column(ARRAY(String), default=list)
    has_3d = Column(Boolean, default=False, nullable=True)
    image_angles = Column(Text, nullable=True)  # JSON-encoded mapping of angle -> image url
    status = Column(Enum(ProductStatus), default=ProductStatus.ACTIVE, index=True)

    # Embedding vector for semantic search (BGE-M3 1024-dim)
    embedding = Column(VectorType(1024), nullable=True)

    # AI-assist fields (populated later in Step 7, nullable for now)
    ai_suggested_category = Column(String, nullable=True)
    ai_suggested_price = Column(Float, nullable=True)
    ai_suggested_description = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    seller = relationship("User")
