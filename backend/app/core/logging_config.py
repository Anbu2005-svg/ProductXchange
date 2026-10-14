import json
import logging
import sys
import time
from typing import Any, Dict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import uuid

# Configure standard JSON structured logger
logger = logging.getLogger("productxchange")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Structured request logging middleware:
    - Attaches a unique X-Request-ID correlation header
    - Logs JSON metadata with path, status_code, client_ip, and latency_ms
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start_time = time.perf_counter()

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        method = request.method

        response: Response = await call_next(request)

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id

        # Skip high-frequency static asset polls from flooding the log
        if not path.startswith("/uploads"):
            log_payload = {
                "request_id": request_id,
                "method": method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client_ip": client_ip,
            }
            logger.info(json.dumps(log_payload))

        return response
