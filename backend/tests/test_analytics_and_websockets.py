import pytest
from app.models.product import Product, ProductStatus, TransactionType


def test_sustainability_analytics_public(client, db, user_a):
    """Verify that campus sustainability metrics return expected calculations publicly."""
    p1 = Product(
        seller_id=user_a.id,
        title="Engineering Mathematics Textbook",
        category="Textbooks",
        condition="Good",
        price=350.0,
        transaction_type=TransactionType.BUY,
        latitude=12.97,
        longitude=77.59,
        status=ProductStatus.ACTIVE,
    )
    p2 = Product(
        seller_id=user_a.id,
        title="Scientific Calculator fx-991EX",
        category="Electronics",
        condition="Like New",
        price=800.0,
        transaction_type=TransactionType.BUY,
        latitude=12.97,
        longitude=77.59,
        status=ProductStatus.SOLD,
    )
    db.add_all([p1, p2])
    db.commit()

    res = client.get("/analytics/sustainability")
    assert res.status_code == 200
    data = res.json()

    assert "summary" in data
    summary = data["summary"]
    assert summary["total_co2_saved_kg"] > 0
    assert summary["trees_equivalent"] >= 0
    assert summary["total_waste_diverted_kg"] > 0
    assert summary["total_rupees_saved"] > 0
    assert summary["items_circulated"] >= 2
    assert "category_distribution" in data
    assert any(c["category"] == "Textbooks" for c in data["category_distribution"])


def test_sustainability_analytics_authenticated(client, db, user_a, auth_headers_a):
    """Verify personal eco impact calculation for an authenticated user."""
    res = client.get("/analytics/sustainability", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()

    assert data["user_impact"] is not None
    assert data["user_impact"]["user_id"] == user_a.id
    assert "tier" in data["user_impact"]
    assert "co2_saved_kg" in data["user_impact"]


def test_chat_websocket_unauthorized_rejected(client):
    """Verify that websocket connection without a valid token is rejected."""
    with pytest.raises(Exception):
        with client.websocket_connect("/chat/ws/1") as ws:
            pass


def test_notifications_websocket_unauthorized_rejected(client):
    """Verify that notification websocket without token is rejected."""
    with pytest.raises(Exception):
        with client.websocket_connect("/notifications/ws") as ws:
            pass
