import io
import os
import tempfile
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import settings
from app.core.db import get_conn, init_db
from app.main import app

client = TestClient(app)


def setup_module() -> None:
    temp_dir = tempfile.mkdtemp(prefix="coachella-api-personal-")
    settings.sqlite_path = os.path.join(temp_dir, "test.db")
    init_db()


def _create_group(group_name: str, display_name: str) -> dict:
    response = client.post(
        "/v1/groups",
        json={"group_name": group_name, "display_name": display_name},
    )
    assert response.status_code == 200
    return response.json()


def _complete_founder_setup(group_id: str, session_token: str) -> None:
    import_resp = client.post(
        f"/v1/groups/{group_id}/canonical/import",
        headers={"x-session-token": session_token},
        json={
            "screenshot_count": 2,
            "screenshots": [
                {
                    "raw_text": "\n".join(
                        [
                            "DAY 1",
                            "Aurora Skyline | Main Stage | 12:00 PM - 12:45 PM",
                            "Neon Valley | Sahara | 1:10 PM - 2:00 PM",
                        ]
                    ),
                },
                {
                    "raw_text": "\n".join(
                        [
                            "DAY 1",
                            "Desert Echo | Outdoor | 2:15 PM - 3:05 PM",
                            "Solar Ritual | Mojave | 4:20 PM - 5:10 PM",
                        ]
                    ),
                },
            ],
        },
    )
    assert import_resp.status_code == 200

    confirm_resp = client.post(
        f"/v1/groups/{group_id}/canonical/confirm",
        headers={"x-session-token": session_token},
    )
    assert confirm_resp.status_code == 200


def test_personal_import_and_setup_completion() -> None:
    founder = _create_group("Crew", "Founder")
    founder_group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    invite_code = founder["group"]["invite_code"]

    _complete_founder_setup(founder_group_id, founder_session)

    member_creator = _create_group("Other", "Taylor")
    member_session = member_creator["session"]["token"]

    join_resp = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": member_session},
        json={"display_name": "Taylor", "leave_current_group": True},
    )
    assert join_resp.status_code == 200

    import_resp = client.post(
        "/v1/members/me/personal/import",
        headers={"x-session-token": member_session},
        json={
            "screenshot_count": 3,
            "screenshots": [
                {
                    "raw_text": "\n".join(
                        [
                            "DAY 1",
                            "Aurora Skyline | Main Stage | 12:00 PM - 12:45 PM",
                            "Solar Ritual | Mojave | 4:20 PM - 5:10 PM",
                        ]
                    ),
                },
                {
                    "raw_text": "\n".join(
                        [
                            "DAY 1",
                            "Neon Valley @ Sahara 1:10 PM - 2:00 PM",
                        ]
                    ),
                },
            ],
        },
    )
    assert import_resp.status_code == 200
    assert import_resp.json()["parsed_count"] >= 1

    review_resp = client.get(
        "/v1/members/me/personal/review",
        headers={"x-session-token": member_session},
    )
    assert review_resp.status_code == 200
    review_payload = review_resp.json()
    assert len(review_payload["sets"]) >= 1

    first_set = review_payload["sets"][0]
    update_resp = client.patch(
        f"/v1/members/me/sets/{first_set['canonical_set_id']}",
        headers={"x-session-token": member_session},
        json={"preference": "must_see", "attendance": "not_going"},
    )
    assert update_resp.status_code == 200

    done_resp = client.post(
        "/v1/members/me/setup/complete",
        headers={"x-session-token": member_session},
        json={"confirm": True},
    )
    assert done_resp.status_code == 200

    home_resp = client.get(
        "/v1/members/me/home",
        headers={"x-session-token": member_session},
    )
    assert home_resp.status_code == 200
    home_payload = home_resp.json()
    assert home_payload["group"]["name"] == "Crew"
    assert home_payload["me"]["setup_status"] == "complete"
    assert home_payload["my_sets"]["total"] >= 1
    assert any(item["source_confidence"] >= 0.7 for item in review_payload["sets"])


def test_setup_complete_requires_at_least_one_set() -> None:
    solo = _create_group("Solo", "NoSets")
    session_token = solo["session"]["token"]

    done_resp = client.post(
        "/v1/members/me/setup/complete",
        headers={"x-session-token": session_token},
        json={"confirm": True},
    )
    assert done_resp.status_code == 400
    assert done_resp.json()["detail"] == "at_least_one_set_required"


# ── Upload endpoint tests ────────────────────────────────────────────────────


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, format="JPEG")
    return buf.getvalue()


def _get_canonical_ocr_text(group_id: str) -> str:
    """Build OCR text that matches the first 2 canonical sets for this group."""
    from app.core.parser import _display_time
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT artist_name, stage_name, start_time_pt, end_time_pt, day_index FROM canonical_sets WHERE group_id = ? LIMIT 2",
            (group_id,),
        ).fetchall()
    lines = [f"DAY {rows[0]['day_index']}"]
    for row in rows:
        lines.append(
            f"{row['artist_name']} | {row['stage_name']} | "
            f"{_display_time(row['start_time_pt'])} - {_display_time(row['end_time_pt'])}"
        )
    return "\n".join(lines)


def _make_test_image() -> bytes:
    img = Image.new("RGB", (100, 100), color=(200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_personal_upload_with_vision_mock() -> None:
    founder = _create_group("Upload Personal Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_token = founder["session"]["token"]
    invite_code = founder["group"]["invite_code"]

    _complete_founder_setup(group_id, founder_token)

    # Join as new member via anonymous session
    anon_resp = client.post("/v1/sessions")
    anon_token = anon_resp.json()["token"]
    client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": anon_token},
        json={"display_name": "Tester", "chip_color": "#8A5CE6"},
    )
    member_token = anon_token  # promoted on join

    with patch("app.api.personal.parse_schedule_from_image") as mock_parse:
        mock_parse.return_value = [
            {"artist_name": "Test Artist", "stage_name": "Main Stage",
             "start_time": "12:00", "end_time": "13:00", "day_index": 1}
        ]
        response = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": member_token},
            files=[("images", ("mine.jpg", _make_jpeg_bytes(), "image/jpeg"))],
        )
    assert response.status_code == 200


def test_upload_returns_sets_array() -> None:
    """Upload endpoint must return a 'sets' array in the response."""
    founder = _create_group("UploadTest", "Founder")
    session_token = founder["session"]["token"]

    img_bytes = _make_test_image()

    with patch("app.api.personal.parse_schedule_from_image") as mock_parse:
        mock_parse.return_value = [
            {"artist_name": "Lady Gaga", "stage_name": "Main Stage",
             "start_time": "23:10", "end_time": "24:10", "day_index": 1}
        ]
        resp = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": session_token},
            files={"images": ("img.jpg", img_bytes, "image/jpeg")},
            data={"day_label": "Friday"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "sets" in body
    assert len(body["sets"]) >= 1
    assert "canonical_set_id" in body["sets"][0]
    assert "artist_name" in body["sets"][0]


def test_upload_accepts_day_label_param() -> None:
    """Upload endpoint must accept day_label as a form field."""
    founder = _create_group("DayLabelTest", "Founder2")
    session_token = founder["session"]["token"]
    img_bytes = _make_test_image()

    with patch("app.api.personal.parse_schedule_from_image") as mock_parse:
        mock_parse.return_value = []
        resp = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": session_token},
            files={"images": ("img.jpg", img_bytes, "image/jpeg")},
            data={"day_label": "Saturday"},
        )
        call_args = mock_parse.call_args
        # second positional arg is day_label
        assert call_args.args[1] == "Saturday" or call_args.kwargs.get("day_label") == "Saturday"
