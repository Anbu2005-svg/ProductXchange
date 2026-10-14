def test_register_and_login(client):
    # Register
    reg_res = client.post("/auth/register", json={
        "email": "student1@example.com",
        "password": "secretpassword1",
        "full_name": "Student One",
        "phone": "9998887771",
        "college": "Tech Institute"
    })
    assert reg_res.status_code == 200
    data = reg_res.json()
    assert "access_token" in data
    # Verify cookie was set
    assert "access_token" in reg_res.cookies

    # Duplicate registration should fail (generic message to prevent enumeration)
    dup_res = client.post("/auth/register", json={
        "email": "student1@example.com",
        "password": "secretpassword1",
    })
    assert dup_res.status_code == 400
    assert "registration failed" in dup_res.json()["detail"].lower() or "try a different" in dup_res.json()["detail"].lower()

    # Login
    login_res = client.post("/auth/login", json={
        "email": "student1@example.com",
        "password": "secretpassword1",
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()
    assert "access_token" in login_res.cookies

    # Login with wrong password
    bad_res = client.post("/auth/login", json={
        "email": "student1@example.com",
        "password": "wrongpassword",
    })
    assert bad_res.status_code == 401
    client.cookies.clear()


def test_blocked_user_cannot_login(client, user_a, db):
    user_a.is_blocked_flag = True
    db.commit()

    res = client.post("/auth/login", json={
        "email": user_a.email,
        "password": "password123",
    })
    assert res.status_code == 403
    assert "suspended" in res.json()["detail"].lower()
    client.cookies.clear()


def test_logout(client):
    res = client.post("/auth/logout")
    assert res.status_code == 200
    assert res.json()["message"] == "Logged out successfully"
    client.cookies.clear()



def test_otp_flow(client, user_a, auth_headers_a):
    phone = "9876543210"

    # Request OTP (now requires authentication)
    req_res = client.post(f"/auth/otp/request?phone={phone}", headers=auth_headers_a)
    assert req_res.status_code == 200
    assert req_res.json()["message"] == "OTP sent"

    # Invalid OTP verification
    bad_verify = client.post(
        "/auth/otp/verify",
        json={"phone": phone, "otp": "000000"},
        headers=auth_headers_a
    )
    assert bad_verify.status_code == 400


def test_user_me_and_location_update(client, user_a, auth_headers_a):
    # Fetch current user
    me_res = client.get("/auth/me", headers=auth_headers_a)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == user_a.email

    # Update location
    loc_res = client.patch(
        "/auth/me/location",
        json={"latitude": 13.0827, "longitude": 80.2707, "location_radius_pref_km": 15},
        headers=auth_headers_a
    )
    assert loc_res.status_code == 200
    assert loc_res.json()["latitude"] == 13.0827
    assert loc_res.json()["longitude"] == 80.2707
    assert loc_res.json()["location_radius_pref_km"] == 15
