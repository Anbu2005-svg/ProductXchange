import pytest
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import TransactionState


@pytest.fixture
def product(db, user_a):
    prod = Product(
        seller_id=user_a.id,
        title="Data Structures Textbook",
        description="Like new condition, 3rd edition",
        category="Books",
        condition="Like New",
        price=350.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        pickup_area="Main Library Gate",
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


def test_transaction_full_lifecycle(client, user_a, user_b, auth_headers_a, auth_headers_b, product, db):
    # 1. Seller cannot transact on own product
    bad_self_tx = client.post(
        "/transactions",
        json={"product_id": product.id, "offer_amount": 300.0},
        headers=auth_headers_a
    )
    assert bad_self_tx.status_code == 400

    # 2. Buyer creates transaction with offer (300.0)
    tx_res = client.post(
        "/transactions",
        json={"product_id": product.id, "offer_amount": 300.0, "notes": "Can pickup today"},
        headers=auth_headers_b
    )
    assert tx_res.status_code == 200
    tx_data = tx_res.json()
    tx_id = tx_data["id"]
    assert tx_data["state"] == "PENDING"
    assert tx_data["agreed_price"] == 300.0
    assert tx_data["buyer_completed"] is False
    assert tx_data["seller_completed"] is False

    # 3. Buyer CANNOT accept their own offer (Authorization check)
    bad_accept = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_b
    )
    assert bad_accept.status_code == 403
    assert "awaiting response" in bad_accept.json()["detail"].lower()

    # 4. Buyer CANNOT counter their own offer
    bad_counter = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 320.0},
        headers=auth_headers_b
    )
    assert bad_counter.status_code == 403

    # 5. Seller counters with 330.0
    counter_res = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 330.0, "message": "Best I can do is 330"},
        headers=auth_headers_a
    )
    assert counter_res.status_code == 200
    assert counter_res.json()["state"] == "COUNTERED"
    assert counter_res.json()["agreed_price"] == 330.0

    # 6. Seller CANNOT accept their own counter-offer
    seller_bad_accept = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_a
    )
    assert seller_bad_accept.status_code == 403

    # 7. Buyer accepts the counter-offer
    buyer_accept = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_b
    )
    assert buyer_accept.status_code == 200
    assert buyer_accept.json()["state"] == "ACCEPTED"

    # 8. Confirm transaction
    confirm_res = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "confirm"},
        headers=auth_headers_b
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["state"] == "CONFIRMED"

    # 9. Double-party completion
    # Buyer marks complete first
    buyer_comp = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "complete"},
        headers=auth_headers_b
    )
    assert buyer_comp.status_code == 200
    assert buyer_comp.json()["buyer_completed"] is True
    assert buyer_comp.json()["seller_completed"] is False
    # Transaction should still be CONFIRMED until seller also confirms
    assert buyer_comp.json()["state"] == "CONFIRMED"

    # Seller marks complete
    seller_comp = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "complete"},
        headers=auth_headers_a
    )
    assert seller_comp.status_code == 200
    assert seller_comp.json()["buyer_completed"] is True
    assert seller_comp.json()["seller_completed"] is True
    # Now state must be COMPLETED
    assert seller_comp.json()["state"] == "COMPLETED"

    # Product status should be updated to SOLD
    db.refresh(product)
    assert product.status == ProductStatus.SOLD


def test_transaction_cancellation(client, user_a, user_b, auth_headers_a, auth_headers_b, product):
    tx_res = client.post(
        "/transactions",
        json={"product_id": product.id, "offer_amount": 250.0},
        headers=auth_headers_b
    )
    tx_id = tx_res.json()["id"]

    # Either party can cancel prior to completion
    cancel_res = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "cancel"},
        headers=auth_headers_b
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["state"] == "CANCELLED"


def test_transaction_double_review_and_rating(client, user_a, user_b, auth_headers_a, auth_headers_b, product, db):
    # Setup completed transaction
    tx_res = client.post("/transactions", json={"product_id": product.id, "offer_amount": 300.0}, headers=auth_headers_b)
    tx_id = tx_res.json()["id"]

    client.post(f"/transactions/{tx_id}/action", json={"action": "accept"}, headers=auth_headers_a)
    client.post(f"/transactions/{tx_id}/action", json={"action": "confirm"}, headers=auth_headers_b)
    client.post(f"/transactions/{tx_id}/action", json={"action": "complete"}, headers=auth_headers_b)
    client.post(f"/transactions/{tx_id}/action", json={"action": "complete"}, headers=auth_headers_a)

    # 1. Buyer reviews seller
    rev_buyer = client.post("/reviews", json={"transaction_id": tx_id, "rating": 5, "comment": "Great seller!"}, headers=auth_headers_b)
    assert rev_buyer.status_code == 200

    # 2. Buyer cannot review twice
    rev_buyer_dup = client.post("/reviews", json={"transaction_id": tx_id, "rating": 4}, headers=auth_headers_b)
    assert rev_buyer_dup.status_code == 400

    # 3. Seller reviews buyer
    rev_seller = client.post("/reviews", json={"transaction_id": tx_id, "rating": 4, "comment": "Quick payment and meetup."}, headers=auth_headers_a)
    assert rev_seller.status_code == 200

    # 4. Seller cannot review twice
    rev_seller_dup = client.post("/reviews", json={"transaction_id": tx_id, "rating": 5}, headers=auth_headers_a)
    assert rev_seller_dup.status_code == 400

    # Verify ratings updated on both users
    db.refresh(user_a)
    db.refresh(user_b)
    assert user_a.rating_count == 1
    assert user_a.avg_rating == 5.0
    assert user_b.rating_count == 1
    assert user_b.avg_rating == 4.0
