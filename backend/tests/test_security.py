import io
import pytest
from app.models.product import Product, ProductStatus, TransactionType


def test_security_headers_present(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("X-XSS-Protection") == "1; mode=block"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in res.headers.get("Content-Security-Policy", "")


def test_register_weak_password_rejected(client):
    # Passwords shorter than 8 characters must fail schema validation (HTTP 422)
    res = client.post("/auth/register", json={
        "email": "short_pwd@college.edu",
        "password": "123",  # only 3 chars
    })
    assert res.status_code == 422


def test_negative_price_and_coordinates_rejected(client, auth_headers_a):
    # Negative price rejected
    res = client.post("/products", headers=auth_headers_a, json={
        "title": "Invalid Product",
        "category": "Electronics",
        "transaction_type": "BUY",
        "price": -50.0,
        "latitude": 12.97,
        "longitude": 77.59,
    })
    assert res.status_code == 422

    # Invalid latitude (> 90) rejected
    res = client.post("/products", headers=auth_headers_a, json={
        "title": "Invalid Coordinates",
        "category": "Electronics",
        "transaction_type": "BUY",
        "price": 100.0,
        "latitude": 95.0,
        "longitude": 77.59,
    })
    assert res.status_code == 422


def test_public_profile_masks_email(client, user_a):
    res = client.get(f"/auth/users/{user_a.id}/public-profile")
    assert res.status_code == 200
    data = res.json()
    assert "email" in data["user"]
    # Email should be masked (e.g. u***a@college.edu), not plain
    assert data["user"]["email"] != "user_a@college.edu"
    assert "@college.edu" in data["user"]["email"]
    assert "*" in data["user"]["email"]


def test_malicious_file_upload_rejected(client, user_a, auth_headers_a, db):
    prod = Product(
        seller_id=user_a.id,
        title="Test Item for Upload",
        category="Electronics",
        transaction_type=TransactionType.BUY,
        price=100.0,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()

    # Attempt to upload .html or .php file (stored XSS / execution attempt)
    fake_html = io.BytesIO(b"<script>alert('xss')</script>")
    res = client.post(
        f"/products/{prod.id}/images",
        headers=auth_headers_a,
        files={"file": ("malicious.html", fake_html, "text/html")},
    )
    assert res.status_code == 400
    assert "Invalid file extension" in res.json()["detail"] or "Invalid MIME type" in res.json()["detail"]

    # Attempt to upload executable disguised with .jpg extension (corrupt header)
    fake_exe = io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00ThisIsNotAnImage")
    res_fake = client.post(
        f"/products/{prod.id}/images",
        headers=auth_headers_a,
        files={"file": ("fake.jpg", fake_exe, "image/jpeg")},
    )
    assert res_fake.status_code == 400
    assert "Invalid image content" in res_fake.json()["detail"]


def test_login_brute_force_lockout(client, user_a):
    # Attempt 5 consecutive failed logins
    for _ in range(5):
        client.post("/auth/login", json={"email": user_a.email, "password": "wrongpassword"})

    # 6th attempt must be locked out with HTTP 429
    res = client.post("/auth/login", json={"email": user_a.email, "password": "wrongpassword"})
    assert res.status_code == 429
    assert "locked" in res.json()["detail"].lower()

    # Reset lockout state for user_a
    from app.routers.auth import _record_login_success
    _record_login_success(user_a.email)


def test_token_revocation_on_logout(client, user_b):
    # Login as user_b to obtain fresh token
    login_res = client.post("/auth/login", json={"email": user_b.email, "password": "password123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}


    # Verify access succeeds with valid token
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200

    # Logout and revoke token
    logout_res = client.post("/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Subsequent access with the revoked token must return 401 Unauthorized
    revoked_res = client.get("/auth/me", headers=headers)
    assert revoked_res.status_code == 401
    assert "revoked" in revoked_res.json()["detail"].lower()

    # Clear test client cookies so subsequent tests start clean
    client.cookies.clear()



def test_stored_xss_sanitization(client, user_a, auth_headers_a):
    res = client.post(
        "/products",
        headers=auth_headers_a,
        json={
            "title": "<script>alert('xss')</script> Laptop",
            "description": "<img src=x onerror=alert(1)> Used condition",
            "category": "Electronics",
            "transaction_type": "BUY",
            "price": 500.0,
            "latitude": 12.97,
            "longitude": 77.59,
        }
    )
    assert res.status_code == 200
    data = res.json()
    # Malicious script tags must be HTML-escaped
    assert "<script>" not in data["title"]
    assert "&lt;script&gt;" in data["title"]
    assert "<img" not in data["description"]
    assert "&lt;img" in data["description"]


def test_admin_route_forbidden_for_regular_user(client, user_a, auth_headers_a):
    # Regular student user attempting to access admin dashboard endpoints must get 403
    stats_res = client.get("/admin/stats", headers=auth_headers_a)
    assert stats_res.status_code == 403

    reports_res = client.get("/admin/reports", headers=auth_headers_a)
    assert reports_res.status_code == 403



def test_static_file_extension_blocking(client):
    # Prohibit non-image access via static mounts
    res = client.get("/uploads/secret_script.py")
    assert res.status_code == 403
    assert "Forbidden" in res.text

