import io
import pickle
import pytest
from unittest.mock import Mock, MagicMock
from fastapi import Request

from app.ai.recommendation import SafeModelUnpickler
from app.schemas.transaction import MessageCreate, TransactionCreate, TransactionAction, BriefUser
from app.routers.products import _escape_like_pattern
from app.core.rate_limit import get_client_ip
from app.routers.admin import resolve_report
from app.core.security import create_access_token
from jose import jwt
from app.core.config import settings


def test_pickle_rce_exploit_blocked():
    """Verify SafeModelUnpickler refuses to deserialize dangerous system commands."""
    class Exploit:
        def __reduce__(self):
            import os
            return (os.system, ("echo hacked",))

    payload = pickle.dumps(Exploit())
    with pytest.raises(pickle.UnpicklingError):
        SafeModelUnpickler(io.BytesIO(payload)).load()


def test_chat_image_url_validation():
    """Verify chat image URLs block malicious schemes like javascript: or data:."""
    for bad_url in [
        "javascript:alert(document.cookie)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "vbscript:msgbox",
    ]:
        with pytest.raises(Exception):
            MessageCreate(content="hello", image_url=bad_url)

    valid = MessageCreate(content="Safe message", image_url="https://example.com/item.png")
    assert valid.image_url == "https://example.com/item.png"

    local_valid = MessageCreate(content="Local image", image_url="/uploads/photos/item.jpg")
    assert local_valid.image_url == "/uploads/photos/item.jpg"


def test_transaction_notes_and_action_xss_sanitization():
    """Verify stored XSS attacks in transaction notes and counter messages are sanitized."""
    xss = "<script>alert('xss')</script>"
    tx_c = TransactionCreate(product_id=1, notes=f"{xss} let's meet")
    assert "<script>" not in tx_c.notes
    assert "&lt;script&gt;" in tx_c.notes

    tx_a = TransactionAction(action="counter", counter_amount=50.0, message="<img src=x onerror=alert(1)>")
    assert "<img" not in tx_a.message
    assert "&lt;img" in tx_a.message


def test_brief_user_email_masking():
    """Verify full user emails are never leaked in BriefUser responses."""
    user1 = BriefUser(id=1, full_name="Student", email="student.fellow@college.edu")
    assert user1.email == "s************w@college.edu"
    assert "student.fellow" not in user1.email

    user2 = BriefUser(id=2, full_name="Al", email="al@domain.com")
    assert user2.email == "a*@domain.com"


def test_search_wildcard_escaping():
    """Verify SQL LIKE wildcards (%, _, \\) are escaped to prevent pattern injection."""
    raw = "%sale%_50%\\off%"
    escaped = _escape_like_pattern(raw)
    assert escaped == "\\%sale\\%\\_50\\%\\\\off\\%"


def test_rate_limiter_spoofed_ip_rejection():
    """Verify untrusted X-Forwarded-For headers are ignored unless direct peer is trusted proxy."""
    req_external = Mock(spec=Request)
    req_external.client = Mock(host="203.0.113.195")
    req_external.headers = {"X-Forwarded-For": "10.0.0.1, 192.168.1.1"}
    assert get_client_ip(req_external) == "203.0.113.195"

    req_proxy = Mock(spec=Request)
    req_proxy.client = Mock(host="127.0.0.1")
    req_proxy.headers = {"X-Forwarded-For": "198.51.100.42"}
    assert get_client_ip(req_proxy) == "198.51.100.42"


def test_admin_notes_sanitization():
    """Verify admin report resolution sanitizes notes against XSS."""
    mock_db = MagicMock()
    mock_report = MagicMock()
    mock_db.query().filter().first.return_value = mock_report

    resolve_report(report_id=1, admin_notes="<script>alert(1)</script> Note", db=mock_db)
    assert "<script>" not in mock_report.admin_notes
    assert "&lt;script&gt;" in mock_report.admin_notes


def test_token_jti_uniqueness():
    """Verify every token has a unique JTI nonce to prevent revocation collisions."""
    t1 = create_access_token("1")
    t2 = create_access_token("1")
    p1 = jwt.decode(t1, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    p2 = jwt.decode(t2, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    assert p1["jti"] != p2["jti"]
    assert t1 != t2


def test_handshake_pin_keyed_and_unpredictable():
    """Verify handshake PIN uses secret-keyed HMAC and cannot be computed from tx_id alone."""
    from app.routers.transactions import _compute_handshake_pin
    pin1 = _compute_handshake_pin(42)
    assert len(pin1) == 6
    assert pin1.isdigit()
    # Offline unkeyed sha256 hash
    import hashlib
    unkeyed_h = hashlib.sha256(b"px_handshake_42").hexdigest()
    unkeyed_pin = f"{int(unkeyed_h[:6], 16) % 900000 + 100000}"
    # The secret-keyed PIN must not match the unkeyed predictable PIN
    assert pin1 != unkeyed_pin


def test_push_endpoint_ssrf_ip_ranges():
    """Verify SSRF validation blocks private, link-local, loopback and cloud metadata endpoints."""
    from app.routers.notifications import _validate_push_endpoint
    from fastapi import HTTPException

    for bad_endpoint in [
        "https://127.0.0.1/push",
        "https://169.254.169.254/latest/meta-data",
        "https://10.0.0.5:8080/push",
        "https://192.168.1.1/push",
        "https://172.16.0.1/push",
        "http://valid-service.com/push",  # HTTP rejected
    ]:
        with pytest.raises(HTTPException):
            _validate_push_endpoint(bad_endpoint)


def test_safe_image_url_supabase():
    """Verify local and trusted CDN URLs are accepted while attacker external domains are rejected."""
    from app.routers.products import _is_safe_image_url

    assert _is_safe_image_url("https://xyzcompany.supabase.co/storage/v1/object/public/products/item1.jpg")
    assert _is_safe_image_url("https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600")
    assert _is_safe_image_url("/uploads/item1.png")
    # Arbitrary phishing / exploit sites must be rejected
    assert not _is_safe_image_url("https://malicious-phishing-site.com/image.jpg")
    assert not _is_safe_image_url("javascript:alert(1)")


def test_csv_formula_injection_sanitization():
    """Verify spreadsheet formula injection characters are neutralized with prefix quote."""
    from app.routers.admin import _sanitize_csv_cell

    assert _sanitize_csv_cell("=CMD|' /C calc'!A0") == "'=CMD|' /C calc'!A0"
    assert _sanitize_csv_cell("+SUM(1,2)") == "'+SUM(1,2)"
    assert _sanitize_csv_cell("-2+3") == "'-2+3"
    assert _sanitize_csv_cell("@secret") == "'@secret"
    assert _sanitize_csv_cell("Regular Student Name") == "Regular Student Name"
    assert _sanitize_csv_cell(123) == "123"


def test_user_update_phone_forbidden():
    """Verify UserUpdate strictly forbids extra fields including arbitrary phone modification."""
    from app.schemas.user import UserUpdate
    from pydantic import ValidationError

    # Valid profile update
    valid = UserUpdate(full_name="Valid Student", college="Campus A")
    assert valid.full_name == "Valid Student"

    # Forbid extra fields like phone or is_admin
    with pytest.raises(ValidationError):
        UserUpdate(full_name="Student", phone="+919876543210")

    with pytest.raises(ValidationError):
        UserUpdate(full_name="Student", is_admin=True)


def test_product_image_angles_validation():
    """Verify ProductCreate and ProductUpdate schemas reject unapproved 3D angle faces or untrusted URLs."""
    from app.schemas.product import ProductCreate
    from app.models.product import TransactionType
    from pydantic import ValidationError

    # Invalid angle face name
    with pytest.raises(ValidationError):
        ProductCreate(
            title="Laptop",
            category="Electronics",
            transaction_type=TransactionType.BUY,
            latitude=12.97,
            longitude=77.59,
            image_angles={"invalid_side": "/uploads/laptop.jpg"}
        )

    # Insecure URL scheme
    with pytest.raises(ValidationError):
        ProductCreate(
            title="Laptop",
            category="Electronics",
            transaction_type=TransactionType.BUY,
            latitude=12.97,
            longitude=77.59,
            image_angles={"front": "javascript:alert(1)"}
        )

    # Valid angle
    valid = ProductCreate(
        title="Laptop",
        category="Electronics",
        transaction_type=TransactionType.BUY,
        latitude=12.97,
        longitude=77.59,
        image_angles={"front": "/uploads/laptop_front.jpg", "back": "https://company.supabase.co/storage/v1/object/public/products/back.jpg"}
    )
    assert valid.image_angles["front"] == "/uploads/laptop_front.jpg"

