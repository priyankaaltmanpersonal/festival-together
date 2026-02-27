import os
import tempfile

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import init_db
from app.main import app

client = TestClient(app)


def setup_module() -> None:
    temp_dir = tempfile.mkdtemp(prefix="coachella-api-schedule-")
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
        json={"screenshot_count": 2},
    )
    assert import_resp.status_code == 200

    confirm_resp = client.post(
        f"/v1/groups/{group_id}/canonical/confirm",
        headers={"x-session-token": session_token},
    )
    assert confirm_resp.status_code == 200


def _join_group(invite_code: str, display_name: str) -> str:
    creator = _create_group(f"tmp-{display_name}", display_name)
    session_token = creator["session"]["token"]
    resp = client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": session_token},
        json={"display_name": display_name, "leave_current_group": True},
    )
    assert resp.status_code == 200
    return session_token


def _import_and_complete_member(session_token: str, must_see_first: bool) -> None:
    import_resp = client.post(
        "/v1/members/me/personal/import",
        headers={"x-session-token": session_token},
        json={"screenshot_count": 3},
    )
    assert import_resp.status_code == 200

    review_resp = client.get(
        "/v1/members/me/personal/review",
        headers={"x-session-token": session_token},
    )
    assert review_resp.status_code == 200
    sets = review_resp.json()["sets"]
    assert len(sets) >= 1

    if must_see_first:
        first_set_id = sets[0]["canonical_set_id"]
        patch_resp = client.patch(
            f"/v1/members/me/sets/{first_set_id}",
            headers={"x-session-token": session_token},
            json={"preference": "must_see"},
        )
        assert patch_resp.status_code == 200

    done_resp = client.post(
        "/v1/members/me/setup/complete",
        headers={"x-session-token": session_token},
        json={"confirm": True},
    )
    assert done_resp.status_code == 200


def test_group_schedule_filters() -> None:
    founder = _create_group("Schedule Crew", "Founder")
    group_id = founder["group"]["id"]
    invite_code = founder["group"]["invite_code"]

    _complete_founder_setup(group_id, founder["session"]["token"])
    _import_and_complete_member(founder["session"]["token"], must_see_first=True)

    member_session = _join_group(invite_code, "Taylor")
    _import_and_complete_member(member_session, must_see_first=False)

    home = client.get(
        "/v1/members/me/home",
        headers={"x-session-token": member_session},
    ).json()
    member_ids = [m["id"] for m in home["members"] if m["active"]]
    assert len(member_ids) >= 2

    all_sets_resp = client.get(
        f"/v1/groups/{group_id}/schedule",
        headers={"x-session-token": member_session},
    )
    assert all_sets_resp.status_code == 200
    all_sets = all_sets_resp.json()["sets"]
    assert len(all_sets) >= 1

    must_see_resp = client.get(
        f"/v1/groups/{group_id}/schedule?must_see_only=true",
        headers={"x-session-token": member_session},
    )
    assert must_see_resp.status_code == 200
    must_see_sets = must_see_resp.json()["sets"]
    assert len(must_see_sets) >= 1
    assert all(item["must_see_count"] >= 1 for item in must_see_sets)

    one_member_resp = client.get(
        f"/v1/groups/{group_id}/schedule?member_ids={member_ids[0]}",
        headers={"x-session-token": member_session},
    )
    assert one_member_resp.status_code == 200
    one_member_sets = one_member_resp.json()["sets"]
    assert len(one_member_sets) >= 1
    for set_item in one_member_sets:
        assert all(attendee["member_id"] == member_ids[0] for attendee in set_item["attendees"])
