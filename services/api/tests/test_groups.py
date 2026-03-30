import os
import tempfile

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import get_conn, init_db
from app.main import app
from tests.conftest import seed_canonical_sets

client = TestClient(app)


def setup_module() -> None:
    temp_dir = tempfile.mkdtemp(prefix="coachella-api-groups-")
    settings.sqlite_path = os.path.join(temp_dir, "test.db")
    init_db()


def _create_group(group_name: str, display_name: str) -> dict:
    response = client.post(
        "/v1/groups",
        json={"group_name": group_name, "display_name": display_name},
    )
    assert response.status_code == 200
    return response.json()


def test_group_create_and_preview_and_join_blocking() -> None:
    founder = _create_group("Weekend Crew", "Priyanka")
    founder_group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    invite_code = founder["group"]["invite_code"]
    preview = client.get(f"/v1/invites/{invite_code}/preview")
    assert preview.status_code == 409
    assert preview.json()["detail"] == "setup_pending"

    seed_canonical_sets(founder_group_id)

    preview_after_setup = client.get(f"/v1/invites/{invite_code}/preview")
    assert preview_after_setup.status_code == 200
    assert preview_after_setup.json()["group_name"] == "Weekend Crew"

    outsider = _create_group("Other Crew", "Alex")
    outsider_session = outsider["session"]["token"]
    seed_canonical_sets(outsider["group"]["id"])

    join_without_leave = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": outsider_session},
        json={"display_name": "Alex", "leave_current_group": False},
    )
    assert join_without_leave.status_code == 409
    assert join_without_leave.json()["detail"] == "already_in_group"

    join_with_leave = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": outsider_session},
        json={"display_name": "Alex", "leave_current_group": True},
    )
    assert join_with_leave.status_code == 200
    assert join_with_leave.json()["ok"] is True


def test_join_with_anonymous_session_does_not_create_temp_group() -> None:
    founder = _create_group("Weekend Crew", "Priyanka")
    founder_group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    invite_code = founder["group"]["invite_code"]

    seed_canonical_sets(founder_group_id)

    with get_conn() as conn:
        group_count_before = conn.execute("SELECT COUNT(*) AS cnt FROM groups").fetchone()["cnt"]

    anon_session_resp = client.post("/v1/sessions")
    assert anon_session_resp.status_code == 200
    anon_session = anon_session_resp.json()["token"]

    # Joining from an anonymous session should not create any extra placeholder group rows.
    join_resp = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": anon_session},
        json={"display_name": "Taylor", "chip_color": "20a36b"},
    )
    assert join_resp.status_code == 200
    assert join_resp.json()["ok"] is True

    home_resp = client.get(
        "/v1/members/me/home",
        headers={"x-session-token": anon_session},
    )
    assert home_resp.status_code == 200
    home_payload = home_resp.json()
    assert home_payload["group"]["id"] == founder_group_id
    assert home_payload["me"]["display_name"] == "Taylor"
    assert home_payload["me"]["chip_color"] == "#20A36B"

    with get_conn() as conn:
        group_count_after = conn.execute("SELECT COUNT(*) AS cnt FROM groups").fetchone()["cnt"]
        assert group_count_after == group_count_before


def test_anonymous_session_rate_limited_per_ip() -> None:
    headers = {"x-forwarded-for": "203.0.113.7"}

    for _ in range(10):
        response = client.post("/v1/sessions", headers=headers)
        assert response.status_code == 200

    throttled = client.post("/v1/sessions", headers=headers)
    assert throttled.status_code == 429
    assert throttled.json()["detail"] == "session_rate_limited"

    other_ip = client.post("/v1/sessions", headers={"x-forwarded-for": "203.0.113.8"})
    assert other_ip.status_code == 200


def test_join_rejects_taken_chip_color() -> None:
    founder = _create_group("Weekend Crew", "Priyanka")
    founder_group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    invite_code = founder["group"]["invite_code"]

    seed_canonical_sets(founder_group_id)

    first_joiner_session = client.post("/v1/sessions").json()["token"]
    first_join = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": first_joiner_session},
        json={"display_name": "Taylor", "chip_color": "20a36b"},
    )
    assert first_join.status_code == 200

    second_joiner_session = client.post("/v1/sessions").json()["token"]
    second_join = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": second_joiner_session},
        json={"display_name": "Jordan", "chip_color": "20a36b"},
    )
    assert second_join.status_code == 409
    assert second_join.json()["detail"] == "chip_color_unavailable"


def test_founder_created_with_incomplete_setup_status() -> None:
    """Founders must start as 'incomplete' so the upload flow is required."""
    resp = client.post(
        "/v1/groups",
        json={"group_name": "TestGroup", "display_name": "Alice"},
    )
    assert resp.status_code == 200
    member = resp.json()["member"]
    assert member["setup_status"] == "incomplete"


def test_founder_cannot_leave_but_can_delete_group() -> None:
    founder = _create_group("Delete Me", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    seed_canonical_sets(group_id)

    leave_resp = client.post(
        "/v1/members/me/leave",
        headers={"x-session-token": founder_session},
        json={"confirm": True},
    )
    assert leave_resp.status_code == 409
    assert leave_resp.json()["detail"] == "founder_cannot_leave"

    delete_resp = client.delete(
        f"/v1/groups/{group_id}",
        headers={"x-session-token": founder_session},
    )
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True

    missing_preview = client.get(f"/v1/invites/{founder['group']['invite_code']}/preview")
    assert missing_preview.status_code == 404
