import pytest
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState


def test_product_donate_allows_zero_or_null_price(client, user_a, auth_headers_a):
    # DONATE item with price = 0.0
    res_zero = client.post(
        "/products",
        json={
            "title": "Free Engineering Notebooks",
            "category": "Books",
            "condition": "Good",
            "price": 0.0,
            "transaction_type": "DONATE",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "pickup_area": "Library Lawn",
        },
        headers=auth_headers_a,
    )
    assert res_zero.status_code == 200
    assert res_zero.json()["price"] == 0.0
    assert res_zero.json()["transaction_type"] == "DONATE"

    # DONATE item with price = None
    res_none = client.post(
        "/products",
        json={
            "title": "Donated Lab Coat",
            "category": "Lab Gear",
            "condition": "Fair",
            "price": None,
            "transaction_type": "DONATE",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        headers=auth_headers_a,
    )
    assert res_none.status_code == 200
    assert res_none.json()["price"] is None


def test_product_title_length_and_sanitization(client, user_a, auth_headers_a):
    # Title too short (< 2 chars) -> 422
    bad_short = client.post(
        "/products",
        json={
            "title": "A",
            "category": "Books",
            "price": 50.0,
            "transaction_type": "BUY",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        headers=auth_headers_a,
    )
    assert bad_short.status_code == 422

    # Title too long (> 150 chars) -> 422
    bad_long = client.post(
        "/products",
        json={
            "title": "X" * 151,
            "category": "Books",
            "price": 50.0,
            "transaction_type": "BUY",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        headers=auth_headers_a,
    )
    assert bad_long.status_code == 422

    # XSS script tags in title & description get sanitized
    res_xss = client.post(
        "/products",
        json={
            "title": "Clean Title <script>alert(1)</script>",
            "description": "Safe desc <img src=x onerror=alert(2) />",
            "category": "Electronics",
            "price": 120.0,
            "transaction_type": "BUY",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        headers=auth_headers_a,
    )
    assert res_xss.status_code == 200
    data = res_xss.json()
    assert "<script>" not in data["title"]
    assert "&lt;script&gt;" in data["title"]
    assert "<img" not in data["description"]
    assert "&lt;img" in data["description"]


def test_product_extreme_and_boundary_coordinates(client, user_a, auth_headers_a):
    # Valid extreme boundaries (-90, 90, -180, 180)
    res_boundary = client.post(
        "/products",
        json={
            "title": "South Pole Item",
            "category": "Gear",
            "price": 100.0,
            "transaction_type": "BUY",
            "latitude": -90.0,
            "longitude": 180.0,
        },
        headers=auth_headers_a,
    )
    assert res_boundary.status_code == 200

    # Latitude out of bounds (> 90) -> 422
    bad_lat = client.post(
        "/products",
        json={
            "title": "Invalid Lat Item",
            "category": "Gear",
            "price": 100.0,
            "transaction_type": "BUY",
            "latitude": 90.0001,
            "longitude": 0.0,
        },
        headers=auth_headers_a,
    )
    assert bad_lat.status_code == 422

    # Longitude out of bounds (> 180) -> 422
    bad_lng = client.post(
        "/products",
        json={
            "title": "Invalid Lng Item",
            "category": "Gear",
            "price": 100.0,
            "transaction_type": "BUY",
            "latitude": 0.0,
            "longitude": 180.0001,
        },
        headers=auth_headers_a,
    )
    assert bad_lng.status_code == 422


def test_product_non_owner_forbidden_mutations(client, user_a, user_b, auth_headers_a, auth_headers_b, db):
    # User A creates a product
    prod = Product(
        seller_id=user_a.id,
        title="Physics Vol 1",
        category="Books",
        price=200.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    # User B tries to update it -> 403 Forbidden
    res_patch = client.patch(
        f"/products/{prod.id}",
        json={"title": "Hacked Title"},
        headers=auth_headers_b,
    )
    assert res_patch.status_code == 403
    assert "not your listing" in res_patch.json()["detail"].lower()

    # User B tries to delete it -> 403 Forbidden
    res_del = client.delete(
        f"/products/{prod.id}",
        headers=auth_headers_b,
    )
    assert res_del.status_code == 403

    # User A can successfully update
    res_owner_patch = client.patch(
        f"/products/{prod.id}",
        json={"price": 220.0},
        headers=auth_headers_a,
    )
    assert res_owner_patch.status_code == 200
    assert res_owner_patch.json()["price"] == 220.0


def test_product_freeze_on_active_negotiations(client, user_a, user_b, auth_headers_a, auth_headers_b, db):
    # Create product by User A
    prod = Product(
        seller_id=user_a.id,
        title="Scientific Calculator",
        category="Electronics",
        price=500.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    # User B makes an offer -> deal is PENDING
    tx = Transaction(
        product_id=prod.id,
        buyer_id=user_b.id,
        seller_id=user_a.id,
        state=TransactionState.PENDING,
        agreed_price=450.0,
    )
    db.add(tx)
    db.commit()

    # Seller attempts to modify price/title while negotiation is active -> 409 Conflict
    res_freeze = client.patch(
        f"/products/{prod.id}",
        json={"price": 600.0},
        headers=auth_headers_a,
    )
    assert res_freeze.status_code == 409
    assert "active negotiations" in res_freeze.json()["detail"].lower()


def test_product_bump_conditions(client, user_a, user_b, auth_headers_a, auth_headers_b, db):
    prod = Product(
        seller_id=user_a.id,
        title="Guitar Tuner",
        category="Music",
        price=150.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    # Non-owner cannot bump -> 403
    bump_bad_user = client.post(f"/products/{prod.id}/bump", headers=auth_headers_b)
    assert bump_bad_user.status_code == 403

    # Product created just now (< 24h old) -> 429
    bump_too_soon = client.post(f"/products/{prod.id}/bump", headers=auth_headers_a)
    assert bump_too_soon.status_code == 429
    assert "once every 24 hours" in bump_too_soon.json()["detail"].lower()


def test_product_soft_delete_and_lifecycle(client, user_a, user_b, auth_headers_a, db):
    prod = Product(
        seller_id=user_a.id,
        title="Old Mechanical Keyboard",
        category="Electronics",
        price=800.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    # Delete product
    res_del = client.delete(f"/products/{prod.id}", headers=auth_headers_a)
    assert res_del.status_code == 200
    assert res_del.json()["message"] == "Listing removed"

    # Verify status is REMOVED and GET returns 404
    db.refresh(prod)
    assert prod.status == ProductStatus.REMOVED

    res_get = client.get(f"/products/{prod.id}")
    assert res_get.status_code == 404

    # Removed product does not appear in listing search
    res_list = client.get("/products?category=Electronics")
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert not any(i["id"] == prod.id for i in items)


def test_product_search_and_sorting_filters(client, user_a, user_b, db):
    p1 = Product(
        seller_id=user_a.id,
        title="Economics 101 Hardcover",
        description="Introductory microeconomics",
        category="Books",
        condition="New",
        price=150.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    p2 = Product(
        seller_id=user_b.id,
        title="Advanced Calculus Paperback",
        description="University level mathematics",
        category="Books",
        condition="Good",
        price=450.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9720,
        longitude=77.5950,
        status=ProductStatus.ACTIVE,
    )
    db.add_all([p1, p2])
    db.commit()

    # Filter by min_price and max_price
    res_price = client.get("/products?min_price=200&max_price=500")
    assert res_price.status_code == 200
    items = res_price.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Advanced Calculus Paperback"

    # Filter by condition
    res_cond = client.get("/products?condition=New")
    assert res_cond.status_code == 200
    items_cond = res_cond.json()["items"]
    assert len(items_cond) == 1
    assert items_cond[0]["title"] == "Economics 101 Hardcover"

    # Search keyword
    res_q = client.get("/products?q=calculus")
    assert res_q.status_code == 200
    items_q = res_q.json()["items"]
    assert len(items_q) == 1
    assert "Calculus" in items_q[0]["title"]
