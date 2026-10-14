import os
import math
import pytest
from fastapi.testclient import TestClient
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.ext.compiler import compiles
from geoalchemy2 import Geography
from sqlalchemy.types import ARRAY, Text

# Set test environment
os.environ["ENV"] = "development"
os.environ["JWT_SECRET"] = "test-secret-key-12345"

from app.main import app
from app.core.database import get_db, Base
from app.core.security import hash_password, create_access_token
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState, Offer
from app.models.report import Block


# Enable SQLite support for Geography and ARRAY types
@compiles(Geography, "sqlite")
def compile_geography(element, compiler, **kw):
    return "TEXT"


@compiles(ARRAY, "sqlite")
def compile_array(element, compiler, **kw):
    return "TEXT"


def haversine(lon1, lat1, lon2, lat2):
    try:
        lon1, lat1, lon2, lat2 = float(lon1), float(lat1), float(lon2), float(lat2)
    except (ValueError, TypeError):
        return 0.0
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_pt(pt_str):
    if not pt_str or not isinstance(pt_str, str):
        return 0.0, 0.0
    if ":" in pt_str:
        parts = pt_str.split(":")
        return float(parts[0]), float(parts[1])
    return 0.0, 0.0


import sqlite3
import json

sqlite3.register_adapter(list, lambda l: json.dumps(l))

# In-memory test engine with StaticPool so all threads and requests share the same DB
from sqlalchemy.pool import StaticPool
engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


@sa.event.listens_for(engine, "connect")
def register_sqlite_functions(dbapi_connection, connection_record):
    dbapi_connection.create_function("CreateSpatialIndex", 2, lambda a, b: 1)
    dbapi_connection.create_function("InitSpatialMetaData", 0, lambda: 1)
    dbapi_connection.create_function("AsBinary", 1, lambda a: a.encode("utf-8") if isinstance(a, str) else (a or b""))
    dbapi_connection.create_function("GeomFromWKB", 1, lambda a: a.decode("utf-8") if isinstance(a, bytes) else (a or ""))
    dbapi_connection.create_function("GeomFromText", 1, lambda a: a)
    dbapi_connection.create_function("ST_GeogFromText", 1, lambda a: a)
    dbapi_connection.create_function("ST_GeomFromText", 1, lambda a: a)
    dbapi_connection.create_function("ST_GeogFromWKB", 1, lambda a: a)
    dbapi_connection.create_function("ST_AsBinary", 1, lambda a: a.encode("utf-8") if isinstance(a, str) else (a or b""))
    dbapi_connection.create_function("ST_AsText", 1, lambda a: a if isinstance(a, str) else (a.decode("utf-8", "ignore") if isinstance(a, bytes) else str(a)))
    dbapi_connection.create_function("ST_SetSRID", 2, lambda a, b: a)
    dbapi_connection.create_function("ST_MakePoint", 2, lambda lng, lat: f"{lng}:{lat}")
    dbapi_connection.create_function(
        "ST_Distance", 2,
        lambda a, b: haversine(*parse_pt(a), *parse_pt(b))
    )
    dbapi_connection.create_function(
        "ST_DWithin", 3,
        lambda a, b, dist: 1 if haversine(*parse_pt(a), *parse_pt(b)) <= float(dist) else 0
    )


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_tables(db):
    yield
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()


@pytest.fixture
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def user_a(db):
    user = User(
        email="user_a@college.edu",
        password_hash=hash_password("password123"),
        full_name="User A",
        phone="9876543210",
        college="Engineering College",
        latitude=12.9716,
        longitude=77.5946,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def user_b(db):
    user = User(
        email="user_b@college.edu",
        password_hash=hash_password("password123"),
        full_name="User B",
        phone="9876543211",
        college="Science College",
        latitude=12.9720,
        longitude=77.5950,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_user(db):
    user = User(
        email="admin@college.edu",
        password_hash=hash_password("adminpass"),
        full_name="Admin",
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers_a(user_a):
    token = create_access_token(subject=str(user_a.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_b(user_b):
    token = create_access_token(subject=str(user_b.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_admin(admin_user):
    token = create_access_token(subject=str(admin_user.id))
    return {"Authorization": f"Bearer {token}"}
