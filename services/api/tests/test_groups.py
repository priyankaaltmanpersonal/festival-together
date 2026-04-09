import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import get_conn, init_db
from app.main import app
from tests.conftest import make_jpeg_bytes, seed_canonical_sets

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


# ─── Official lineup import ───────────────────────────────────────────────────

PARSED_LINEUP = [
    {"artist_name": "Kendrick Lamar", "stage_name": "Coachella Stage",
     "start_time": "22:00", "end_time": "23:30", "day_index": 1},
    {"artist_name": "Tyler the Creator", "stage_name": "Sahara",
     "start_time": "20:00", "end_time": "21:30", "day_index": 2},
]


def test_import_official_lineup_seeds_canonical_sets() -> None:
    founder = _create_group("Lineup Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    with patch("app.api.groups.parse_official_lineup_from_image", return_value=PARSED_LINEUP):
        resp = client.post(
            f"/v1/groups/{group_id}/lineup/import",
            headers={"x-session-token": founder_session},
            files={"images": ("friday.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["sets_created"] == 2
    assert "1" in str(payload["days_processed"]) or "Friday" in str(payload["days_processed"])

    with get_conn() as conn:
        official_rows = conn.execute(
            "SELECT artist_name, source FROM canonical_sets WHERE group_id = ? AND source = 'official'",
            (group_id,),
        ).fetchall()
    assert len(official_rows) == 2
    assert any(r["artist_name"] == "Kendrick Lamar" for r in official_rows)


def test_import_official_lineup_skips_duplicates() -> None:
    """Importing the same lineup twice should not create duplicate rows."""
    founder = _create_group("Dupe Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    with patch("app.api.groups.parse_official_lineup_from_image", return_value=PARSED_LINEUP):
        first = client.post(
            f"/v1/groups/{group_id}/lineup/import",
            headers={"x-session-token": founder_session},
            files={"images": ("friday.jpg", make_jpeg_bytes(), "image/jpeg")},
        )
        second = client.post(
            f"/v1/groups/{group_id}/lineup/import",
            headers={"x-session-token": founder_session},
            files={"images": ("friday.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

    assert first.json()["sets_created"] == 2
    assert second.json()["sets_created"] == 0  # all duplicates


def test_import_official_lineup_requires_founder_role() -> None:
    """Regular members must not be able to call the lineup import endpoint."""
    founder = _create_group("Auth Crew", "Founder")
    group_id = founder["group"]["id"]
    invite_code = founder["group"]["invite_code"]

    seed_canonical_sets(group_id)

    member_creator = _create_group("Tmp", "Member")
    member_session = member_creator["session"]["token"]
    client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": member_session},
        json={"display_name": "Member", "leave_current_group": True},
    )

    resp = client.post(
        f"/v1/groups/{group_id}/lineup/import",
        headers={"x-session-token": member_session},
        files={"images": ("friday.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "founder_only"


def test_home_has_official_lineup_false_when_no_official_sets() -> None:
    founder = _create_group("No Lineup Crew", "Founder")
    founder_session = founder["session"]["token"]

    resp = client.get("/v1/members/me/home", headers={"x-session-token": founder_session})
    assert resp.status_code == 200
    assert resp.json()["group"]["has_official_lineup"] is False


def test_home_has_official_lineup_true_after_import() -> None:
    founder = _create_group("Has Lineup Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    with patch("app.api.groups.parse_official_lineup_from_image", return_value=PARSED_LINEUP):
        client.post(
            f"/v1/groups/{group_id}/lineup/import",
            headers={"x-session-token": founder_session},
            files={"images": ("friday.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

    resp = client.get("/v1/members/me/home", headers={"x-session-token": founder_session})
    assert resp.status_code == 200
    assert resp.json()["group"]["has_official_lineup"] is True
