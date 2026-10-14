import pytest
from app.models.product import ProductStatus, TransactionType


def test_campuses_endpoint(client, auth_headers_a):
    res = client.get("/products/campuses")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Must contain preset colleges
    colleges = [c["college"] for c in data]
    assert any("RV College" in c for c in colleges)
    assert any("PES University" in c for c in colleges)


def test_3d_product_upload_and_convert(client, auth_headers_a):
    # 1. Create a listing
    create_payload = {
        "title": "TI-84 Plus CE Graphing Calculator (3D Scanned)",
        "description": "Mint condition calculator with all sides photographed for 3D inspection.",
        "category": "Lab Equipment & Calculators",
        "condition": "Like New",
        "price": 4500.0,
        "transaction_type": "BUY",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "pickup_area": "Campus Library",
        "has_3d": False,
    }
    res = client.post("/products", json=create_payload, headers=auth_headers_a)
    assert res.status_code == 200
    prod = res.json()
    product_id = prod["id"]

    # 2. Upload dummy images with angle tags
    angles = ["front", "right", "back", "left", "top", "bottom"]
    # 1x1 transparent PNG
    dummy_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"

    for angle in angles[:4]:
        files = {"file": (f"{angle}.png", dummy_png, "image/png")}
        up_res = client.post(
            f"/products/{product_id}/images?angle={angle}",
            files=files,
            headers=auth_headers_a,
        )
        assert up_res.status_code == 200

    # 3. Call 3D convert endpoint
    conv_res = client.post(
        f"/products/{product_id}/3d-convert",
        json={},
        headers=auth_headers_a,
    )
    assert conv_res.status_code == 200
    conv_data = conv_res.json()
    assert conv_data["success"] is True
    assert conv_data["has_3d"] is True
    assert len(conv_data["turntable_frames"]) >= 4
    assert "front" in conv_data["angles"]

    # 4. Fetch the product details and verify 3D fields
    get_res = client.get(f"/products/{product_id}", headers=auth_headers_a)
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert fetched["has_3d"] is True
    assert fetched["image_angles"] is not None
    assert "front" in fetched["image_angles"]

    # 5. Filter by 3D items only
    list_res = client.get("/products?has_3d=true", headers=auth_headers_a)
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert any(i["id"] == product_id for i in items)


def test_push_notification_endpoints(client, auth_headers_a):
    # 1. Get push config
    cfg_res = client.get("/notifications/push-config")
    assert cfg_res.status_code == 200
    cfg = cfg_res.json()
    assert cfg["enabled"] is True
    assert "publicKey" in cfg

    # 2. Register push subscription
    sub_payload = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/test-sub-token-12345",
        "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9Q0nA7gmSCFY04NkWy6hmUVGVo8ehNVjhfZI88",
        "auth": "tBHItJI5svbpez7KI4CCXg",
    }
    sub_res = client.post(
        "/notifications/push-subscription",
        json=sub_payload,
        headers=auth_headers_a,
    )
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "subscribed"

    # 3. Trigger test push notification
    test_res = client.post("/notifications/test-push", headers=auth_headers_a)
    assert test_res.status_code == 200
    assert test_res.json()["success"] is True
