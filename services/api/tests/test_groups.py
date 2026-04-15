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


def test_home_includes_official_set_count_and_days_when_lineup_exists() -> None:
    """home response includes count and day labels when official sets exist."""
    founder = _create_group("Count Days Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    mock_lineup = [
        {"artist_name": "Artist A", "stage_name": "Sahara", "start_time": "20:00", "end_time": "21:00", "day_index": 1},
        {"artist_name": "Artist B", "stage_name": "Gobi", "start_time": "22:00", "end_time": "23:00", "day_index": 2},
    ]
    with patch("app.api.groups.parse_official_lineup_from_image", return_value=mock_lineup):
        client.post(
            f"/v1/groups/{group_id}/lineup/import",
            files=[
                ("images", ("day.jpg", make_jpeg_bytes(), "image/jpeg")),
                ("images", ("day2.jpg", make_jpeg_bytes(), "image/jpeg")),
            ],
            headers={"x-session-token": founder_session},
        )
    resp = client.get("/v1/members/me/home", headers={"x-session-token": founder_session})
    assert resp.status_code == 200
    group = resp.json()["group"]
    assert group["official_set_count"] == 2
    assert "Friday" in group["official_days"]
    assert "Saturday" in group["official_days"]


def test_home_official_set_count_zero_when_no_lineup() -> None:
    """home response has count=0, days=[] when no official sets exist."""
    founder = _create_group("No Count Crew", "Founder")
    founder_session = founder["session"]["token"]

    resp = client.get("/v1/members/me/home", headers={"x-session-token": founder_session})
    assert resp.status_code == 200
    group = resp.json()["group"]
    assert group["official_set_count"] == 0
    assert group["official_days"] == []


def test_home_official_days_uses_fallback_label_for_unknown_day_index() -> None:
    """official_days uses 'Day N' fallback when day_index has no matching festival_days entry."""
    founder = _create_group("Null Days Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    # Insert a canonical set with source='official' directly, bypassing the import.
    # day_index=99 won't match any festival_days entry, so the fallback label should be used.
    import sqlite3
    with sqlite3.connect(settings.sqlite_path) as raw:
        raw.execute(
            "INSERT INTO canonical_sets (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status, source, created_at) "
            "VALUES ('test-set-null-days', ?, 'Ghost Artist', 'Sahara', '20:00', '21:00', 99, 'resolved', 'official', '2026-01-01T00:00:00')",
            (group_id,)
        )
        raw.commit()
    resp = client.get("/v1/members/me/home", headers={"x-session-token": founder_session})
    assert resp.status_code == 200
    group = resp.json()["group"]
    assert group["official_set_count"] >= 1
    assert "Day 99" in group["official_days"]


# ─── Delete official lineup ───────────────────────────────────────────────────

def test_delete_official_lineup_removes_sets_and_preferences() -> None:
    from datetime import datetime, timezone

    founder = _create_group("Delete Lineup Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    member_id = founder["member"]["id"]

    now = datetime.now(tz=timezone.utc).isoformat()
    from uuid import uuid4 as _uuid4
    official_id = str(_uuid4())
    personal_id = str(_uuid4())

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO canonical_sets
               (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                day_index, status, source_confidence, source, created_at)
               VALUES (?, ?, 'Official Artist', 'Sahara', '21:00', '22:00', 1, 'resolved', 1.0, 'official', ?)""",
            (official_id, group_id, now),
        )
        conn.execute(
            """INSERT INTO canonical_sets
               (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                day_index, status, source_confidence, created_at)
               VALUES (?, ?, 'Personal Artist', 'Gobi', '20:00', '21:00', 1, 'resolved', 0.85, ?)""",
            (personal_id, group_id, now),
        )
        conn.execute(
            """INSERT INTO member_set_preferences
               (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
               VALUES (?, ?, ?, 'must_see', 'going', 1.0, ?, ?)""",
            (str(_uuid4()), member_id, official_id, now, now),
        )
        conn.execute(
            """INSERT INTO member_set_preferences
               (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
               VALUES (?, ?, ?, 'flexible', 'going', 0.85, ?, ?)""",
            (str(_uuid4()), member_id, personal_id, now, now),
        )
        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))

    resp = client.delete(
        f"/v1/groups/{group_id}/lineup",
        headers={"x-session-token": founder_session},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["sets_deleted"] == 1

    with get_conn() as conn:
        remaining = conn.execute(
            "SELECT id, source FROM canonical_sets WHERE group_id = ?", (group_id,)
        ).fetchall()
        assert len(remaining) == 1
        assert remaining[0]["source"] != "official"

        prefs = conn.execute(
            "SELECT canonical_set_id FROM member_set_preferences WHERE member_id = ?",
            (member_id,),
        ).fetchall()
        pref_ids = {r["canonical_set_id"] for r in prefs}
        assert official_id not in pref_ids
        assert personal_id in pref_ids


def test_delete_official_lineup_requires_founder() -> None:
    founder = _create_group("Auth Delete Crew", "Founder")
    group_id = founder["group"]["id"]
    invite_code = founder["group"]["invite_code"]

    seed_canonical_sets(group_id)

    member_creator = _create_group("Tmp2", "Member")
    member_session = member_creator["session"]["token"]
    client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": member_session},
        json={"display_name": "Member", "leave_current_group": True},
    )

    resp = client.delete(
        f"/v1/groups/{group_id}/lineup",
        headers={"x-session-token": member_session},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "founder_only"


def test_delete_official_lineup_returns_zero_when_nothing_to_delete() -> None:
    founder = _create_group("Empty Delete Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    resp = client.delete(
        f"/v1/groups/{group_id}/lineup",
        headers={"x-session-token": founder_session},
    )
    assert resp.status_code == 200
    assert resp.json()["sets_deleted"] == 0


def test_import_official_lineup_parses_multiple_images_concurrently() -> None:
    """All images must be parsed; behavior is correct regardless of concurrency."""
    founder = _create_group("Parallel Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    day1 = [{"artist_name": "Artist A", "stage_name": "Coachella Stage",
              "start_time": "21:00", "end_time": "22:30", "day_index": 1}]
    day2 = [{"artist_name": "Artist B", "stage_name": "Sahara",
              "start_time": "20:00", "end_time": "21:30", "day_index": 2}]
    day3 = [{"artist_name": "Artist C", "stage_name": "Outdoor Theatre",
              "start_time": "22:00", "end_time": "23:30", "day_index": 3}]

    with patch("app.api.groups.parse_official_lineup_from_image",
               side_effect=[day1, day2, day3]) as mock_parse:
        resp = client.post(
            f"/v1/groups/{group_id}/lineup/import",
            headers={"x-session-token": founder_session},
            files=[
                ("images", ("fri.jpg", make_jpeg_bytes(), "image/jpeg")),
                ("images", ("sat.jpg", make_jpeg_bytes(), "image/jpeg")),
                ("images", ("sun.jpg", make_jpeg_bytes(), "image/jpeg")),
            ],
        )

    assert resp.status_code == 200
    assert resp.json()["sets_created"] == 3
    assert mock_parse.call_count == 3


# ─── Preset endpoints ─────────────────────────────────────────────────────────


def test_list_lineup_presets_returns_manifest() -> None:
    resp = client.get("/v1/lineup/presets")
    assert resp.status_code == 200
    payload = resp.json()
    assert "presets" in payload
    ids = [p["id"] for p in payload["presets"]]
    assert "coachella_2026_w1" in ids
    assert "coachella_2026_w2" in ids
    for preset in payload["presets"]:
        assert "label" in preset
        assert "days" in preset
        assert len(preset["days"]) == 3


def test_import_lineup_from_preset_seeds_canonical_sets() -> None:
    founder = _create_group("Preset Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    resp = client.post(
        f"/v1/groups/{group_id}/lineup/from-preset",
        headers={"x-session-token": founder_session},
        json={"preset_id": "coachella_2026_w1"},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["sets_created"] > 0
    assert len(payload["days_processed"]) == 3

    with get_conn() as conn:
        official_rows = conn.execute(
            "SELECT artist_name FROM canonical_sets WHERE group_id = ? AND source = 'official'",
            (group_id,),
        ).fetchall()
    assert len(official_rows) == payload["sets_created"]


def test_import_lineup_from_preset_skips_duplicates() -> None:
    founder = _create_group("Preset Dupe Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    first = client.post(
        f"/v1/groups/{group_id}/lineup/from-preset",
        headers={"x-session-token": founder_session},
        json={"preset_id": "coachella_2026_w2"},
    )
    second = client.post(
        f"/v1/groups/{group_id}/lineup/from-preset",
        headers={"x-session-token": founder_session},
        json={"preset_id": "coachella_2026_w2"},
    )
    assert first.json()["sets_created"] > 0
    assert second.json()["sets_created"] == 0


def test_import_lineup_from_preset_requires_founder_role() -> None:
    founder = _create_group("Preset Auth Crew", "Founder")
    group_id = founder["group"]["id"]
    invite_code = founder["group"]["invite_code"]

    seed_canonical_sets(group_id)

    member_creator = _create_group("Tmp2", "Member")
    member_session = member_creator["session"]["token"]
    client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": member_session},
        json={"display_name": "Member", "leave_current_group": True},
    )

    resp = client.post(
        f"/v1/groups/{group_id}/lineup/from-preset",
        headers={"x-session-token": member_session},
        json={"preset_id": "coachella_2026_w1"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "founder_only"


def test_import_lineup_from_preset_unknown_id_returns_404() -> None:
    founder = _create_group("Preset 404 Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    resp = client.post(
        f"/v1/groups/{group_id}/lineup/from-preset",
        headers={"x-session-token": founder_session},
        json={"preset_id": "does_not_exist"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "preset_not_found"
