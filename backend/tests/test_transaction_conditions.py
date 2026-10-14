import pytest
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import TransactionState
from app.core.security import hash_password, create_access_token


@pytest.fixture
def user_c(db):
    user = User(
        email="user_c@college.edu",
        password_hash=hash_password("password123"),
        full_name="User C",
        college="Arts College",
        latitude=12.9725,
        longitude=77.5955,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers_c(user_c):
    token = create_access_token(subject=str(user_c.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_product(db, user_a):
    prod = Product(
        seller_id=user_a.id,
        title="Digital Multimeter",
        category="Electronics",
        condition="Like New",
        price=600.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        pickup_area="Electronics Lab Block B",
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


def test_cannot_transact_on_nonexistent_or_own_product(client, user_a, user_b, auth_headers_a, auth_headers_b, test_product):
    # Non-existent product -> 404
    bad_prod = client.post(
        "/transactions",
        json={"product_id": 999999, "offer_amount": 500.0},
        headers=auth_headers_b,
    )
    assert bad_prod.status_code == 404

    # Own product -> 400
    bad_self = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 500.0},
        headers=auth_headers_a,
    )
    assert bad_self.status_code == 400
    assert "own listing" in bad_self.json()["detail"].lower()


def test_duplicate_active_transaction_prevented(client, user_a, user_b, auth_headers_b, test_product):
    # First transaction created
    res1 = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 500.0},
        headers=auth_headers_b,
    )
    assert res1.status_code == 200

    # Second transaction by same buyer on same product -> 400
    res2 = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 550.0},
        headers=auth_headers_b,
    )
    assert res2.status_code == 400
    assert "active negotiation" in res2.json()["detail"].lower()


def test_third_party_forbidden_from_acting_on_transaction(client, user_a, user_b, user_c, auth_headers_b, auth_headers_c, test_product):
    tx_res = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 500.0},
        headers=auth_headers_b,
    )
    tx_id = tx_res.json()["id"]

    # User C tries to accept -> 403 Forbidden
    res_c_accept = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_c,
    )
    assert res_c_accept.status_code == 403
    assert "not a party" in res_c_accept.json()["detail"].lower()

    # User C tries to counter -> 403 Forbidden
    res_c_counter = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 550.0},
        headers=auth_headers_c,
    )
    assert res_c_counter.status_code == 403

    # User C tries to cancel -> 403 Forbidden
    res_c_cancel = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "cancel"},
        headers=auth_headers_c,
    )
    assert res_c_cancel.status_code == 403


def test_multi_round_counter_offer_alternation(client, user_a, user_b, auth_headers_a, auth_headers_b, test_product):
    # Round 1: Buyer offers 500
    res = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 500.0},
        headers=auth_headers_b,
    )
    tx_id = res.json()["id"]

    # Round 2: Seller counters 580
    res_s1 = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 580.0, "message": "Can do 580"},
        headers=auth_headers_a,
    )
    assert res_s1.status_code == 200
    assert res_s1.json()["state"] == "COUNTERED"
    assert res_s1.json()["agreed_price"] == 580.0

    # Seller tries to counter again before buyer responds -> 403
    res_s_repeat = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 570.0},
        headers=auth_headers_a,
    )
    assert res_s_repeat.status_code == 403

    # Round 3: Buyer counters 540
    res_b2 = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 540.0, "message": "Meet me at 540"},
        headers=auth_headers_b,
    )
    assert res_b2.status_code == 200
    assert res_b2.json()["agreed_price"] == 540.0

    # Buyer cannot accept their own counter
    res_b_accept = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_b,
    )
    assert res_b_accept.status_code == 403

    # Round 4: Seller counters 550
    res_s2 = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "counter", "counter_amount": 550.0, "message": "Deal at 550?"},
        headers=auth_headers_a,
    )
    assert res_s2.status_code == 200

    # Buyer accepts 550
    res_b_accept_ok = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_b,
    )
    assert res_b_accept_ok.status_code == 200
    assert res_b_accept_ok.json()["state"] == "ACCEPTED"
    assert res_b_accept_ok.json()["agreed_price"] == 550.0

    # Check offers history contains all 4 rounds
    tx_data = res_b_accept_ok.json()
    assert len(tx_data["offers"]) == 4


def test_invalid_state_machine_jumps(client, user_a, user_b, auth_headers_a, auth_headers_b, test_product):
    res = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 500.0},
        headers=auth_headers_b,
    )
    tx_id = res.json()["id"]

    # Cannot jump from PENDING directly to CONFIRMED
    bad_confirm = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "confirm"},
        headers=auth_headers_b,
    )
    assert bad_confirm.status_code == 409

    # Cannot jump from PENDING directly to COMPLETE
    bad_complete = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "complete"},
        headers=auth_headers_b,
    )
    assert bad_complete.status_code == 409

    # Seller accepts -> ACCEPTED
    client.post(f"/transactions/{tx_id}/action", json={"action": "accept"}, headers=auth_headers_a)

    # Cannot jump from ACCEPTED directly to COMPLETE (must be CONFIRMED first)
    bad_comp_accepted = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "complete"},
        headers=auth_headers_a,
    )
    assert bad_comp_accepted.status_code == 409


def test_handshake_pin_visibility_and_verification_conditions(client, user_a, user_b, auth_headers_a, auth_headers_b, test_product, db):
    # 1. Initiate transaction
    tx_res = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 500.0},
        headers=auth_headers_b,
    )
    tx_id = tx_res.json()["id"]

    # During PENDING: handshake PIN is null for both buyer and seller
    assert tx_res.json()["handshake_pin"] is None

    # Seller views transaction in mine list -> PIN is null
    s_mine = client.get("/transactions/mine", headers=auth_headers_a).json()
    tx_s = next(t for t in s_mine if t["id"] == tx_id)
    assert tx_s["handshake_pin"] is None

    # Seller accepts deal
    client.post(f"/transactions/{tx_id}/action", json={"action": "accept"}, headers=auth_headers_a)

    # Buyer confirms deal -> CONFIRMED
    conf_res = client.post(f"/transactions/{tx_id}/action", json={"action": "confirm"}, headers=auth_headers_b)
    assert conf_res.status_code == 200
    assert conf_res.json()["state"] == "CONFIRMED"

    # In CONFIRMED state: Handshake PIN is visible to BUYER
    buyer_pin = conf_res.json()["handshake_pin"]
    assert buyer_pin is not None
    assert len(buyer_pin) == 6
    assert buyer_pin.isdigit()

    # In CONFIRMED state: Handshake PIN is STILL null to SELLER
    s_mine_conf = client.get("/transactions/mine", headers=auth_headers_a).json()
    tx_s_conf = next(t for t in s_mine_conf if t["id"] == tx_id)
    assert tx_s_conf["handshake_pin"] is None

    # Condition: Buyer cannot call verify-handshake (only seller verifies)
    buyer_verify_attempt = client.post(
        f"/transactions/{tx_id}/verify-handshake",
        json={"pin": buyer_pin},
        headers=auth_headers_b,
    )
    assert buyer_verify_attempt.status_code == 403
    assert "only the seller can verify" in buyer_verify_attempt.json()["detail"].lower()

    # Condition: Seller enters wrong PIN -> 400
    wrong_pin_res = client.post(
        f"/transactions/{tx_id}/verify-handshake",
        json={"pin": "000000"},
        headers=auth_headers_a,
    )
    assert wrong_pin_res.status_code == 400
    assert "invalid handshake pin" in wrong_pin_res.json()["detail"].lower()

    # Condition: Seller enters correct PIN -> success, completes deal and marks product SOLD
    good_verify = client.post(
        f"/transactions/{tx_id}/verify-handshake",
        json={"pin": buyer_pin},
        headers=auth_headers_a,
    )
    assert good_verify.status_code == 200
    data = good_verify.json()
    assert data["state"] == "COMPLETED"
    assert data["buyer_completed"] is True
    assert data["seller_completed"] is True

    # Product should now be SOLD
    db.refresh(test_product)
    assert test_product.status == ProductStatus.SOLD


def test_rejection_flow_is_terminal(client, user_a, user_b, auth_headers_a, auth_headers_b, test_product):
    res = client.post(
        "/transactions",
        json={"product_id": test_product.id, "offer_amount": 300.0},
        headers=auth_headers_b,
    )
    tx_id = res.json()["id"]

    # Seller rejects offer
    rej_res = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "reject"},
        headers=auth_headers_a,
    )
    assert rej_res.status_code == 200
    assert rej_res.json()["state"] == "REJECTED"

    # Neither buyer nor seller can confirm or counter a REJECTED deal
    bad_post_rej = client.post(
        f"/transactions/{tx_id}/action",
        json={"action": "accept"},
        headers=auth_headers_b,
    )
    assert bad_post_rej.status_code == 409
