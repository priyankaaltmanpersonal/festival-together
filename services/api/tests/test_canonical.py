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
    temp_dir = tempfile.mkdtemp(prefix="coachella-api-canonical-")
    settings.sqlite_path = os.path.join(temp_dir, "test.db")
    init_db()


def _create_group(group_name: str, display_name: str) -> dict:
    response = client.post(
        "/v1/groups",
        json={"group_name": group_name, "display_name": display_name},
    )
    assert response.status_code == 200
    return response.json()


def test_canonical_import_parses_raw_text_and_dedupes_overlap() -> None:
    founder = _create_group("Parsing Crew", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    response = client.post(
        f"/v1/groups/{group_id}/canonical/import",
        headers={"x-session-token": session_token},
        json={
            "screenshot_count": 2,
            "screenshots": [
                {
                    "source_id": "shot-1",
                    "raw_text": "\n".join(
                        [
                            "DAY 1",
                            "Aurora Skyline | Main Stage | 12:00 PM - 12:45 PM",
                            "Neon Valley | Sahara | 1:10 PM - 2:00 PM",
                        ]
                    ),
                },
                {
                    "source_id": "shot-2",
                    "raw_text": "\n".join(
                        [
                            "DAY 1",
                            "Aurora Skyline | Main Stage | 12:00 PM - 12:45 PM",
                            "Desert Echo | Outdoor | 2:15 PM - 3:05 PM",
                        ]
                    ),
                },
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["unresolved_count"] == 0

    review = client.get(
        f"/v1/groups/{group_id}/canonical/review",
        headers={"x-session-token": session_token},
    )
    assert review.status_code == 200
    payload = review.json()
    assert len(payload["sets"]) == 3
    aurora = next(item for item in payload["sets"] if item["artist_name"] == "Aurora Skyline")
    assert aurora["source_confidence"] > 0.8

    with get_conn() as conn:
        artifacts = conn.execute(
            "SELECT COUNT(*) AS cnt FROM parse_artifacts WHERE parse_job_id = ?",
            (response.json()["parse_job_id"],),
        ).fetchone()
        assert artifacts["cnt"] == 2


def test_canonical_import_rejects_non_parseable_payload() -> None:
    founder = _create_group("Broken OCR", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    response = client.post(
        f"/v1/groups/{group_id}/canonical/import",
        headers={"x-session-token": session_token},
        json={
            "screenshot_count": 1,
            "screenshots": [
                {"raw_text": "totally unreadable poster crop without times"},
            ],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "no_parsed_sets"


# ── Upload endpoint tests ────────────────────────────────────────────────────


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(50, 100, 150)).save(buf, format="JPEG")
    return buf.getvalue()


_TWO_SETS_OCR_TEXT = (
    "DAY 1\n"
    "Aurora Skyline | Main Stage | 12:00 PM - 12:45 PM\n"
    "Neon Valley | Sahara | 1:10 PM - 2:00 PM"
)


def test_canonical_upload_with_vision_mock() -> None:
    # TODO(Task 2): update this test after the canonical upload endpoint is rewritten
    # to use parse_schedule_from_image. For now the endpoint returns 501.
    founder = _create_group("Upload Crew", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    response = client.post(
        f"/v1/groups/{group_id}/canonical/upload",
        headers={"x-session-token": session_token},
        files=[("images", ("shot1.jpg", _make_jpeg_bytes(), "image/jpeg"))],
    )
    assert response.status_code == 501


def test_canonical_upload_rejects_too_many_images() -> None:
    founder = _create_group("Upload Crew Limit", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    files = [("images", (f"shot{i}.jpg", _make_jpeg_bytes(), "image/jpeg")) for i in range(31)]
    response = client.post(
        f"/v1/groups/{group_id}/canonical/upload",
        headers={"x-session-token": session_token},
        files=files,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "too_many_images"


def test_canonical_upload_counts_failed_images() -> None:
    # TODO(Task 2): update this test after the canonical upload endpoint is rewritten
    # to use parse_schedule_from_image. For now the endpoint returns 501.
    founder = _create_group("Upload Crew Fail", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    response = client.post(
        f"/v1/groups/{group_id}/canonical/upload",
        headers={"x-session-token": session_token},
        files=[
            ("images", ("good.jpg", _make_jpeg_bytes(), "image/jpeg")),
            ("images", ("bad.jpg", _make_jpeg_bytes(), "image/jpeg")),
        ],
    )
    assert response.status_code == 501


def test_canonical_upload_rejects_non_founder() -> None:
    founder = _create_group("Upload Crew Auth", "Founder")
    group_id = founder["group"]["id"]
    founder_token = founder["session"]["token"]

    # Complete founder setup so a member can join
    client.post(
        f"/v1/groups/{group_id}/canonical/import",
        headers={"x-session-token": founder_token},
        json={"screenshot_count": 1},
    )
    client.post(
        f"/v1/groups/{group_id}/canonical/confirm",
        headers={"x-session-token": founder_token},
    )
    invite_code = founder["group"]["invite_code"]

    # Get an anonymous session token then join — this becomes the member's token
    anon_resp = client.post("/v1/sessions")
    assert anon_resp.status_code == 200
    anon_token = anon_resp.json()["token"]
    join_resp = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": anon_token},
        json={"display_name": "Member", "chip_color": "#20A36B"},
    )
    assert join_resp.status_code == 200
    member_token = anon_token  # anonymous token is promoted to member session on join

    response = client.post(
        f"/v1/groups/{group_id}/canonical/upload",
        headers={"x-session-token": member_token},
        files=[("images", ("shot1.jpg", _make_jpeg_bytes(), "image/jpeg"))],
    )
    assert response.status_code == 403
