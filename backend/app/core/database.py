import json
import math
import sqlite3
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.ext.compiler import compiles
from geoalchemy2 import Geography
from sqlalchemy.types import ARRAY

from app.core.config import settings

Base = declarative_base()

# SQLite shims for Geography and ARRAY types (enables local execution without Docker)
@compiles(Geography, "sqlite")
def compile_geography(element, compiler, **kw):
    return "TEXT"


@compiles(ARRAY, "sqlite")
def compile_array(element, compiler, **kw):
    return "TEXT"


sqlite3.register_adapter(list, lambda l: json.dumps(l))


def _haversine(lon1, lat1, lon2, lat2):
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


def _parse_pt(pt_str):
    if not pt_str or not isinstance(pt_str, str):
        return 0.0, 0.0
    if ":" in pt_str:
        parts = pt_str.split(":")
        return float(parts[0]), float(parts[1])
    return 0.0, 0.0


def register_sqlite_functions(dbapi_connection, connection_record=None):
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
    dbapi_connection.create_function("ST_Distance", 2, lambda a, b: _haversine(*_parse_pt(a), *_parse_pt(b)))
    dbapi_connection.create_function("ST_DWithin", 3, lambda a, b, dist: 1 if _haversine(*_parse_pt(a), *_parse_pt(b)) <= float(dist) else 0)


is_sqlite = settings.DATABASE_URL.startswith("sqlite")
if is_sqlite:
    connect_args = {"check_same_thread": False}
    engine_kwargs = {}
else:
    connect_args = {}
    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    }

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, **engine_kwargs)

if is_sqlite:
    event.listens_for(engine, "connect")(register_sqlite_functions)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes local database extensions and creates all tables."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            if not is_sqlite:
                # Enable PostGIS extension for geo-spatial queries
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
                    conn.commit()
                except Exception:
                    pass
                # Enable pgvector extension for AI embeddings
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                    conn.commit()
                except Exception:
                    pass
        # Auto-create all tables in SQLite database
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass

    ensure_schema_migrations()


def ensure_schema_migrations():
    """Lightweight auto-migration for newly added model columns and tables."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            if is_sqlite:
                result = conn.execute(text("PRAGMA table_info(users)")).fetchall()
                cols = [r[1] for r in result]
                if "avatar_url" not in cols and len(cols) > 0:
                    conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))

                prod_result = conn.execute(text("PRAGMA table_info(products)")).fetchall()
                prod_cols = [r[1] for r in prod_result]
                if "has_3d" not in prod_cols and len(prod_cols) > 0:
                    conn.execute(text("ALTER TABLE products ADD COLUMN has_3d BOOLEAN DEFAULT 0"))
                if "image_angles" not in prod_cols and len(prod_cols) > 0:
                    conn.execute(text("ALTER TABLE products ADD COLUMN image_angles TEXT"))

                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS push_subscriptions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        endpoint TEXT NOT NULL UNIQUE,
                        p256dh TEXT,
                        auth TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
            else:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR;"))
                conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS has_3d BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_angles TEXT;"))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS push_subscriptions (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        endpoint TEXT NOT NULL UNIQUE,
                        p256dh TEXT,
                        auth TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );
                """))
                conn.commit()
    except Exception:
        pass


# Run initial setup
init_db()



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
