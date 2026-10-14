import pytest
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState
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


def test_chat_cannot_start_conversation_with_self(client, user_a, auth_headers_a):
    res = client.post(
        f"/chat/conversations/start?other_user_id={user_a.id}",
        headers=auth_headers_a,
    )
    assert res.status_code == 400
    assert "with yourself" in res.json()["detail"].lower()


def test_chat_conversation_deduplication(client, user_a, user_b, auth_headers_a, auth_headers_b):
    res1 = client.post(
        f"/chat/conversations/start?other_user_id={user_b.id}",
        headers=auth_headers_a,
    )
    assert res1.status_code == 200
    convo_id_1 = res1.json()["conversation_id"]

    # Start again from User B to User A
    res2 = client.post(
        f"/chat/conversations/start?other_user_id={user_a.id}",
        headers=auth_headers_b,
    )
    assert res2.status_code == 200
    convo_id_2 = res2.json()["conversation_id"]

    assert convo_id_1 == convo_id_2


def test_chat_empty_or_whitespace_message_rejected(client, user_a, user_b, auth_headers_a):
    res_convo = client.post(
        f"/chat/conversations/start?other_user_id={user_b.id}",
        headers=auth_headers_a,
    )
    convo_id = res_convo.json()["conversation_id"]

    # Empty string -> 422 (min_length=1 in pydantic schema)
    res_empty = client.post(
        f"/chat/conversations/{convo_id}/messages",
        json={"content": ""},
        headers=auth_headers_a,
    )
    assert res_empty.status_code == 422

    # Whitespace only string -> 422 (sanitized to empty string, triggers min_length=1)
    res_spaces = client.post(
        f"/chat/conversations/{convo_id}/messages",
        json={"content": "     "},
        headers=auth_headers_a,
    )
    assert res_spaces.status_code == 422


def test_chat_non_participant_forbidden(client, user_a, user_b, user_c, auth_headers_a, auth_headers_c):
    res_convo = client.post(
        f"/chat/conversations/start?other_user_id={user_b.id}",
        headers=auth_headers_a,
    )
    convo_id = res_convo.json()["conversation_id"]

    # Third user tries to view messages -> 403
    res_c_read = client.get(
        f"/chat/conversations/{convo_id}/messages",
        headers=auth_headers_c,
    )
    assert res_c_read.status_code == 403
    assert "not part of this conversation" in res_c_read.json()["detail"].lower()

    # Third user tries to post a message -> 403
    res_c_send = client.post(
        f"/chat/conversations/{convo_id}/messages",
        json={"content": "Spy message"},
        headers=auth_headers_c,
    )
    assert res_c_send.status_code == 403


def test_chat_unread_count_and_marking_read(client, user_a, user_b, auth_headers_a, auth_headers_b):
    res_convo = client.post(
        f"/chat/conversations/start?other_user_id={user_b.id}",
        headers=auth_headers_a,
    )
    convo_id = res_convo.json()["conversation_id"]

    # User A sends 3 messages to User B
    client.post(f"/chat/conversations/{convo_id}/messages", json={"content": "Hi B! 1"}, headers=auth_headers_a)
    client.post(f"/chat/conversations/{convo_id}/messages", json={"content": "Hi B! 2"}, headers=auth_headers_a)
    client.post(f"/chat/conversations/{convo_id}/messages", json={"content": "Hi B! 3"}, headers=auth_headers_a)

    # Check unread count for User B -> should be 3
    unread_res = client.get("/chat/unread-count", headers=auth_headers_b)
    assert unread_res.status_code == 200
    assert unread_res.json()["unread_count"] == 3

    # User B fetches messages -> automatically marks incoming as read
    fetch_res = client.get(f"/chat/conversations/{convo_id}/messages", headers=auth_headers_b)
    assert fetch_res.status_code == 200
    assert len(fetch_res.json()) == 3

    # Check unread count for User B again -> should now be 0
    unread_after = client.get("/chat/unread-count", headers=auth_headers_b)
    assert unread_after.status_code == 200
    assert unread_after.json()["unread_count"] == 0


def test_chat_blocked_user_restrictions_and_unblock(client, user_a, user_b, auth_headers_a, auth_headers_b):
    # User A blocks User B
    block_res = client.post(f"/users/{user_b.id}/block", headers=auth_headers_a)
    assert block_res.status_code == 200

    # User B tries to start a conversation with User A -> 403
    start_bad = client.post(
        f"/chat/conversations/start?other_user_id={user_a.id}",
        headers=auth_headers_b,
    )
    assert start_bad.status_code == 403
    assert "cannot message this user" in start_bad.json()["detail"].lower()

    # User A unblocks User B
    unblock_res = client.delete(f"/users/{user_b.id}/block", headers=auth_headers_a)
    assert unblock_res.status_code == 200

    # Now User B can start conversation
    start_ok = client.post(
        f"/chat/conversations/start?other_user_id={user_a.id}",
        headers=auth_headers_b,
    )
    assert start_ok.status_code == 200


def test_review_conditions(client, user_a, user_b, user_c, auth_headers_a, auth_headers_b, auth_headers_c, db):
    prod = Product(
        seller_id=user_a.id,
        title="Engineering Drawing Kit",
        category="Stationery",
        price=300.0,
        transaction_type=TransactionType.BUY,
        latitude=12.9716,
        longitude=77.5946,
        status=ProductStatus.ACTIVE,
    )
    db.add(prod)
    db.commit()

    tx = Transaction(
        product_id=prod.id,
        buyer_id=user_b.id,
        seller_id=user_a.id,
        state=TransactionState.CONFIRMED,
        agreed_price=300.0,
    )
    db.add(tx)
    db.commit()

    # Condition: Cannot review before deal is COMPLETED
    res_premature = client.post(
        "/reviews",
        json={"transaction_id": tx.id, "rating": 5},
        headers=auth_headers_b,
    )
    assert res_premature.status_code == 400
    assert "only review completed" in res_premature.json()["detail"].lower()

    # Now mark transaction completed
    tx.state = TransactionState.COMPLETED
    db.commit()

    # Condition: Non-participant (User C) cannot review -> 403
    res_c = client.post(
        "/reviews",
        json={"transaction_id": tx.id, "rating": 5},
        headers=auth_headers_c,
    )
    assert res_c.status_code == 403
    assert "not a party" in res_c.json()["detail"].lower()

    # Condition: Rating must be 1 to 5 (0 -> 422, 6 -> 422)
    bad_rating_low = client.post(
        "/reviews",
        json={"transaction_id": tx.id, "rating": 0},
        headers=auth_headers_b,
    )
    assert bad_rating_low.status_code == 422

    bad_rating_high = client.post(
        "/reviews",
        json={"transaction_id": tx.id, "rating": 6},
        headers=auth_headers_b,
    )
    assert bad_rating_high.status_code == 422

    # Valid review
    good_review = client.post(
        "/reviews",
        json={"transaction_id": tx.id, "rating": 5, "comment": "Excellent item, flawless condition."},
        headers=auth_headers_b,
    )
    assert good_review.status_code == 200

    # User A's rating was updated
    db.refresh(user_a)
    assert user_a.avg_rating == 5.0
    assert user_a.rating_count == 1

    # Condition: Cannot review twice
    dup_review = client.post(
        "/reviews",
        json={"transaction_id": tx.id, "rating": 4},
        headers=auth_headers_b,
    )
    assert dup_review.status_code == 400
    assert "already reviewed" in dup_review.json()["detail"].lower()


def test_report_conditions(client, user_a, user_b, auth_headers_a, db):
    # Cannot report oneself -> 400
    bad_self = client.post(
        "/reports",
        json={"reported_user_id": user_a.id, "reason": "Testing self report"},
        headers=auth_headers_a,
    )
    assert bad_self.status_code == 400
    assert "cannot report yourself" in bad_self.json()["detail"].lower()

    # Cannot report without target user or product -> 400
    bad_empty = client.post(
        "/reports",
        json={"reason": "Generic complaint"},
        headers=auth_headers_a,
    )
    assert bad_empty.status_code == 400
    assert "must report a user or a listing" in bad_empty.json()["detail"].lower()

    # Valid report against User B
    good_rep = client.post(
        "/reports",
        json={"reported_user_id": user_b.id, "reason": "No show at meetup", "details": "Did not arrive at agreed time"},
        headers=auth_headers_a,
    )
    assert good_rep.status_code == 200

    # Spam duplicate report while previous is pending -> 400
    spam_rep = client.post(
        "/reports",
        json={"reported_user_id": user_b.id, "reason": "Repeated no show"},
        headers=auth_headers_a,
    )
    assert spam_rep.status_code == 400
    assert "already have an open report" in spam_rep.json()["detail"].lower()
