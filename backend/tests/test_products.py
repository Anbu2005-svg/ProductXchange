import pytest
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState
from app.models.report import Block


def test_product_create_and_pickup_privacy(client, user_a, user_b, auth_headers_a, auth_headers_b, db):
    # 1. Seller creates listing
    create_res = client.post(
        "/products",
        json={
            "title": "Scientific Calculator FX-991EX",
            "description": "Used for one semester",
            "category": "Electronics",
            "condition": "Good",
            "price": 800.0,
            "transaction_type": "BUY",
            "latitude": 12.971598,
            "longitude": 77.594562,
            "pickup_area": "Room 402, Block B Hostel",
        },
        headers=auth_headers_a
    )
    assert create_res.status_code == 200
    prod_data = create_res.json()
    prod_id = prod_data["id"]

    # Seller can see exact pickup location and coordinates
    assert prod_data["pickup_area"] == "Room 402, Block B Hostel"
    assert prod_data["latitude"] == 12.971598

    # 2. Another student (stranger) fetches listing
    stranger_res = client.get(f"/products/{prod_id}", headers=auth_headers_b)
    assert stranger_res.status_code == 200
    stranger_data = stranger_res.json()

    # Exact pickup area MUST be masked/hidden
    assert stranger_data["pickup_area"] is None
    # Coordinates must be blurred (rounded to 2 decimal places)
    assert stranger_data["latitude"] == 12.97
    assert stranger_data["longitude"] == 77.59

    # 3. Create a transaction that reaches CONFIRMED
    tx = Transaction(
        product_id=prod_id,
        buyer_id=user_b.id,
        seller_id=user_a.id,
        state=TransactionState.CONFIRMED,
        agreed_price=750.0,
    )
    db.add(tx)
    db.commit()

    # 4. Now buyer fetches listing again - pickup location MUST be revealed!
    confirmed_buyer_res = client.get(f"/products/{prod_id}", headers=auth_headers_b)
    assert confirmed_buyer_res.status_code == 200
    assert confirmed_buyer_res.json()["pickup_area"] == "Room 402, Block B Hostel"
    assert confirmed_buyer_res.json()["latitude"] == 12.971598


def test_blocked_users_filtered_from_search(client, user_a, user_b, auth_headers_a, auth_headers_b, db):
    # Create product by user_a
    prod = Product(
        seller_id=user_a.id,
        title="Engineering Mechanics Book",
        category="Books",
        transaction_type=TransactionType.BUY,
        price=200.0,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()

    # User B searches: product is visible
    search_res = client.get("/products", headers=auth_headers_b)
    assert search_res.status_code == 200
    res_data = search_res.json()
    items = res_data.get("items", res_data) if isinstance(res_data, dict) else res_data
    found_ids = [p["id"] for p in items]
    assert prod.id in found_ids

    # User B blocks User A
    db.add(Block(blocker_id=user_b.id, blocked_id=user_a.id))
    db.commit()

    # User B searches again: product by blocked seller must be EXCLUDED
    search_res_after = client.get("/products", headers=auth_headers_b)
    assert search_res_after.status_code == 200
    res_data_after = search_res_after.json()
    items_after = res_data_after.get("items", res_data_after) if isinstance(res_data_after, dict) else res_data_after
    found_ids_after = [p["id"] for p in items_after]
    assert prod.id not in found_ids_after


def test_nearby_search_with_distance(client, user_a, auth_headers_a, db):
    create_res = client.post(
        "/products",
        json={
            "title": "Lab Coat Size M",
            "category": "Apparel",
            "transaction_type": "DONATE",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        headers=auth_headers_a
    )
    assert create_res.status_code == 200

    # Search within 10 km around Bangalore center (12.9716, 77.5946)
    res = client.get("/products/nearby/search?lat=12.9716&lng=77.5946&radius_km=10", headers=auth_headers_a)
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    assert items[0]["title"] == "Lab Coat Size M"
    assert items[0]["distance_m"] is not None


def test_recommended_products_route(client, auth_headers_a):
    # Create a product
    client.post(
        "/products",
        json={
            "title": "Engineering Physics Book",
            "description": "Good condition",
            "category": "Books",
            "condition": "Good",
            "price": 350.0,
            "transaction_type": "BUY",
            "latitude": 12.971598,
            "longitude": 77.594562,
        },
        headers=auth_headers_a,
    )

    # Test authenticated recommendation
    res = client.get("/products/recommended", headers=auth_headers_a)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # Test unauthenticated recommendation
    res_unauth = client.get("/products/recommended")
    assert res_unauth.status_code == 200
    assert isinstance(res_unauth.json(), list)
