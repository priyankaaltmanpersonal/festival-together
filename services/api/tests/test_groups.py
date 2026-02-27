import os
import tempfile

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import init_db
from app.main import app

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


def test_group_create_and_preview_and_join_blocking() -> None:
    founder = _create_group("Weekend Crew", "Priyanka")
    founder_group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    invite_code = founder["group"]["invite_code"]
    preview = client.get(f"/v1/invites/{invite_code}/preview")
    assert preview.status_code == 409
    assert preview.json()["detail"] == "setup_pending"

    _complete_founder_setup(founder_group_id, founder_session)

    preview_after_setup = client.get(f"/v1/invites/{invite_code}/preview")
    assert preview_after_setup.status_code == 200
    assert preview_after_setup.json()["group_name"] == "Weekend Crew"

    outsider = _create_group("Other Crew", "Alex")
    outsider_session = outsider["session"]["token"]
    _complete_founder_setup(outsider["group"]["id"], outsider_session)

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


def test_founder_cannot_leave_but_can_delete_group() -> None:
    founder = _create_group("Delete Me", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    _complete_founder_setup(group_id, founder_session)

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
