import io
import json
import pytest
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState
from app.models.review import Review
from app.core.security import hash_password, create_access_token
from app.ai.pricing import suggest_price


@pytest.fixture
def test_seller(db):
    user = User(
        email="master_seller@college.edu",
        password_hash=hash_password("SellerSecure123!"),
        full_name="Master Seller",
        phone="9111222333",
        college="Tech Institute",
        latitude=12.9716,
        longitude=77.5946,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_buyer(db):
    user = User(
        email="master_buyer@college.edu",
        password_hash=hash_password("BuyerSecure123!"),
        full_name="Master Buyer",
        phone="9444555666",
        college="Design Institute",
        latitude=12.9720,
        longitude=77.5950,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def seller_headers(test_seller):
    token = create_access_token(subject=str(test_seller.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def buyer_headers(test_buyer):
    token = create_access_token(subject=str(test_buyer.id))
    return {"Authorization": f"Bearer {token}"}


# -------------------------------------------------------------
# 1. AI & Vision / Pricing Assistant Feature Conditions
# -------------------------------------------------------------
def test_ai_suggest_listing_unsupported_file_extension(client, seller_headers):
    # Upload an unsupported file type (.pdf)
    fake_pdf = io.BytesIO(b"%PDF-1.4 dummy file content")
    res = client.post(
        "/ai/suggest-listing",
        files={"file": ("document.pdf", fake_pdf, "application/pdf")},
        headers=seller_headers,
    )
    assert res.status_code == 400
    assert "Only JPG, PNG, and WebP" in res.json()["detail"]


def test_ai_suggest_listing_file_too_large(client, seller_headers):
    # Upload a file larger than 5MB
    large_payload = io.BytesIO(b"\xff\xd8\xff" + b"0" * (5 * 1024 * 1024 + 10))
    res = client.post(
        "/ai/suggest-listing",
        files={"file": ("huge_image.jpg", large_payload, "image/jpeg")},
        headers=seller_headers,
    )
    assert res.status_code == 413
    assert "File too large" in res.json()["detail"]


def test_ai_suggest_listing_valid_fallback_structure(client, seller_headers):
    # Upload a valid small jpeg
    valid_jpg = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 50)
    res = client.post(
        "/ai/suggest-listing",
        files={"file": ("item.jpg", valid_jpg, "image/jpeg")},
        headers=seller_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "attributes" in data
    assert "title" in data
    assert "description" in data
    assert "suggested_price" in data


def test_ai_pricing_heuristic_median_calculation(db, test_seller, test_buyer):
    # When < 5 transactions exist, suggest_price returns None
    p1 = Product(
        seller_id=test_seller.id,
        title="Sample Book",
        category="TestBooks",
        price=100.0,
        transaction_type=TransactionType.BUY,
        latitude=12.97,
        longitude=77.59,
        status=ProductStatus.SOLD,
    )
    db.add(p1)
    db.commit()

    price_under_5 = suggest_price(db, "TestBooks", "Good")
    assert price_under_5 is None

    # Add 5 completed transactions with known prices: 100, 200, 300, 400, 500
    prices = [100.0, 200.0, 300.0, 400.0, 500.0]
    for p in prices:
        prod = Product(
            seller_id=test_seller.id,
            title=f"Completed Book {p}",
            category="TestBooks",
            price=p,
            transaction_type=TransactionType.BUY,
            latitude=12.97,
            longitude=77.59,
            status=ProductStatus.SOLD,
        )
        db.add(prod)
        db.commit()
        tx = Transaction(
            product_id=prod.id,
            buyer_id=test_buyer.id,
            seller_id=test_seller.id,
            state=TransactionState.COMPLETED,
            agreed_price=p,
        )
        db.add(tx)
    db.commit()

    # Mathematical median of [100, 200, 300, 400, 500] is 300.0
    suggested = suggest_price(db, "TestBooks", "Good")
    assert suggested == 300.0


# -------------------------------------------------------------
# 2. WebSocket Bi-Directional Protocol & Lifecycle Conditions
# -------------------------------------------------------------
def test_chat_websocket_bi_directional_ping_pong_and_typing(client, test_seller, test_buyer, seller_headers, buyer_headers):
    # Start conversation
    res_convo = client.post(
        f"/chat/conversations/start?other_user_id={test_buyer.id}",
        headers=seller_headers,
    )
    convo_id = res_convo.json()["conversation_id"]

    token_seller = seller_headers["Authorization"].split(" ")[1]

    # Connect WebSocket
    with client.websocket_connect(f"/chat/ws/{convo_id}?token={token_seller}") as ws:
        # Ping -> Pong
        ws.send_text(json.dumps({"type": "ping"}))
        pong_resp = json.loads(ws.receive_text())
        assert pong_resp["type"] == "pong"

        # Send typing notification
        ws.send_text(json.dumps({"type": "typing", "is_typing": True}))


def test_chat_websocket_unauthorized_token_rejected(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/chat/ws/1?token=invalid.forged.token"):
            pass


def test_notifications_websocket_valid_connection(client, test_seller, seller_headers):
    token_seller = seller_headers["Authorization"].split(" ")[1]
    with client.websocket_connect(f"/notifications/ws?token={token_seller}"):
        pass


# -------------------------------------------------------------
# 3. Rental & Exchange Flow Conditions
# -------------------------------------------------------------
def test_rental_transaction_full_lifecycle(client, test_seller, test_buyer, seller_headers, buyer_headers, db):
    # Create product for RENT
    rent_prod = Product(
        seller_id=test_seller.id,
        title="Scientific Graphing Calculator (Semester Rental)",
        category="Electronics",
        condition="Good",
        price=150.0,
        transaction_type=TransactionType.RENT,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(rent_prod)
    db.commit()

    # Buyer requests rental for 30 days
    tx_res = client.post(
        "/transactions",
        json={"product_id": rent_prod.id, "offer_amount": 150.0, "rental_period_days": 30, "notes": "Need for semester exam"},
        headers=buyer_headers,
    )
    assert tx_res.status_code == 200
    tx_id = tx_res.json()["id"]
    assert tx_res.json()["rental_period_days"] == 30

    # Seller accepts -> Buyer confirms -> Seller verifies PIN
    client.post(f"/transactions/{tx_id}/action", json={"action": "accept"}, headers=seller_headers)
    conf_res = client.post(f"/transactions/{tx_id}/action", json={"action": "confirm"}, headers=buyer_headers)
    pin = conf_res.json()["handshake_pin"]
    assert pin is not None

    complete_res = client.post(f"/transactions/{tx_id}/verify-handshake", json={"pin": pin}, headers=seller_headers)
    assert complete_res.status_code == 200
    assert complete_res.json()["state"] == "COMPLETED"


def test_exchange_transaction_lifecycle(client, test_seller, test_buyer, seller_headers, buyer_headers, db):
    # Create product for EXCHANGE
    exch_prod = Product(
        seller_id=test_seller.id,
        title="Mechanical Engineering Drawing Board",
        category="Stationery",
        condition="Good",
        price=0.0,
        transaction_type=TransactionType.EXCHANGE,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(exch_prod)
    db.commit()

    # Buyer offers exchange
    tx_res = client.post(
        "/transactions",
        json={"product_id": exch_prod.id, "offer_amount": 0.0, "notes": "Trading for Mini Drafter in good shape"},
        headers=buyer_headers,
    )
    assert tx_res.status_code == 200
    assert tx_res.json()["state"] == "PENDING"


# -------------------------------------------------------------
# 4. GDPR & User Account Closure Boundary Conditions
# -------------------------------------------------------------
def test_gdpr_export_data_structure(client, test_seller, seller_headers):
    res = client.get("/auth/me/export", headers=seller_headers)
    assert res.status_code == 200
    data = res.json()
    assert "user_profile" in data
    assert "listings" in data
    assert "transactions" in data
    assert "reviews_written" in data
    assert "reviews_received" in data
    assert data["user_profile"]["email"] == test_seller.email


def test_account_closure_prevented_with_active_deals(client, test_seller, test_buyer, seller_headers, buyer_headers, db):
    prod = Product(
        seller_id=test_seller.id,
        title="Active Deal Item",
        category="Books",
        price=100.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()

    tx = Transaction(
        product_id=prod.id,
        buyer_id=test_buyer.id,
        seller_id=test_seller.id,
        state=TransactionState.CONFIRMED,
        agreed_price=100.0,
    )
    db.add(tx)
    db.commit()

    # Seller attempts to close account while deal is CONFIRMED -> 400
    res_close = client.delete("/auth/me", headers=seller_headers)
    assert res_close.status_code == 400
    assert "Cannot delete account with active in-progress deals" in res_close.json()["detail"]


def test_account_closure_success_and_anonymization(client, test_buyer, buyer_headers, db):
    # Buyer has no active deals -> delete succeeds
    res_del = client.delete("/auth/me", headers=buyer_headers)
    assert res_del.status_code == 200
    assert "successfully closed" in res_del.json()["message"].lower()

    # Buyer account is blocked and anonymized
    db.refresh(test_buyer)
    assert test_buyer.is_blocked_flag is True
    assert "deleted_" in test_buyer.email
    assert test_buyer.phone is None


# -------------------------------------------------------------
# 5. Security & Rate Limiting Verification
# -------------------------------------------------------------
def test_login_brute_force_five_attempts_lockout(client, db):
    user = User(
        email="lockout_test@college.edu",
        password_hash=hash_password("RealPassword123!"),
        full_name="Lockout Target",
    )
    db.add(user)
    db.commit()

    # 5 failed attempts -> 401
    for _ in range(5):
        bad_attempt = client.post(
            "/auth/login",
            json={"email": "lockout_test@college.edu", "password": "WrongPassword!"},
        )
        assert bad_attempt.status_code == 401

    # 6th attempt triggers account lockout -> 429
    sixth_attempt = client.post(
        "/auth/login",
        json={"email": "lockout_test@college.edu", "password": "WrongPassword!"},
    )
    assert sixth_attempt.status_code == 429
    assert "locked" in sixth_attempt.json()["detail"].lower()

    # Clean up lockout state
    from app.routers.auth import _record_login_success
    _record_login_success("lockout_test@college.edu")


def test_sql_wildcard_escaping_in_search(client, test_seller, db):
    p_percent = Product(
        seller_id=test_seller.id,
        title="Premium Cotton Lab Coat",
        category="Clothing",
        price=300.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    p_normal = Product(
        seller_id=test_seller.id,
        title="Chemical Safety Goggles",
        category="Safety",
        price=150.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add_all([p_percent, p_normal])
    db.commit()

    # Search with keyword
    res = client.get("/products?q=Cotton")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Premium Cotton Lab Coat"

    # Search with SQL injection attempt "' OR '1'='1" -> treated as literal string, returns 0 items
    res_sqli = client.get("/products?q=' OR '1'='1")
    assert res_sqli.status_code == 200
    items_sqli = res_sqli.json()["items"]
    assert len(items_sqli) == 0
