# ProductXchange spec (summary)
Multi-college, location-based student marketplace: buy/exchange/rent/donate, negotiation, chat, ratings, reports, admin.
College is optional profile metadata, not an access gate. Discovery ranks by distance (PostGIS) and later semantic similarity (BGE-M3 + pgvector).
AI assists but never publishes: suggestion -> student reviews -> accept/edit -> publish.
Trust: phone/college/ID verification, ratings, reports, blocks, exact location revealed only after a deal is confirmed.
Stack: Next.js, FastAPI, PostgreSQL+PostGIS+pgvector, Redis, S3, Docker, Terraform, GitHub Actions.
