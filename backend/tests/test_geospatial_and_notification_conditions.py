import pytest
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState
from app.routers.notifications import create_notification
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID


def test_multicampus_filtering_and_counts(client, user_a, user_b, db):
    # user_a is in 'Engineering College'
    # user_b is in 'Science College'
    p1 = Product(
        seller_id=user_a.id,
        title="Microcontroller Dev Kit",
        category="Electronics",
        price=700.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    p2 = Product(
        seller_id=user_b.id,
        title="Organic Chemistry Molecular Kit",
        category="Lab Equipment",
        price=400.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9720,
        longitude=77.5950,
        status=ProductStatus.ACTIVE,
    )
    db.add_all([p1, p2])
    db.commit()

    # 1. Filter by specific college
    res_eng = client.get("/products?college=Engineering")
    assert res_eng.status_code == 200
    items_eng = res_eng.json()["items"]
    assert len(items_eng) == 1
    assert items_eng[0]["title"] == "Microcontroller Dev Kit"

    res_sci = client.get("/products?college=Science")
    assert res_sci.status_code == 200
    items_sci = res_sci.json()["items"]
    assert len(items_sci) == 1
    assert items_sci[0]["title"] == "Organic Chemistry Molecular Kit"

    # 2. Filter by 'ALL' returns all active listings
    res_all = client.get("/products?college=ALL")
    assert res_all.status_code == 200
    items_all = res_all.json()["items"]
    assert len(items_all) == 2

    # 3. Campuses count summary
    res_campuses = client.get("/products/campuses")
    assert res_campuses.status_code == 200
    campuses = res_campuses.json()
    assert any(c["college"] == "Engineering College" and c["count"] == 1 for c in campuses)
    assert any(c["college"] == "Science College" and c["count"] == 1 for c in campuses)
    assert any(c["college"] == "Indian Institute of Science (IISc)" for c in campuses)


def test_geospatial_radius_and_sorting(client, user_a, user_b, db):
    # Local item in Bangalore
    p_local = Product(
        seller_id=user_a.id,
        title="Bangalore Local Bicycle",
        category="Cycles",
        price=2500.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        location=ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326),
        status=ProductStatus.ACTIVE,
    )
    # Distant item within reachable range (~38 km away)
    p_distant = Product(
        seller_id=user_b.id,
        title="Distant Campus Bicycle",
        category="Cycles",
        price=2800.0,
        transaction_type=TransactionType.BUY,
        latitude=13.3000,
        longitude=77.7000,
        location=ST_SetSRID(ST_MakePoint(77.7000, 13.3000), 4326),
        status=ProductStatus.ACTIVE,
    )
    db.add_all([p_local, p_distant])
    db.commit()

    # Search nearby Bangalore with 15km radius -> returns only local item
    res_close = client.get("/products/nearby/search?lat=12.9716&lng=77.5946&radius_km=15")
    assert res_close.status_code == 200
    items_close = res_close.json()
    assert len(items_close) == 1
    assert items_close[0]["title"] == "Bangalore Local Bicycle"

    # Search nearby Bangalore with 50km radius (< MAX_SEARCH_RADIUS_KM) -> returns both items
    res_wide = client.get("/products/nearby/search?lat=12.9716&lng=77.5946&radius_km=50&sort=distance")
    assert res_wide.status_code == 200
    items_wide = res_wide.json()
    assert len(items_wide) == 2
    # First item should be the local one (closest)
    assert items_wide[0]["title"] == "Bangalore Local Bicycle"
    assert items_wide[1]["title"] == "Distant Campus Bicycle"
    assert items_wide[0]["distance_m"] < items_wide[1]["distance_m"]

    # Radius exceeding MAX_SEARCH_RADIUS_KM (100) -> 422
    res_exceed_radius = client.get("/products/nearby/search?lat=12.9716&lng=77.5946&radius_km=150")
    assert res_exceed_radius.status_code == 422

    # Invalid sort regex validation -> 422
    res_bad_sort = client.get("/products/nearby/search?lat=12.9716&lng=77.5946&sort=unsupported_sort")
    assert res_bad_sort.status_code == 422


def test_notification_lifecycle_and_security(client, user_a, user_b, auth_headers_a, auth_headers_b, db):
    # 1. Create a notification for User A
    create_notification(
        db,
        user_id=user_a.id,
        type="NEW_OFFER",
        title="Offer Received 💰",
        message="Someone made an offer of ₹300",
        link="/deals",
    )
    db.commit()

    # User A unread count is 1, User B is 0
    res_count_a = client.get("/notifications/unread-count", headers=auth_headers_a)
    assert res_count_a.status_code == 200
    assert res_count_a.json()["count"] == 1

    res_count_b = client.get("/notifications/unread-count", headers=auth_headers_b)
    assert res_count_b.status_code == 200
    assert res_count_b.json()["count"] == 0

    # User A lists notifications
    list_a = client.get("/notifications", headers=auth_headers_a).json()
    assert len(list_a) == 1
    notif_id = list_a[0]["id"]
    assert list_a[0]["is_read"] is False

    # User B tries to mark User A's notification as read
    client.post(f"/notifications/{notif_id}/read", headers=auth_headers_b)
    # User A's notification remains unread
    res_count_a_again = client.get("/notifications/unread-count", headers=auth_headers_a)
    assert res_count_a_again.json()["count"] == 1

    # User A marks notification as read
    client.post(f"/notifications/{notif_id}/read", headers=auth_headers_a)
    res_count_a_read = client.get("/notifications/unread-count", headers=auth_headers_a)
    assert res_count_a_read.json()["count"] == 0

    # Test mark-all-read with multiple notifications
    create_notification(db, user_id=user_a.id, type="MSG1", title="Notice 1")
    create_notification(db, user_id=user_a.id, type="MSG2", title="Notice 2")
    db.commit()

    assert client.get("/notifications/unread-count", headers=auth_headers_a).json()["count"] == 2
    res_all_read = client.post("/notifications/read-all", headers=auth_headers_a)
    assert res_all_read.status_code == 200
    assert client.get("/notifications/unread-count", headers=auth_headers_a).json()["count"] == 0


def test_sustainability_metrics_and_user_impact(client, user_a, user_b, auth_headers_a, db):
    # Add products in circular economy
    p1 = Product(
        seller_id=user_a.id,
        title="Engineering Physics Textbook",
        category="Books",
        price=200.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    p2 = Product(
        seller_id=user_a.id,
        title="Desktop Monitor",
        category="Electronics",
        price=3000.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add_all([p1, p2])
    db.commit()

    # Public sustainability metrics (unauthenticated)
    res_pub = client.get("/analytics/sustainability")
    assert res_pub.status_code == 200
    pub_data = res_pub.json()
    assert "summary" in pub_data
    assert pub_data["summary"]["total_co2_saved_kg"] > 0
    assert pub_data["summary"]["trees_equivalent"] >= 0
    assert pub_data["user_impact"] is None

    # Authenticated sustainability metrics for User A
    res_user = client.get("/analytics/sustainability", headers=auth_headers_a)
    assert res_user.status_code == 200
    user_data = res_user.json()
    assert user_data["user_impact"] is not None
    assert user_data["user_impact"]["user_id"] == user_a.id
    assert user_data["user_impact"]["items_shared"] == 2
    assert "tier" in user_data["user_impact"]
