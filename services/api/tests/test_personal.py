import os
import tempfile

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import init_db
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
