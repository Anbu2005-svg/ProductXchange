import pytest
from app.models.user import User


def test_profile_update(client, auth_headers_a, db):
    res = client.patch(
        "/auth/me",
        headers=auth_headers_a,
        json={"full_name": "Updated Name", "college": "Engineering College"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Updated Name"
    assert data["college"] == "Engineering College"


def test_forgot_and_reset_password(client, user_a, db):
    # Request forgot password
    res = client.post("/auth/forgot-password", json={"email": user_a.email})
    assert res.status_code == 200
    token = res.json().get("dev_reset_token")
    assert token is not None

    # Reset password with token
    res = client.post("/auth/reset-password", json={"token": token, "new_password": "NewSecretPassword123!"})
    assert res.status_code == 200
    assert "Password reset successfully" in res.json()["message"]

    # Verify login with new password works
    login_res = client.post("/auth/login", json={"email": user_a.email, "password": "NewSecretPassword123!"})
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()


def test_gdpr_data_export(client, auth_headers_a):
    res = client.get("/auth/me/export", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()
    assert "user_profile" in data
    assert "listings" in data
    assert "transactions" in data
    assert "reviews_written" in data


def test_chat_unread_count(client, auth_headers_a):
    res = client.get("/chat/unread-count", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()
    assert "unread_count" in data
    assert isinstance(data["unread_count"], int)


def test_admin_features(client, auth_headers_admin):
    # 1. Admin Users list
    res = client.get("/admin/users", headers=auth_headers_admin)
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "users" in data

    # 2. Analytics Breakdown
    res = client.get("/admin/analytics/breakdown", headers=auth_headers_admin)
    assert res.status_code == 200
    data = res.json()
    assert "categories" in data
    assert "transaction_states" in data
    assert "transaction_types" in data

    # 3. CSV Exports
    for resource in ["users", "products", "transactions", "reports"]:
        res = client.get(f"/admin/export/{resource}", headers=auth_headers_admin)
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
        assert len(res.text) > 0
