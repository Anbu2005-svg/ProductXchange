import pytest
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.report import Report
from app.core.security import hash_password, create_access_token


def test_admin_rbac_protection_on_all_admin_endpoints(client, user_a, auth_headers_a):
    # Regular user attempting access to admin stats -> 403
    res_stats = client.get("/admin/stats", headers=auth_headers_a)
    assert res_stats.status_code == 403

    # Regular user attempting access to admin user list -> 403
    res_users = client.get("/admin/users", headers=auth_headers_a)
    assert res_users.status_code == 403

    # Regular user attempting access to admin reports -> 403
    res_reports = client.get("/admin/reports", headers=auth_headers_a)
    assert res_reports.status_code == 403

    # Regular user attempting export -> 403
    res_export = client.get("/admin/export/users", headers=auth_headers_a)
    assert res_export.status_code == 403


def test_admin_stats_and_analytics_breakdown(client, admin_user, auth_headers_admin, user_a, db):
    # Admin stats endpoint
    res_stats = client.get("/admin/stats", headers=auth_headers_admin)
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "total_users" in stats
    assert "active_listings" in stats
    assert "open_reports" in stats

    # Analytics breakdown endpoint
    res_breakdown = client.get("/admin/analytics/breakdown", headers=auth_headers_admin)
    assert res_breakdown.status_code == 200
    breakdown = res_breakdown.json()
    assert "categories" in breakdown
    assert "transaction_states" in breakdown
    assert "transaction_types" in breakdown


def test_admin_suspend_and_unsuspend_user_flow(client, admin_user, user_b, auth_headers_admin, db):
    # 1. Admin suspends User B
    sus_res = client.post(f"/admin/users/{user_b.id}/suspend", headers=auth_headers_admin)
    assert sus_res.status_code == 200
    assert sus_res.json()["message"] == "User suspended"

    # User B login is now rejected with 403
    login_attempt = client.post(
        "/auth/login",
        json={"email": "user_b@college.edu", "password": "password123"},
    )
    assert login_attempt.status_code == 403
    assert "suspended" in login_attempt.json()["detail"].lower()

    # 2. Admin reinstates / unsuspends User B
    unsus_res = client.post(f"/admin/users/{user_b.id}/unsuspend", headers=auth_headers_admin)
    assert unsus_res.status_code == 200
    assert unsus_res.json()["message"] == "User reinstated"

    # User B can log in again successfully
    login_success = client.post(
        "/auth/login",
        json={"email": "user_b@college.edu", "password": "password123"},
    )
    assert login_success.status_code == 200
    assert "access_token" in login_success.json()


def test_admin_cannot_suspend_self_or_other_admin(client, admin_user, auth_headers_admin, db):
    # Admin tries to suspend own account -> 400
    bad_self = client.post(f"/admin/users/{admin_user.id}/suspend", headers=auth_headers_admin)
    assert bad_self.status_code == 400
    assert "own admin account" in bad_self.json()["detail"].lower()

    # Create another admin
    admin2 = User(
        email="admin2@college.edu",
        password_hash=hash_password("adminpass"),
        full_name="Admin Two",
        is_admin=True,
    )
    db.add(admin2)
    db.commit()
    db.refresh(admin2)

    # Admin 1 tries to suspend Admin 2 -> 400
    bad_other_admin = client.post(f"/admin/users/{admin2.id}/suspend", headers=auth_headers_admin)
    assert bad_other_admin.status_code == 400
    assert "cannot suspend an administrator" in bad_other_admin.json()["detail"].lower()


def test_admin_resolve_report_with_sanitized_notes(client, admin_user, user_a, user_b, auth_headers_admin, db):
    report = Report(
        reporter_id=user_a.id,
        reported_user_id=user_b.id,
        reason="Suspicious item description",
        details="User listing looks counterfeit",
        resolved=False,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Admin resolves report with notes
    res_resolve = client.post(
        f"/admin/reports/{report.id}/resolve?admin_notes=Verified%20item%20authenticity%20with%20seller",
        headers=auth_headers_admin,
    )
    assert res_resolve.status_code == 200
    assert res_resolve.json()["message"] == "Report resolved"

    db.refresh(report)
    assert report.resolved is True
    assert "Verified item authenticity" in report.admin_notes


def test_admin_csv_export_conditions(client, admin_user, user_a, auth_headers_admin, db):
    # Export users CSV
    res_u = client.get("/admin/export/users", headers=auth_headers_admin)
    assert res_u.status_code == 200
    assert "text/csv" in res_u.headers["content-type"]
    assert "ID,Email,Full Name" in res_u.text

    # Export products CSV
    res_p = client.get("/admin/export/products", headers=auth_headers_admin)
    assert res_p.status_code == 200
    assert "ID,Seller ID,Title" in res_p.text

    # Export transactions CSV
    res_t = client.get("/admin/export/transactions", headers=auth_headers_admin)
    assert res_t.status_code == 200
    assert "ID,Product ID,Buyer ID" in res_t.text

    # Export reports CSV
    res_r = client.get("/admin/export/reports", headers=auth_headers_admin)
    assert res_r.status_code == 200
    assert "ID,Reporter ID,Reported User ID" in res_r.text

    # Invalid export resource -> 400
    res_bad = client.get("/admin/export/internal_keys", headers=auth_headers_admin)
    assert res_bad.status_code == 400
    assert "Invalid resource" in res_bad.json()["detail"]


def test_auth_duplicate_registration_rejected(client, user_a):
    res_dup = client.post(
        "/auth/register",
        json={
            "email": "user_a@college.edu",
            "password": "Password123!",
            "full_name": "Duplicate A",
            "phone": "9998887776",
        },
    )
    assert res_dup.status_code == 400
    assert "registration failed" in res_dup.json()["detail"].lower()


def test_auth_password_reset_flow(client, user_a, db):
    # Request reset for valid email
    forgot_res = client.post(
        "/auth/forgot-password",
        json={"email": "user_a@college.edu"},
    )
    assert forgot_res.status_code == 200
    dev_token = forgot_res.json().get("dev_reset_token")
    assert dev_token is not None

    # Reset with invalid token -> 400
    bad_token_res = client.post(
        "/auth/reset-password",
        json={"token": "invalid.jwt.token", "new_password": "NewSecurePassword123!"},
    )
    assert bad_token_res.status_code == 400

    # Reset with valid token -> 200
    good_reset = client.post(
        "/auth/reset-password",
        json={"token": dev_token, "new_password": "NewSecurePassword123!"},
    )
    assert good_reset.status_code == 200
    assert "reset successfully" in good_reset.json()["message"].lower()

    # Reusing the same reset token is rejected (hash check invalidated)
    reused_reset = client.post(
        "/auth/reset-password",
        json={"token": dev_token, "new_password": "AnotherPassword123!"},
    )
    assert reused_reset.status_code == 400

    # Old password fails login
    old_login = client.post(
        "/auth/login",
        json={"email": "user_a@college.edu", "password": "password123"},
    )
    assert old_login.status_code == 401

    # New password succeeds login
    new_login = client.post(
        "/auth/login",
        json={"email": "user_a@college.edu", "password": "NewSecurePassword123!"},
    )
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()


def test_auth_tampered_token_rejected(client):
    tampered_headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature"}
    res = client.get("/auth/me", headers=tampered_headers)
    assert res.status_code == 401
