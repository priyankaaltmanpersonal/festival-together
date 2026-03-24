import os
import tempfile

from fastapi.testclient import TestClient

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
