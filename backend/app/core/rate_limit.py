import time
from typing import Optional
from fastapi import Request, HTTPException, status

from app.core.config import settings

# Redis connection with fallback to in-memory store
_redis = None
try:
    import redis
    _r = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    _r.ping()
    _redis = _r
except Exception:
    _redis = None

_local_rate_store: dict[str, list[float]] = {}
_last_cleanup: float = 0.0

# Set of IPs considered trusted reverse proxies (e.g. Nginx, local Docker network)
TRUSTED_PROXIES = {"127.0.0.1", "::1", "localhost", "testclient"}


def _prune_expired_rate_store(now: float):
    """Periodically prune expired keys to prevent memory leaks."""
    global _last_cleanup
    if now - _last_cleanup < 60.0 and len(_local_rate_store) < 5000:
        return
    _last_cleanup = now
    stale_keys = [
        k for k, timestamps in _local_rate_store.items()
        if not timestamps or timestamps[-1] < now - 3600
    ]
    for k in stale_keys:
        _local_rate_store.pop(k, None)


def get_client_ip(request: Request) -> str:
    """Extract client IP, only trusting X-Forwarded-For if request originates from a trusted proxy."""
    direct_ip = request.client.host if request.client else "127.0.0.1"
    # Only honor X-Forwarded-For if direct peer is trusted
    if direct_ip in TRUSTED_PROXIES:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return direct_ip


def check_rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int
) -> tuple[bool, int]:
    """
    Sliding window rate limiter.
    Returns (is_allowed, retry_after_seconds).
    """
    now = time.time()
    cutoff = now - window_seconds

    if _redis:
        try:
            pipe = _redis.pipeline()
            pipe.zremrangebyscore(key, 0, cutoff)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, window_seconds)
            results = pipe.execute()
            count = results[2]
            if count > max_requests:
                return False, window_seconds
            return True, 0
        except Exception:
            pass  # Fall back to in-memory

    # In-memory store
    _prune_expired_rate_store(now)
    timestamps = _local_rate_store.setdefault(key, [])
    # Evict expired timestamps
    _local_rate_store[key] = [t for t in timestamps if t > cutoff]
    if len(_local_rate_store[key]) >= max_requests:
        oldest = _local_rate_store[key][0]
        retry_after = max(1, int(oldest + window_seconds - now))
        return False, retry_after

    _local_rate_store[key].append(now)
    return True, 0


def rate_limit_dependency(max_requests: int = 60, window_seconds: int = 60):
    """Dependency for route-level rate limiting."""
    async def dependency(request: Request):
        client_ip = get_client_ip(request)
        key = f"rl:{request.url.path}:{client_ip}"
        allowed, retry_after = check_rate_limit(key, max_requests, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please slow down and try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
    return dependency
