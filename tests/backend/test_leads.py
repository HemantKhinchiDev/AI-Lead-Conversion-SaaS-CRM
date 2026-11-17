from typing import get_args

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.lead import LeadStatus
from app.services import lead_store

client = TestClient(app)

NEW_LEAD = {
    "full_name": "Test Buyer",
    "phone": "9876543210",
    "source": "Manual entry",
}


@pytest.fixture(autouse=True)
def fresh_lead_store() -> None:
    lead_store.reset_leads()


def test_get_leads_returns_dummy_dataset() -> None:
    response = client.get("/leads")

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "dummy"
    assert body["total"] == 20
    assert len(body["items"]) == 20


def test_seeded_leads_are_unique_synthetic_and_status_aligned() -> None:
    items = client.get("/leads").json()["items"]
    ids = [item["id"] for item in items]
    phones = [item["phone"] for item in items]

    assert len(ids) == len(set(ids))
    assert len(phones) == len(set(phones))
    assert all(phone.startswith("900000") for phone in phones)
    assert all(item["mode"] == "dummy" for item in items)
    assert all(item["permission"] in {"verified", "review", "excluded"} for item in items)
    assert all(item["lead_status"] in get_args(LeadStatus) for item in items)


def test_create_lead_returns_created_record() -> None:
    response = client.post("/leads", json=NEW_LEAD)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "LD-1042"
    assert body["full_name"] == "Test Buyer"
    assert body["phone"] == "9876543210"
    assert body["source"] == "Manual entry"
    assert body["permission"] == "review"
    assert body["lead_status"] == "new"
    assert body["updated_label"] == "Just now"
    assert body["mode"] == "dummy"


def test_created_lead_appears_first_in_list() -> None:
    client.post("/leads", json=NEW_LEAD)

    body = client.get("/leads").json()
    assert body["total"] == 21
    assert body["items"][0]["full_name"] == "Test Buyer"


def test_create_lead_normalises_phone() -> None:
    response = client.post("/leads", json={**NEW_LEAD, "phone": "+91 98765 43210"})

    assert response.status_code == 201
    assert response.json()["phone"] == "9876543210"


def test_create_lead_rejects_duplicate_phone() -> None:
    first = client.post("/leads", json=NEW_LEAD)
    duplicate = client.post("/leads", json={**NEW_LEAD, "full_name": "Other Buyer"})

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert client.get("/leads").json()["total"] == 21


@pytest.mark.parametrize(
    "payload",
    [
        {"full_name": "A", "phone": "9876543210"},
        {"full_name": "   ", "phone": "9876543210"},
        {"full_name": "Test Buyer", "phone": "1234567890"},
        {"full_name": "Test Buyer", "phone": "abcdefghij"},
        {"full_name": "Test Buyer", "phone": "9876543210", "source": "Unknown"},
        {"full_name": "Test Buyer", "phone": "9876543210", "permission": "verified"},
    ],
)
def test_create_lead_rejects_invalid_payload(payload: dict[str, object]) -> None:
    response = client.post("/leads", json=payload)

    assert response.status_code == 422
    assert client.get("/leads").json()["total"] == 20


def test_cors_allows_local_web_origin() -> None:
    response = client.options(
        "/leads",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_rejects_unknown_origin() -> None:
    response = client.options(
        "/leads",
        headers={
            "Origin": "https://unknown.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
