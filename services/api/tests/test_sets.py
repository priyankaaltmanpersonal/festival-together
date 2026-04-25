import os
import tempfile

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import get_conn, init_db
from app.main import app
from tests.conftest import seed_canonical_sets

client = TestClient(app)


def setup_module() -> None:
    temp_dir = tempfile.mkdtemp(prefix="coachella-api-sets-")
    settings.sqlite_path = os.path.join(temp_dir, "test.db")
    init_db()


def _create_group(group_name: str, display_name: str) -> dict:
    response = client.post(
        "/v1/groups",
        json={"group_name": group_name, "display_name": display_name},
    )
    assert response.status_code == 200
    return response.json()


def _seed_and_get_ids(group_id: str) -> list[str]:
    """Seed canonical sets and return their IDs."""
    with get_conn() as conn:
        ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM canonical_sets WHERE group_id = ? ORDER BY start_time_pt",
                (group_id,),
            ).fetchall()
        ]
    return ids


def test_patch_canonical_set_name() -> None:
    founder = _create_group("PatchName", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    seed_canonical_sets(group_id)
    set_ids = _seed_and_get_ids(group_id)

    resp = client.patch(
        f"/v1/canonical-sets/{set_ids[0]}",
        headers={"x-session-token": session_token},
        json={"artist_name": "Fixed Name"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    with get_conn() as conn:
        row = conn.execute("SELECT artist_name FROM canonical_sets WHERE id = ?", (set_ids[0],)).fetchone()
    assert row["artist_name"] == "Fixed Name"


def test_patch_canonical_set_time() -> None:
    founder = _create_group("PatchTime", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    seed_canonical_sets(group_id)
    set_ids = _seed_and_get_ids(group_id)

    resp = client.patch(
        f"/v1/canonical-sets/{set_ids[0]}",
        headers={"x-session-token": session_token},
        json={"start_time_pt": "12:30", "end_time_pt": "13:15"},
    )
    assert resp.status_code == 200

    with get_conn() as conn:
        row = conn.execute("SELECT start_time_pt, end_time_pt FROM canonical_sets WHERE id = ?", (set_ids[0],)).fetchone()
    assert row["start_time_pt"] == "12:30"
    assert row["end_time_pt"] == "13:15"


def test_patch_canonical_set_no_fields() -> None:
    founder = _create_group("PatchEmpty", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    seed_canonical_sets(group_id)
    set_ids = _seed_and_get_ids(group_id)

    resp = client.patch(
        f"/v1/canonical-sets/{set_ids[0]}",
        headers={"x-session-token": session_token},
        json={},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "no_updates_provided"


def test_patch_canonical_set_wrong_group() -> None:
    """A member cannot edit a canonical set belonging to a different group."""
    owner = _create_group("OwnerGroup", "Owner")
    owner_group_id = owner["group"]["id"]
    seed_canonical_sets(owner_group_id)
    set_ids = _seed_and_get_ids(owner_group_id)

    other = _create_group("OtherGroup", "Other")
    other_token = other["session"]["token"]

    resp = client.patch(
        f"/v1/canonical-sets/{set_ids[0]}",
        headers={"x-session-token": other_token},
        json={"artist_name": "Hacked Name"},
    )
    assert resp.status_code == 403


def test_patch_canonical_set_not_found() -> None:
    founder = _create_group("PatchNotFound", "Founder")
    session_token = founder["session"]["token"]

    resp = client.patch(
        "/v1/canonical-sets/nonexistent-id",
        headers={"x-session-token": session_token},
        json={"artist_name": "Ghost"},
    )
    assert resp.status_code == 404
