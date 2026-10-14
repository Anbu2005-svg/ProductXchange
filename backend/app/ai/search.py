"""Step 7d: hybrid semantic + distance search (BGE-M3 + pgvector + PostGIS).
Requires: ALTER TABLE products ADD COLUMN embedding vector(1024); + ivfflat/hnsw index (new Alembic migration).
Score = 0.7 * semantic_similarity + 0.3 * proximity_score."""
import math

def embed(text: str) -> list[float]:
    from sentence_transformers import SentenceTransformer  # pip install sentence-transformers
    global _m
    try: _m
    except NameError: _m = SentenceTransformer("BAAI/bge-m3")
    return _m.encode(text, normalize_embeddings=True).tolist()

def proximity_score(distance_m: float, radius_km: float) -> float:
    return max(0.0, 1.0 - distance_m / (radius_km * 1000))

def hybrid_score(semantic_sim: float, distance_m: float, radius_km: float) -> float:
    return 0.7 * semantic_sim + 0.3 * proximity_score(distance_m, radius_km)

HYBRID_SQL = """
SELECT id, 1 - (embedding <=> CAST(:qvec AS vector)) AS sim,
       ST_Distance(location, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)::geography) AS dist
FROM products
WHERE status='ACTIVE'
  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)::geography, :radius_m)
ORDER BY embedding <=> CAST(:qvec AS vector) LIMIT 100
"""
