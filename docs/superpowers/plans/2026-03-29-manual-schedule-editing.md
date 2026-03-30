# Manual Schedule Editing + Invite Code UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every group member delete, edit, and add artists on their schedule, and make the invite code tap-to-copy visible to all members in two places.

**Architecture:** Three new backend endpoints (delete preference, add set, patch canonical set) added to existing routers. Mobile gets a shared `EditableSetCard` component used in both `SetupScreen` and `EditMyScheduleScreen`, with handlers in App.js. Invite code display added to the menu overlay and the group schedule screen.

**Tech Stack:** Python/FastAPI + SQLite/Postgres (backend), React Native / Expo 54 plain JS (mobile), `expo-clipboard` for tap-to-copy.

---

## File Map

**Backend — modified:**
- `services/api/app/api/personal.py` — add `DELETE /members/me/sets/{canonical_set_id}` and `POST /members/me/sets`
- `services/api/app/schemas/personal.py` — add `AddSetRequest` schema
- `services/api/app/main.py` — register new `sets_router`
- `services/api/tests/test_personal.py` — fix broken `_complete_founder_setup` helper, add new tests

**Backend — created:**
- `services/api/app/api/sets.py` — `PATCH /canonical-sets/{id}` endpoint
- `services/api/tests/test_sets.py` — tests for sets.py

**Mobile — created:**
- `apps/mobile/src/components/EditableSetCard.js` — shared artist card with inline edit expand, ✕ delete, Must-See/Maybe preference buttons

**Mobile — modified:**
- `apps/mobile/App.js` — add `deletePersonalSet`, `addPersonalSet`, `editCanonicalSet` handlers; add `inviteCode` copy state; pass new props to screens
- `apps/mobile/src/screens/EditMyScheduleScreen.js` — use `EditableSetCard`, add `+ Add Artist` button
- `apps/mobile/src/screens/SetupScreen.js` — use `EditableSetCard` in `upload_day` step, add `+ Add Artist` button
- `apps/mobile/src/screens/GroupScheduleScreen.js` — add invite code row to `topRow`

---

## Task 1: Fix broken test helper

`_complete_founder_setup` in `test_personal.py` calls deleted canonical import/confirm endpoints and will crash. Replace with a direct DB seed.

**Files:**
- Modify: `services/api/tests/test_personal.py`

- [ ] **Step 1: Replace `_complete_founder_setup` with a DB seed helper**

In `test_personal.py`, replace lines 31–65 (the entire `_complete_founder_setup` function) with:

```python
from datetime import datetime, timezone
from uuid import uuid4

def _seed_canonical_sets(group_id: str) -> None:
    """Directly insert canonical sets + mark group setup_complete, bypassing the deleted canonical API."""
    now = datetime.now(tz=timezone.utc).isoformat()
    sets = [
        ("Aurora Skyline", "Main Stage", "12:00", "12:45", 1),
        ("Neon Valley", "Sahara", "13:10", "14:00", 1),
        ("Desert Echo", "Outdoor", "14:15", "15:05", 1),
        ("Solar Ritual", "Mojave", "16:20", "17:10", 1),
    ]
    with get_conn() as conn:
        for artist, stage, start, end, day in sets:
            conn.execute(
                """
                INSERT INTO canonical_sets
                  (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                   day_index, status, source_confidence, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 0.9, ?)
                """,
                (str(uuid4()), group_id, artist, stage, start, end, day, now),
            )
        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))
```

Also update `_get_canonical_ocr_text` to remove the import of `_display_time` from `app.core.parser` if it exists (it's only used by the old test_personal tests that used canonical import). Keep it if still referenced; check carefully.

- [ ] **Step 2: Update all callers of `_complete_founder_setup`**

Search `test_personal.py` for all calls to `_complete_founder_setup` and replace each one with `_seed_canonical_sets(group_id)`. The argument is just the group_id (no session token needed).

Example — replace:
```python
_complete_founder_setup(founder_group_id, founder_session)
```
with:
```python
_seed_canonical_sets(founder_group_id)
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd services/api && python -m pytest tests/test_personal.py -v
```

Expected: all existing tests pass. Fix any import errors if `_display_time` or other symbols are now missing.

- [ ] **Step 4: Commit**

```bash
git add services/api/tests/test_personal.py
git commit -m "fix(tests): replace deleted canonical API calls with direct DB seed"
git push
```

---

## Task 2: DELETE /members/me/sets/{canonical_set_id}

Lets a member remove an artist from their schedule. Deletes only their `member_set_preferences` row — the canonical set is untouched.

**Files:**
- Modify: `services/api/app/api/personal.py`
- Modify: `services/api/tests/test_personal.py`

- [ ] **Step 1: Write the failing test**

Add to the bottom of `tests/test_personal.py`:

```python
def test_delete_member_set() -> None:
    # Create a member with a set preference
    founder = _create_group("DeleteTest", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    _seed_canonical_sets(group_id)

    # Upload to get a preference row
    import io
    from PIL import Image
    from unittest.mock import patch
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, format="JPEG")
    img_bytes = buf.getvalue()

    with patch("app.api.personal.parse_schedule_from_image") as mock_parse:
        mock_parse.return_value = [
            {"artist_name": "Aurora Skyline", "stage_name": "Main Stage",
             "start_time": "12:00", "end_time": "12:45", "day_index": 1}
        ]
        resp = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": session_token},
            files={"images": ("img.jpg", img_bytes, "image/jpeg")},
        )
    assert resp.status_code == 200
    canonical_set_id = resp.json()["sets"][0]["canonical_set_id"]

    # Delete it
    del_resp = client.delete(
        f"/v1/members/me/sets/{canonical_set_id}",
        headers={"x-session-token": session_token},
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True

    # Verify it's gone from the review
    review = client.get(
        "/v1/members/me/personal/review",
        headers={"x-session-token": session_token},
    )
    ids = [s["canonical_set_id"] for s in review.json()["sets"]]
    assert canonical_set_id not in ids


def test_delete_member_set_not_found() -> None:
    founder = _create_group("DeleteNotFound", "Founder")
    session_token = founder["session"]["token"]

    resp = client.delete(
        "/v1/members/me/sets/nonexistent-id",
        headers={"x-session-token": session_token},
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/api && python -m pytest tests/test_personal.py::test_delete_member_set tests/test_personal.py::test_delete_member_set_not_found -v
```

Expected: FAIL — `405 Method Not Allowed` (route doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

In `services/api/app/api/personal.py`, add this after the existing `update_member_set` function (around line 200):

```python
@router.delete("/members/me/sets/{canonical_set_id}")
def delete_member_set(canonical_set_id: str, session=Depends(require_session)) -> dict:
    with get_conn() as conn:
        result = conn.execute(
            "DELETE FROM member_set_preferences WHERE member_id = ? AND canonical_set_id = ?",
            (session["member_id"], canonical_set_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="set_not_found")
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/api && python -m pytest tests/test_personal.py::test_delete_member_set tests/test_personal.py::test_delete_member_set_not_found -v
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/personal.py services/api/tests/test_personal.py
git commit -m "feat: DELETE /members/me/sets/{id} — remove artist from personal schedule"
git push
```

---

## Task 3: POST /members/me/sets (add artist)

Lets a member manually add a missing artist. Uses match-or-create on the canonical set (same dedup logic as the upload flow).

**Files:**
- Modify: `services/api/app/schemas/personal.py`
- Modify: `services/api/app/api/personal.py`
- Modify: `services/api/tests/test_personal.py`

- [ ] **Step 1: Add `AddSetRequest` schema**

In `services/api/app/schemas/personal.py`, add:

```python
class AddSetRequest(BaseModel):
    artist_name: str = Field(min_length=1, max_length=200)
    stage_name: str = Field(min_length=1, max_length=200)
    start_time_pt: str = Field(pattern=r"^\d{1,2}:\d{2}$")
    end_time_pt: str = Field(pattern=r"^\d{1,2}:\d{2}$")
    day_index: int = Field(ge=1)
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/test_personal.py`:

```python
def test_add_member_set_creates_new() -> None:
    """Adding an artist that doesn't exist yet creates a canonical set and preference."""
    founder = _create_group("AddSetNew", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    _seed_canonical_sets(group_id)

    resp = client.post(
        "/v1/members/me/sets",
        headers={"x-session-token": session_token},
        json={
            "artist_name": "Brand New Artist",
            "stage_name": "Main Stage",
            "start_time_pt": "20:00",
            "end_time_pt": "21:00",
            "day_index": 1,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "canonical_set_id" in body

    # Verify it appears in the review
    review = client.get("/v1/members/me/personal/review", headers={"x-session-token": session_token})
    names = [s["artist_name"] for s in review.json()["sets"]]
    assert "Brand New Artist" in names


def test_add_member_set_matches_existing() -> None:
    """Adding an artist that already exists in canonical_sets links to the existing row."""
    founder = _create_group("AddSetMatch", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    _seed_canonical_sets(group_id)

    # "Aurora Skyline" at "Main Stage" 12:00 day 1 already exists from _seed_canonical_sets
    resp = client.post(
        "/v1/members/me/sets",
        headers={"x-session-token": session_token},
        json={
            "artist_name": "AURORA SKYLINE",  # different case — should still match
            "stage_name": "main stage",
            "start_time_pt": "12:00",
            "end_time_pt": "12:45",
            "day_index": 1,
        },
    )
    assert resp.status_code == 200

    # Check only one canonical set exists for this name
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id FROM canonical_sets WHERE group_id = ? AND LOWER(TRIM(artist_name)) = 'aurora skyline'",
            (group_id,),
        ).fetchall()
    assert len(rows) == 1


def test_add_member_set_conflict() -> None:
    """Adding an artist the member already has returns 409."""
    founder = _create_group("AddSetConflict", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    _seed_canonical_sets(group_id)

    payload = {
        "artist_name": "New Solo Act",
        "stage_name": "Main Stage",
        "start_time_pt": "22:00",
        "end_time_pt": "23:00",
        "day_index": 1,
    }
    # First add — succeeds
    r1 = client.post("/v1/members/me/sets", headers={"x-session-token": session_token}, json=payload)
    assert r1.status_code == 200

    # Second add — same artist, same member
    r2 = client.post("/v1/members/me/sets", headers={"x-session-token": session_token}, json=payload)
    assert r2.status_code == 409
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd services/api && python -m pytest tests/test_personal.py::test_add_member_set_creates_new tests/test_personal.py::test_add_member_set_matches_existing tests/test_personal.py::test_add_member_set_conflict -v
```

Expected: FAIL — 405 (route doesn't exist).

- [ ] **Step 4: Implement the endpoint**

In `services/api/app/api/personal.py`, update the import from schemas to include `AddSetRequest`:

```python
from app.schemas.personal import (
    AddSetRequest,
    CompleteSetupRequest,
    MemberSetUpdateRequest,
    PersonalImportRequest,
    PersonalReviewResponse,
    PersonalSet,
)
```

Then add the endpoint after `delete_member_set`:

```python
@router.post("/members/me/sets")
def add_member_set(payload: AddSetRequest, session=Depends(require_session)) -> dict:
    now = _now_iso()

    with get_conn() as conn:
        member = conn.execute(
            "SELECT group_id FROM members WHERE id = ? AND active = 1",
            (session["member_id"],),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=401, detail="invalid_session")

        group_id = member["group_id"]

        # Match-or-create canonical set
        existing = conn.execute(
            """
            SELECT id FROM canonical_sets
            WHERE group_id = ?
              AND LOWER(TRIM(artist_name)) = LOWER(TRIM(?))
              AND LOWER(TRIM(stage_name)) = LOWER(TRIM(?))
              AND start_time_pt = ?
              AND day_index = ?
            """,
            (group_id, payload.artist_name, payload.stage_name, payload.start_time_pt, payload.day_index),
        ).fetchone()

        if existing:
            canonical_set_id = existing["id"]
        else:
            canonical_set_id = str(uuid4())
            conn.execute(
                """
                INSERT INTO canonical_sets
                  (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                   day_index, status, source_confidence, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 1.0, ?)
                """,
                (
                    canonical_set_id, group_id,
                    payload.artist_name, payload.stage_name,
                    payload.start_time_pt, payload.end_time_pt,
                    payload.day_index, now,
                ),
            )

        # Check for existing preference
        existing_pref = conn.execute(
            "SELECT id FROM member_set_preferences WHERE member_id = ? AND canonical_set_id = ?",
            (session["member_id"], canonical_set_id),
        ).fetchone()
        if existing_pref:
            raise HTTPException(status_code=409, detail="already_in_schedule")

        conn.execute(
            """
            INSERT INTO member_set_preferences
              (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
            VALUES (?, ?, ?, 'flexible', 'going', 1.0, ?, ?)
            """,
            (str(uuid4()), session["member_id"], canonical_set_id, now, now),
        )

    return {"ok": True, "canonical_set_id": canonical_set_id}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd services/api && python -m pytest tests/test_personal.py::test_add_member_set_creates_new tests/test_personal.py::test_add_member_set_matches_existing tests/test_personal.py::test_add_member_set_conflict -v
```

Expected: all three PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/app/schemas/personal.py services/api/app/api/personal.py services/api/tests/test_personal.py
git commit -m "feat: POST /members/me/sets — manually add artist with match-or-create"
git push
```

---

## Task 4: PATCH /canonical-sets/{id} (edit artist)

Lets any member fix a canonical set's name, stage, or times. Shared — affects all members who have that artist.

**Files:**
- Create: `services/api/app/api/sets.py`
- Modify: `services/api/app/main.py`
- Create: `services/api/tests/test_sets.py`

- [ ] **Step 1: Create `services/api/app/api/sets.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import require_session
from app.core.db import get_conn

router = APIRouter(tags=["sets"])


class PatchCanonicalSetRequest(BaseModel):
    artist_name: str | None = None
    stage_name: str | None = None
    start_time_pt: str | None = None
    end_time_pt: str | None = None


@router.patch("/canonical-sets/{canonical_set_id}")
def patch_canonical_set(
    canonical_set_id: str,
    payload: PatchCanonicalSetRequest,
    session=Depends(require_session),
) -> dict:
    updates: list[str] = []
    values: list[str] = []

    if payload.artist_name is not None:
        updates.append("artist_name = ?")
        values.append(payload.artist_name)
    if payload.stage_name is not None:
        updates.append("stage_name = ?")
        values.append(payload.stage_name)
    if payload.start_time_pt is not None:
        updates.append("start_time_pt = ?")
        values.append(payload.start_time_pt)
    if payload.end_time_pt is not None:
        updates.append("end_time_pt = ?")
        values.append(payload.end_time_pt)

    if not updates:
        raise HTTPException(status_code=400, detail="no_updates_provided")

    with get_conn() as conn:
        member = conn.execute(
            "SELECT group_id FROM members WHERE id = ? AND active = 1",
            (session["member_id"],),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=401, detail="invalid_session")

        canonical_set = conn.execute(
            "SELECT id, group_id FROM canonical_sets WHERE id = ?",
            (canonical_set_id,),
        ).fetchone()
        if canonical_set is None:
            raise HTTPException(status_code=404, detail="set_not_found")
        if canonical_set["group_id"] != member["group_id"]:
            raise HTTPException(status_code=403, detail="forbidden")

        values.append(canonical_set_id)
        conn.execute(
            f"UPDATE canonical_sets SET {', '.join(updates)} WHERE id = ?",
            tuple(values),
        )

    return {"ok": True}
```

- [ ] **Step 2: Register the router in `main.py`**

Add to `services/api/app/main.py`:

```python
from app.api.sets import router as sets_router
```

And add after the existing `app.include_router` lines:

```python
app.include_router(sets_router, prefix=settings.api_prefix)
```

- [ ] **Step 3: Write the failing tests**

Create `services/api/tests/test_sets.py`:

```python
import os
import tempfile

from fastapi.testclient import TestClient
from datetime import datetime, timezone
from uuid import uuid4

from app.core.config import settings
from app.core.db import get_conn, init_db
from app.main import app

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


def _seed_canonical_sets(group_id: str) -> list[str]:
    """Insert two canonical sets and return their IDs."""
    now = datetime.now(tz=timezone.utc).isoformat()
    ids = []
    sets = [
        ("Aurora Skyline", "Main Stage", "12:00", "12:45", 1),
        ("Neon Valley", "Sahara", "13:10", "14:00", 1),
    ]
    with get_conn() as conn:
        for artist, stage, start, end, day in sets:
            set_id = str(uuid4())
            conn.execute(
                """
                INSERT INTO canonical_sets
                  (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                   day_index, status, source_confidence, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 0.9, ?)
                """,
                (set_id, group_id, artist, stage, start, end, day, now),
            )
            ids.append(set_id)
        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))
    return ids


def test_patch_canonical_set_name() -> None:
    founder = _create_group("PatchName", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]
    set_ids = _seed_canonical_sets(group_id)

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
    set_ids = _seed_canonical_sets(group_id)

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
    set_ids = _seed_canonical_sets(group_id)

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
    set_ids = _seed_canonical_sets(owner_group_id)

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
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd services/api && python -m pytest tests/test_sets.py -v
```

Expected: FAIL — 404 (route doesn't exist yet, since main.py hasn't been updated).

- [ ] **Step 5: Run tests after registering the router**

```bash
cd services/api && python -m pytest tests/test_sets.py -v
```

Expected: all 5 PASS.

- [ ] **Step 6: Run the full test suite**

```bash
cd services/api && python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add services/api/app/api/sets.py services/api/app/main.py services/api/tests/test_sets.py
git commit -m "feat: PATCH /canonical-sets/{id} — edit artist name/stage/times (shared)"
git push
```

---

## Task 5: Install expo-clipboard

Needed for tap-to-copy invite code.

**Files:**
- Modify: `apps/mobile/package.json` (via install command)

- [ ] **Step 1: Install the package**

```bash
cd apps/mobile && npx expo install expo-clipboard
```

- [ ] **Step 2: Verify it installed**

```bash
grep "expo-clipboard" apps/mobile/package.json
```

Expected: `"expo-clipboard": "~X.X.X"` appears in dependencies.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "chore: add expo-clipboard for tap-to-copy invite code"
git push
```

---

## Task 6: Create EditableSetCard component

A shared card used in both `SetupScreen` and `EditMyScheduleScreen`. Handles Must-See/Maybe toggle, ✕ delete, and inline edit expand.

**Files:**
- Create: `apps/mobile/src/components/EditableSetCard.js`

- [ ] **Step 1: Create the file**

```javascript
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (h >= 24) h -= 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${ampm}`;
}

/**
 * EditableSetCard — artist card with inline edit expand, delete, and preference toggle.
 *
 * Props:
 *   setItem         — { canonical_set_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, preference }
 *   isEditing       — boolean, controlled by parent (only one card edits at a time)
 *   onStartEdit     — () => void — parent sets this card as the active editing card
 *   onCancelEdit    — () => void — parent clears the active editing card
 *   onSave          — ({ artist_name, stage_name, start_time_pt, end_time_pt }) => Promise<void>
 *   onDelete        — () => Promise<void>
 *   onSetPreference — (canonicalSetId, preference) => void
 *   saving          — boolean — show spinner on Save button
 *   deleting        — boolean — hide card while deleting (optimistic)
 */
export function EditableSetCard({
  setItem,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onSetPreference,
  saving = false,
  deleting = false,
}) {
  const [editName, setEditName] = useState(setItem.artist_name);
  const [editStage, setEditStage] = useState(setItem.stage_name);
  const [editStart, setEditStart] = useState(setItem.start_time_pt);
  const [editEnd, setEditEnd] = useState(setItem.end_time_pt);
  const [saveError, setSaveError] = useState('');

  if (deleting) return null;

  const handleStartEdit = () => {
    // Reset form to current values each time edit opens
    setEditName(setItem.artist_name);
    setEditStage(setItem.stage_name);
    setEditStart(setItem.start_time_pt);
    setEditEnd(setItem.end_time_pt);
    setSaveError('');
    onStartEdit();
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await onSave({
        artist_name: editName.trim(),
        stage_name: editStage.trim(),
        start_time_pt: editStart.trim(),
        end_time_pt: editEnd.trim(),
      });
      onCancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const timeLabel = setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt
    ? `${formatTime(setItem.start_time_pt)}–${formatTime(setItem.end_time_pt)}`
    : formatTime(setItem.start_time_pt);

  if (isEditing) {
    return (
      <View style={styles.cardEditing}>
        <View style={styles.editHeader}>
          <Text style={styles.editLabel}>Editing</Text>
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Artist name</Text>
          <TextInput value={editName} onChangeText={setEditName} style={styles.input} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Stage</Text>
          <TextInput value={editStage} onChangeText={setEditStage} style={styles.input} />
        </View>
        <View style={styles.timeRow}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
            <TextInput value={editStart} onChangeText={setEditStart} style={styles.input} placeholder="e.g. 21:00" />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>End (HH:MM)</Text>
            <TextInput value={editEnd} onChangeText={setEditEnd} style={styles.input} placeholder="e.g. 23:00" />
          </View>
        </View>

        <View style={styles.saveRow}>
          {saving ? (
            <ActivityIndicator color="#183a27" />
          ) : (
            <Pressable onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          )}
          <Pressable onPress={onCancelEdit} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>

        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>⚠ Edits to name, stage, or time affect everyone in your group who has this artist.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.artistName}>{setItem.artist_name}</Text>
          <Text style={styles.details}>{setItem.stage_name} · {timeLabel}</Text>
        </View>
        <Pressable onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.prefRow}>
        <Pressable
          onPress={() => onSetPreference(setItem.canonical_set_id, 'must_see')}
          style={[styles.prefBtn, setItem.preference === 'must_see' && styles.prefBtnActive]}
        >
          <Text style={[styles.prefBtnText, setItem.preference === 'must_see' && styles.prefBtnTextActive]}>Must-See</Text>
        </Pressable>
        <Pressable
          onPress={() => onSetPreference(setItem.canonical_set_id, 'flexible')}
          style={[styles.prefBtn, setItem.preference !== 'must_see' && styles.prefBtnActive]}
        >
          <Text style={[styles.prefBtnText, setItem.preference !== 'must_see' && styles.prefBtnTextActive]}>Maybe</Text>
        </Pressable>
        <Pressable onPress={handleStartEdit} style={styles.editBtn}>
          <Text style={styles.editBtnText}>Edit ✏</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e4d6c3',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fffdfa',
    gap: 6,
  },
  cardEditing: {
    borderWidth: 2,
    borderColor: '#6a9e73',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fffdf8',
    gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, gap: 2 },
  artistName: { color: '#2f2f2f', fontWeight: '700', fontSize: 13 },
  details: { color: '#888', fontSize: 11 },
  prefRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  prefBtn: {
    borderWidth: 1,
    borderColor: '#cab697',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbf6ee',
  },
  prefBtnActive: { backgroundColor: '#e4f2e7', borderColor: '#6a9e73' },
  prefBtnText: { color: '#4a4a4a', fontSize: 12, fontWeight: '700' },
  prefBtnTextActive: { color: '#235232' },
  editBtn: {
    borderWidth: 1,
    borderColor: '#b0c8bc',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f0f7f3',
    marginLeft: 'auto',
  },
  editBtnText: { color: '#345a46', fontSize: 11, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  deleteBtnText: { color: '#b52424', fontWeight: '800', fontSize: 16 },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editLabel: { color: '#2d6a4a', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldGroup: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#5a4d3b' },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 13,
    backgroundColor: '#fff',
  },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#183a27',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#666', fontWeight: '700', fontSize: 13 },
  saveError: { color: '#b52424', fontWeight: '600', fontSize: 12 },
  warningBox: {
    backgroundColor: '#fff8f0',
    borderWidth: 1,
    borderColor: '#e8c89a',
    borderRadius: 8,
    padding: 8,
  },
  warningText: { fontSize: 11, color: '#7a5a2a' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/EditableSetCard.js
git commit -m "feat: add EditableSetCard component with inline edit expand"
git push
```

---

## Task 7: Add handlers to App.js

Three new handlers: `deletePersonalSet`, `addPersonalSet`, `editCanonicalSet`. Also add error message entries for the two new API error codes.

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Add new error message entries**

In `App.js`, find the `API_ERROR_MESSAGES` object and add two entries:

```javascript
  already_in_schedule: 'You already have this artist on your schedule.',
  no_updates_provided: 'No changes were made.',
```

- [ ] **Step 2: Add `deletePersonalSet` handler**

Add after the `setAllMustSee` function in App.js:

```javascript
  const deletePersonalSet = async (canonicalSetId) => {
    // Optimistic: remove immediately from local state
    const previous = personalSets;
    setPersonalSets((prev) => prev.filter((s) => s.canonical_set_id !== canonicalSetId));
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/members/me/sets/${canonicalSetId}`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
    } catch (err) {
      // Rollback
      setPersonalSets(previous);
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const deleteDayParsedSet = async (canonicalSetId) => {
    // Optimistic remove from upload_day list
    const previous = dayParsedSets;
    setDayParsedSets((prev) => prev.filter((s) => s.canonical_set_id !== canonicalSetId));
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/members/me/sets/${canonicalSetId}`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
    } catch (err) {
      setDayParsedSets(previous);
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };
```

- [ ] **Step 3: Add `addPersonalSet` handler**

```javascript
  const addPersonalSet = async (fields) => {
    // fields: { artist_name, stage_name, start_time_pt, end_time_pt, day_index }
    const data = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/sets',
      method: 'POST',
      sessionToken: memberSession,
      body: fields,
    });
    const newSet = {
      canonical_set_id: data.canonical_set_id,
      artist_name: fields.artist_name,
      stage_name: fields.stage_name,
      start_time_pt: fields.start_time_pt,
      end_time_pt: fields.end_time_pt,
      day_index: fields.day_index,
      preference: 'flexible',
      attendance: 'going',
      source_confidence: 1.0,
    };
    setPersonalSets((prev) => [...prev, newSet]);
  };

  const addDayParsedSet = async (fields) => {
    // Same as addPersonalSet but appends to dayParsedSets (upload_day context)
    const data = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/sets',
      method: 'POST',
      sessionToken: memberSession,
      body: fields,
    });
    const newSet = {
      canonical_set_id: data.canonical_set_id,
      artist_name: fields.artist_name,
      stage_name: fields.stage_name,
      start_time_pt: fields.start_time_pt,
      end_time_pt: fields.end_time_pt,
      day_index: fields.day_index,
      preference: 'flexible',
    };
    setDayParsedSets((prev) => [...prev, newSet]);
  };
```

- [ ] **Step 4: Add `editCanonicalSet` handler**

```javascript
  const editCanonicalSet = async (canonicalSetId, fields) => {
    // fields: { artist_name?, stage_name?, start_time_pt?, end_time_pt? }
    await apiRequest({
      baseUrl: apiUrl,
      path: `/v1/canonical-sets/${canonicalSetId}`,
      method: 'PATCH',
      sessionToken: memberSession,
      body: fields,
    });
    // Update both personalSets and dayParsedSets if present
    setPersonalSets((prev) =>
      prev.map((s) =>
        s.canonical_set_id === canonicalSetId ? { ...s, ...fields } : s
      )
    );
    setDayParsedSets((prev) =>
      prev.map((s) =>
        s.canonical_set_id === canonicalSetId ? { ...s, ...fields } : s
      )
    );
  };
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.js
git commit -m "feat(mobile): add deletePersonalSet, addPersonalSet, editCanonicalSet handlers"
git push
```

---

## Task 8: Wire EditMyScheduleScreen

Replace the existing set cards with `EditableSetCard` and add the "+ Add Artist" button.

**Files:**
- Modify: `apps/mobile/src/screens/EditMyScheduleScreen.js`
- Modify: `apps/mobile/App.js` (pass new props)

- [ ] **Step 1: Update `EditMyScheduleScreen.js`**

Replace the entire file with:

```javascript
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EditableSetCard } from '../components/EditableSetCard';

function AddArtistCard({ onAdd, onCancel, defaultDayIndex }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim() || !start.trim() || !end.trim()) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: start.trim(),
        end_time_pt: end.trim(),
        day_index: defaultDayIndex || 1,
      });
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCard}>
      <Text style={styles.addCardLabel}>Add Artist</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Artist name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Bad Bunny" />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Stage</Text>
        <TextInput value={stage} onChangeText={setStage} style={styles.input} placeholder="e.g. Coachella Stage" />
      </View>
      <View style={styles.timeRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
          <TextInput value={start} onChangeText={setStart} style={styles.input} placeholder="21:00" />
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>End (HH:MM)</Text>
          <TextInput value={end} onChangeText={setEnd} style={styles.input} placeholder="23:00" />
        </View>
      </View>
      <View style={styles.saveRow}>
        {saving ? (
          <ActivityIndicator color="#183a27" />
        ) : (
          <Pressable onPress={handleAdd} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.saveError}>{error}</Text> : null}
    </View>
  );
}

export function EditMyScheduleScreen({
  personalSets,
  screenshotCount,
  setScreenshotCount,
  loading,
  onImportPersonal,
  onRefreshPersonal,
  onSetAllMustSee,
  onSetPreference,
  onDeleteSet,
  onAddSet,
  onEditSet,
}) {
  const [editingSetId, setEditingSetId] = useState(null);
  const [savingSetId, setSavingSetId] = useState(null);
  const [deletingSetIds, setDeletingSetIds] = useState(new Set());
  const [isAddingNew, setIsAddingNew] = useState(false);

  const handleSave = async (canonicalSetId, fields) => {
    setSavingSetId(canonicalSetId);
    try {
      await onEditSet(canonicalSetId, fields);
      setEditingSetId(null);
    } finally {
      setSavingSetId(null);
    }
  };

  const handleDelete = async (canonicalSetId) => {
    setDeletingSetIds((prev) => new Set([...prev, canonicalSetId]));
    await onDeleteSet(canonicalSetId);
    setDeletingSetIds((prev) => {
      const next = new Set(prev);
      next.delete(canonicalSetId);
      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Update Your Schedule</Text>
        <Text style={styles.helper}>Upload more screenshots if your plans changed.</Text>
        <TextInput
          value={screenshotCount}
          onChangeText={setScreenshotCount}
          style={styles.input}
          keyboardType="number-pad"
          placeholder="Screenshot count"
        />
        <Pressable onPress={onImportPersonal} style={[styles.buttonPrimary, loading && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>Upload + Re-Parse</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable onPress={onRefreshPersonal} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
          <Pressable onPress={onSetAllMustSee} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>All Must-See</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Your Parsed Sets ({(personalSets || []).length})</Text>
        {(personalSets || []).length ? (
          (personalSets || []).map((setItem) => (
            <EditableSetCard
              key={setItem.canonical_set_id}
              setItem={setItem}
              isEditing={editingSetId === setItem.canonical_set_id}
              onStartEdit={() => setEditingSetId(setItem.canonical_set_id)}
              onCancelEdit={() => setEditingSetId(null)}
              onSave={(fields) => handleSave(setItem.canonical_set_id, fields)}
              onDelete={() => handleDelete(setItem.canonical_set_id)}
              onSetPreference={onSetPreference}
              saving={savingSetId === setItem.canonical_set_id}
              deleting={deletingSetIds.has(setItem.canonical_set_id)}
            />
          ))
        ) : (
          <Text style={styles.helper}>No personal sets loaded yet.</Text>
        )}

        {isAddingNew ? (
          <AddArtistCard
            onAdd={onAddSet}
            onCancel={() => setIsAddingNew(false)}
            defaultDayIndex={1}
          />
        ) : (
          <Pressable onPress={() => setIsAddingNew(true)} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add Artist</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8d8c1',
    padding: 12,
    gap: 8,
  },
  label: { fontWeight: '700', color: '#303030' },
  helper: { color: '#666', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffdf9',
  },
  row: { flexDirection: 'row', gap: 8 },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  addButton: {
    borderWidth: 1,
    borderColor: '#6a9e73',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f0f7f3',
  },
  addButtonText: { color: '#345a46', fontWeight: '700', fontSize: 13 },
  addCard: {
    borderWidth: 1,
    borderColor: '#6a9e73',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fdf8',
    gap: 8,
  },
  addCardLabel: { fontWeight: '700', color: '#2d6a4a', fontSize: 13 },
  fieldGroup: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#5a4d3b' },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#183a27',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#666', fontWeight: '700', fontSize: 13 },
  saveError: { color: '#b52424', fontWeight: '600', fontSize: 12 },
});
```

- [ ] **Step 2: Pass new props from App.js to `EditMyScheduleScreen`**

In `App.js`, find the `<EditMyScheduleScreen` block (around line 1065) and add three new props:

```javascript
          onDeleteSet={deletePersonalSet}
          onAddSet={addPersonalSet}
          onEditSet={editCanonicalSet}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/EditMyScheduleScreen.js apps/mobile/App.js
git commit -m "feat(mobile): add edit/delete/add to EditMyScheduleScreen"
git push
```

---

## Task 9: Wire SetupScreen upload_day step

Add the same edit/delete/add capabilities to the `upload_day` parsed list.

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/App.js` (pass new props)

- [ ] **Step 1: Update the `upload_day` section in `SetupScreen.js`**

At the top of `SetupScreen.js`, add the import:

```javascript
import { EditableSetCard } from '../components/EditableSetCard';
```

Find the `upload_day` section that renders `dayParsedSets`. It currently renders plain `setRow` cards. Replace the sets list section (the `{(dayParsedSets || []).map(...)` block and the re-upload/count header) with:

```javascript
            {dayUploadStatus === 'done' ? (
              <>
                <View style={styles.parsedHeader}>
                  <Text style={styles.parsedCount}>✓ {dayParsedSets.length} artists found</Text>
                  <Pressable onPress={onReuploadDay}>
                    <Text style={styles.skipLink}>Re-upload ↺</Text>
                  </Pressable>
                </View>
                {(dayParsedSets || []).map((setItem) => (
                  <EditableSetCard
                    key={setItem.canonical_set_id}
                    setItem={setItem}
                    isEditing={editingDaySetId === setItem.canonical_set_id}
                    onStartEdit={() => onStartEditDaySet(setItem.canonical_set_id)}
                    onCancelEdit={onCancelEditDaySet}
                    onSave={(fields) => onEditDaySet(setItem.canonical_set_id, fields)}
                    onDelete={() => onDeleteDaySet(setItem.canonical_set_id)}
                    onSetPreference={onSetDayPreference}
                    saving={savingDaySetId === setItem.canonical_set_id}
                  />
                ))}
                {isAddingDaySet ? (
                  <AddArtistCard
                    onAdd={onAddDaySet}
                    onCancel={onCancelAddDaySet}
                    defaultDayIndex={uploadDayIndex}
                  />
                ) : (
                  <Pressable onPress={onStartAddDaySet} style={styles.addButton}>
                    <Text style={styles.addButtonText}>+ Add Artist</Text>
                  </Pressable>
                )}
              </>
            ) : null}
```

Add `AddArtistCard` to `SetupScreen.js` (same component definition as in `EditMyScheduleScreen.js` — copy it verbatim since it's used locally):

```javascript
function AddArtistCard({ onAdd, onCancel, defaultDayIndex }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim() || !start.trim() || !end.trim()) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: start.trim(),
        end_time_pt: end.trim(),
        day_index: defaultDayIndex || 1,
      });
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={setupAddCardStyles.addCard}>
      <Text style={setupAddCardStyles.addCardLabel}>Add Artist</Text>
      <Text style={setupAddCardStyles.fieldLabel}>Artist name</Text>
      <TextInput value={name} onChangeText={setName} style={setupAddCardStyles.input} placeholder="e.g. Bad Bunny" />
      <Text style={setupAddCardStyles.fieldLabel}>Stage</Text>
      <TextInput value={stage} onChangeText={setStage} style={setupAddCardStyles.input} placeholder="e.g. Coachella Stage" />
      <View style={setupAddCardStyles.timeRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={setupAddCardStyles.fieldLabel}>Start (HH:MM)</Text>
          <TextInput value={start} onChangeText={setStart} style={setupAddCardStyles.input} placeholder="21:00" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={setupAddCardStyles.fieldLabel}>End (HH:MM)</Text>
          <TextInput value={end} onChangeText={setEnd} style={setupAddCardStyles.input} placeholder="23:00" />
        </View>
      </View>
      <View style={setupAddCardStyles.saveRow}>
        {saving ? <ActivityIndicator color="#183a27" /> : (
          <Pressable onPress={handleAdd} style={setupAddCardStyles.saveBtn}>
            <Text style={setupAddCardStyles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={setupAddCardStyles.cancelBtn}>
          <Text style={setupAddCardStyles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {error ? <Text style={setupAddCardStyles.saveError}>{error}</Text> : null}
    </View>
  );
}

const setupAddCardStyles = StyleSheet.create({
  addCard: { borderWidth: 1, borderColor: '#6a9e73', borderRadius: 10, padding: 10, backgroundColor: '#f8fdf8', gap: 6 },
  addCardLabel: { fontWeight: '700', color: '#2d6a4a', fontSize: 13 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#5a4d3b' },
  input: { borderWidth: 1, borderColor: '#d8c8b2', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, fontSize: 13, backgroundColor: '#fff' },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: '#183a27', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8c8b2', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: '700', fontSize: 13 },
  saveError: { color: '#b52424', fontWeight: '600', fontSize: 12 },
});
```

Add these to the `SetupScreen` imports: `useState, ActivityIndicator` (if not already present).

Add to the `SetupScreen` props: `editingDaySetId`, `onStartEditDaySet`, `onCancelEditDaySet`, `onEditDaySet`, `onDeleteDaySet`, `savingDaySetId`, `isAddingDaySet`, `onAddDaySet`, `onStartAddDaySet`, `onCancelAddDaySet`.

Add these styles to the existing `StyleSheet.create` in `SetupScreen.js`:

```javascript
  addButton: {
    borderWidth: 1,
    borderColor: '#6a9e73',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f0f7f3',
  },
  addButtonText: { color: '#345a46', fontWeight: '700', fontSize: 13 },
```

- [ ] **Step 2: Add upload_day edit state and pass to SetupScreen in App.js**

In `App.js`, add new state variables after the existing `dayParsedSets` state:

```javascript
  const [editingDaySetId, setEditingDaySetId] = useState(null);
  const [savingDaySetId, setSavingDaySetId] = useState(null);
  const [isAddingDaySet, setIsAddingDaySet] = useState(false);
```

Add handlers (after `deleteDayParsedSet`):

```javascript
  const editDaySet = async (canonicalSetId, fields) => {
    setSavingDaySetId(canonicalSetId);
    try {
      await editCanonicalSet(canonicalSetId, fields);
      setEditingDaySetId(null);
    } finally {
      setSavingDaySetId(null);
    }
  };
```

Pass all new props to `<SetupScreen` in `App.js`:

```javascript
          editingDaySetId={editingDaySetId}
          onStartEditDaySet={(id) => setEditingDaySetId(id)}
          onCancelEditDaySet={() => setEditingDaySetId(null)}
          onEditDaySet={editDaySet}
          onDeleteDaySet={deleteDayParsedSet}
          savingDaySetId={savingDaySetId}
          isAddingDaySet={isAddingDaySet}
          onAddDaySet={addDayParsedSet}
          onStartAddDaySet={() => setIsAddingDaySet(true)}
          onCancelAddDaySet={() => setIsAddingDaySet(false)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/App.js
git commit -m "feat(mobile): add edit/delete/add to SetupScreen upload_day step"
git push
```

---

## Task 10: Invite code in the navigation menu

Show the invite code prominently in the menu with a tap-to-copy button.

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Add clipboard import and copy state to App.js**

At the top of `App.js`, add:

```javascript
import * as Clipboard from 'expo-clipboard';
```

Add state after the existing state declarations:

```javascript
  const [inviteCopied, setInviteCopied] = useState(false);
```

Add a handler (near the other utility handlers):

```javascript
  const copyInviteCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };
```

- [ ] **Step 2: Add invite card to the menu overlay**

In `App.js`, find the menu overlay render block (the `{menuOpen ? ...}` block). Inside `<Pressable style={styles.menuCard}`, add this as the first child before the `<Text style={styles.menuLabel}>Navigate</Text>` line:

```javascript
            {inviteCode ? (
              <View style={styles.menuInviteCard}>
                <Text style={styles.menuInviteLabel}>Invite friends</Text>
                <View style={styles.menuInviteRow}>
                  <Text style={styles.menuInviteCode}>{inviteCode}</Text>
                  <Pressable onPress={copyInviteCode} style={styles.menuCopyBtn}>
                    <Text style={styles.menuCopyBtnText}>{inviteCopied ? 'Copied!' : '📋'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
```

Add these styles to the existing `StyleSheet.create` in `App.js`:

```javascript
  menuInviteCard: {
    backgroundColor: '#f0f7f3',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b0d4bc',
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  menuInviteLabel: { fontSize: 11, fontWeight: '700', color: '#345a46', textTransform: 'uppercase', letterSpacing: 0.5 },
  menuInviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuInviteCode: { fontSize: 22, fontWeight: '800', color: '#183a27', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  menuCopyBtn: { padding: 6 },
  menuCopyBtnText: { fontSize: 18 },
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.js
git commit -m "feat(mobile): show invite code with tap-to-copy in navigation menu"
git push
```

---

## Task 11: Invite code in GroupScheduleScreen

Show a compact invite row at the top of the group schedule, visible to all members.

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`
- Modify: `apps/mobile/App.js` (pass `inviteCode` and `onCopyInvite` props)

- [ ] **Step 1: Update `GroupScheduleScreen.js`**

Add `inviteCode`, `onCopyInvite`, `inviteCopied` to the component props:

```javascript
export function GroupScheduleScreen({
  homeSnapshot,
  scheduleSnapshot,
  selectedMemberIds,
  loading,
  onToggleMember,
  onResetFilters,
  inviteCode,
  onCopyInvite,
  inviteCopied,
}) {
```

Inside `styles.topRow` (the `<View style={styles.topRow}>` that currently holds the Clear Filters button), add the invite row after the existing content:

```javascript
          <View style={styles.topRow}>
            {hasActiveFilters ? (
              <Pressable onPress={onResetFilters} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>Clear Filters</Text>
              </Pressable>
            ) : null}
            {inviteCode ? (
              <Pressable onPress={onCopyInvite} style={styles.inviteRow}>
                <Text style={styles.inviteText}>Invite: <Text style={styles.inviteCode}>{inviteCode}</Text></Text>
                <Text style={styles.inviteCopyIcon}>{inviteCopied ? '✓' : '📋'}</Text>
              </Pressable>
            ) : null}
          </View>
```

Add to `StyleSheet.create` in `GroupScheduleScreen.js`:

```javascript
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  inviteText: { fontSize: 12, color: '#555' },
  inviteCode: { fontWeight: '800', color: '#183a27', letterSpacing: 1 },
  inviteCopyIcon: { fontSize: 14 },
```

- [ ] **Step 2: Pass props from App.js to `GroupScheduleScreen`**

In `App.js`, find the `<GroupScheduleScreen` block and add:

```javascript
          inviteCode={inviteCode}
          onCopyInvite={copyInviteCode}
          inviteCopied={inviteCopied}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/GroupScheduleScreen.js apps/mobile/App.js
git commit -m "feat(mobile): show invite code with tap-to-copy on group schedule screen"
git push
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Delete — Task 2 (backend) + Task 7 (handler) + Task 8 (EditMyScheduleScreen) + Task 9 (SetupScreen)
- ✅ Add (match-or-create) — Task 3 (backend) + Task 7 (handler) + Task 8 + Task 9
- ✅ Edit (shared, with warning) — Task 4 (backend) + Task 7 (handler) + Task 6 (EditableSetCard shows warning)
- ✅ Both surfaces (EditMyScheduleScreen + SetupScreen upload_day) — Tasks 8 + 9
- ✅ Invite code in menu — Task 10
- ✅ Invite code in group schedule — Task 11
- ✅ Optimistic delete — Task 7 (`deletePersonalSet` and `deleteDayParsedSet`)
- ✅ Non-optimistic add — Task 7 (`addPersonalSet` appends only on success)
- ✅ Non-optimistic edit — Task 7 (awaits before updating state) + Task 6 (spinner)
- ✅ 409 "already in schedule" friendly message — Task 7 (error message added to `API_ERROR_MESSAGES`)

**Type/name consistency:**
- `EditableSetCard` props: `onSave`, `onDelete`, `onSetPreference`, `onStartEdit`, `onCancelEdit`, `isEditing`, `saving`, `deleting` — used consistently in Tasks 6, 8, 9
- Handler names: `deletePersonalSet`, `addPersonalSet`, `editCanonicalSet`, `deleteDayParsedSet`, `addDayParsedSet`, `editDaySet` — used consistently in Tasks 7, 8, 9
- Endpoint paths: `/v1/members/me/sets/{id}` (DELETE), `/v1/members/me/sets` (POST), `/v1/canonical-sets/{id}` (PATCH) — consistent across backend tasks and mobile handlers
