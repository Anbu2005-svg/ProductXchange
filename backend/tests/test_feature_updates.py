from app.models.transaction import TransactionState


def test_request_id_and_structured_logging(client):
    res = client.get("/health", headers={"X-Request-ID": "test-req-12345"})
    assert res.status_code == 200
    assert res.headers.get("X-Request-ID") == "test-req-12345"


def test_products_advanced_filters_and_pagination_header(client, auth_headers_a):
    p_res = client.post("/products", json={
        "title": "Engineering Physics Textbook",
        "description": "Standard university syllabus edition",
        "category": "Textbooks & Study Material",
        "condition": "Like New",
        "price": 450.0,
        "transaction_type": "BUY",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "pickup_area": "Library Foyer",
    }, headers=auth_headers_a)
    assert p_res.status_code == 200
    prod = p_res.json()
    assert prod["days_remaining"] == 30
    assert prod["is_expired"] is False

    # Test filtering by condition and price range
    search_res = client.get(
        "/products",
        params={
            "category": "Textbooks & Study Material",
            "condition": "Like New",
            "min_price": 400,
            "max_price": 500,
        }
    )
    assert search_res.status_code == 200
    data = search_res.json()
    assert "items" in data
    assert search_res.headers.get("X-Total-Count") is not None
    assert any(item["id"] == prod["id"] for item in data["items"])

    # Test price filter exclusion
    out_of_range = client.get("/products?min_price=1000")
    assert out_of_range.status_code == 200
    assert not any(item["id"] == prod["id"] for item in out_of_range.json()["items"])


def test_handshake_pin_flow(client, auth_headers_a, auth_headers_b):
    # Seller (user_a) creates product
    p_res = client.post("/products", json={
        "title": "Scientific Calculator FX-991EX",
        "description": "Mint condition solar calculator",
        "category": "Electronics & Gadgets",
        "condition": "Mint",
        "price": 800.0,
        "transaction_type": "BUY",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "pickup_area": "Hostel Gate 2",
    }, headers=auth_headers_a)
    prod_id = p_res.json()["id"]

    # Buyer (user_b) creates transaction
    tx_res = client.post("/transactions", json={
        "product_id": prod_id,
        "offer_amount": 750.0,
        "notes": "Can meet at gate 2 today 5pm",
    }, headers=auth_headers_b)
    assert tx_res.status_code == 200
    tx_id = tx_res.json()["id"]

    # Seller accepts
    client.post(f"/transactions/{tx_id}/action", json={"action": "accept"}, headers=auth_headers_a)

    # Buyer confirms
    conf_res = client.post(f"/transactions/{tx_id}/action", json={"action": "confirm"}, headers=auth_headers_b)
    assert conf_res.status_code == 200
    tx_data = conf_res.json()
    assert tx_data["state"] == TransactionState.CONFIRMED
    assert tx_data["handshake_pin"] is not None
    pin = tx_data["handshake_pin"]

    # Security check: Seller cannot see the buyer's secret handshake PIN in /transactions/mine
    seller_mine = client.get("/transactions/mine", headers=auth_headers_a)
    assert seller_mine.status_code == 200
    seller_tx = next(t for t in seller_mine.json() if t["id"] == tx_id)
    assert seller_tx["handshake_pin"] is None

    # Security check: Buyer cannot self-verify the handshake PIN
    buyer_self_verify = client.post(f"/transactions/{tx_id}/verify-handshake", json={"pin": pin}, headers=auth_headers_b)
    assert buyer_self_verify.status_code == 403

    # Test invalid PIN rejected
    bad_pin = client.post(f"/transactions/{tx_id}/verify-handshake", json={"pin": "000000"}, headers=auth_headers_a)
    assert bad_pin.status_code == 400

    # Test valid PIN completes transaction by seller
    verify_res = client.post(f"/transactions/{tx_id}/verify-handshake", json={"pin": pin}, headers=auth_headers_a)
    assert verify_res.status_code == 200
    completed = verify_res.json()
    assert completed["state"] == TransactionState.COMPLETED
