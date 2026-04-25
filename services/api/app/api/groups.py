from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import sqlite3
from secrets import token_urlsafe
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi import Header
from fastapi import Request

from app.core.auth import require_session
from app.core.colors import CHIP_COLOR_PALETTE, normalize_chip_color, validate_chip_color
from app.core.db import get_conn
from app.core.image_utils import validate_and_compress, ImageValidationError
from app.core.llm_parser import parse_official_lineup_from_image
from app.schemas.groups import (
    DeleteMemberRequest,
    GroupCreateRequest,
    GroupCreateResponse,
    GroupSummary,
    GroupUpdateRequest,
    JoinInviteRequest,
    InvitePreviewResponse,
    LeaveGroupRequest,
    MemberSummary,
    MemberUpdateRequest,
    SessionSummary,
    _DEFAULT_FESTIVAL_DAYS,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["groups"])

ANONYMOUS_SESSION_LIMIT = 10
ANONYMOUS_SESSION_WINDOW = timedelta(minutes=1)


def _create_session_token(conn) -> str:
    token = token_urlsafe(32)
    while (
        conn.execute("SELECT 1 FROM sessions WHERE token = ?", (token,)).fetchone() is not None
        or conn.execute("SELECT 1 FROM anonymous_sessions WHERE token = ?", (token,)).fetchone() is not None
    ):
        token = token_urlsafe(32)
    return token


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for.strip():
        return forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _enforce_anonymous_session_rate_limit(conn, client_ip: str, now: datetime) -> None:
    window_start = now - ANONYMOUS_SESSION_WINDOW
    conn.execute(
        "DELETE FROM anonymous_session_issuance WHERE created_at < ?",
        (window_start.isoformat(),),
    )
    recent_count = conn.execute(
        "SELECT COUNT(*) AS cnt FROM anonymous_session_issuance WHERE client_ip = ? AND created_at >= ?",
        (client_ip, window_start.isoformat()),
    ).fetchone()["cnt"]
    if recent_count >= ANONYMOUS_SESSION_LIMIT:
        raise HTTPException(status_code=429, detail="session_rate_limited")
    conn.execute(
        """
        INSERT INTO anonymous_session_issuance (id, client_ip, created_at)
        VALUES (?, ?, ?)
        """,
        (str(uuid4()), client_ip, now.isoformat()),
    )


def _reserve_member_color(conn, group_id: str, requested_color: str | None) -> str:
    normalized = normalize_chip_color(requested_color)
    used_rows = conn.execute(
        "SELECT chip_color FROM members WHERE group_id = ? AND active = 1 AND chip_color IS NOT NULL",
        (group_id,),
    ).fetchall()
    used = {row["chip_color"] for row in used_rows}
    available = [color for color in CHIP_COLOR_PALETTE if color not in used]

    if normalized is not None:
        if not validate_chip_color(normalized):
            raise HTTPException(status_code=400, detail="invalid_chip_color")
        if normalized in used:
            raise HTTPException(status_code=409, detail="chip_color_unavailable")
        return normalized

    if not available:
        raise HTTPException(status_code=409, detail="no_chip_colors_available")
    return available[0]


@router.post("/groups", response_model=GroupCreateResponse)
def create_group(payload: GroupCreateRequest) -> GroupCreateResponse:
    group_id = str(uuid4())
    member_id = str(uuid4())
    invite_code = token_urlsafe(8)
    now = _now_iso()
    festival_days = payload.festival_days or _DEFAULT_FESTIVAL_DAYS
    festival_days_json = json.dumps([d.model_dump() for d in festival_days])

    with get_conn() as conn:
        session_token = _create_session_token(conn)
        founder_color = _reserve_member_color(conn, group_id, payload.chip_color)
        conn.execute(
            """
            INSERT INTO groups (id, name, icon_url, invite_code, founder_member_id, setup_complete, festival_days, created_at)
            VALUES (?, ?, NULL, ?, ?, 0, ?, ?)
            """,
            (group_id, payload.group_name.strip(), invite_code, member_id, festival_days_json, now),
        )
        conn.execute(
            """
            INSERT INTO members (id, group_id, display_name, chip_color, avatar_photo_url, role, setup_status, active, created_at)
            VALUES (?, ?, ?, ?, NULL, 'founder', 'incomplete', 1, ?)
            """,
            (member_id, group_id, payload.display_name.strip(), founder_color, now),
        )
        conn.execute(
            """
            INSERT INTO sessions (token, member_id, created_at, active)
            VALUES (?, ?, ?, 1)
            """,
            (session_token, member_id, now),
        )

    return GroupCreateResponse(
        group=GroupSummary(
            id=group_id,
            name=payload.group_name.strip(),
            icon_url=None,
            invite_code=invite_code,
            founder_member_id=member_id,
            festival_days=festival_days,
        ),
        member=MemberSummary(
            id=member_id,
            group_id=group_id,
            display_name=payload.display_name.strip(),
            chip_color=founder_color,
            role="founder",
            setup_status="incomplete",
        ),
        session=SessionSummary(token=session_token),
    )


@router.post("/sessions", response_model=SessionSummary)
def create_session(request: Request) -> SessionSummary:
    now_dt = datetime.now(tz=timezone.utc)
    client_ip = _client_ip(request)
    with get_conn() as conn:
        _enforce_anonymous_session_rate_limit(conn, client_ip, now_dt)
        session_token = _create_session_token(conn)
        conn.execute(
            """
            INSERT INTO anonymous_sessions (token, created_at, active)
            VALUES (?, ?, 1)
            """,
            (session_token, now_dt.isoformat()),
        )
    return SessionSummary(token=session_token)


@router.patch("/groups/{group_id}")
def update_group(
    group_id: str,
    payload: GroupUpdateRequest,
    session=Depends(require_session),
) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    updates: list[str] = []
    values: list[str] = []
    if payload.group_name is not None:
        updates.append("name = ?")
        values.append(payload.group_name.strip())
    if payload.icon_url is not None:
        updates.append("icon_url = ?")
        values.append(payload.icon_url)

    if not updates:
        raise HTTPException(status_code=400, detail="no_updates_provided")

    values.append(group_id)
    with get_conn() as conn:
        result = conn.execute(f"UPDATE groups SET {', '.join(updates)} WHERE id = ?", tuple(values))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="group_not_found")

    return {"ok": True}


@router.get("/invites/{invite_code}/preview", response_model=InvitePreviewResponse)
def preview_invite(invite_code: str) -> InvitePreviewResponse:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, icon_url, setup_complete FROM groups WHERE invite_code = ?",
            (invite_code,),
        ).fetchone()
        if row is not None:
            used_rows = conn.execute(
                "SELECT chip_color FROM members WHERE group_id = ? AND active = 1 AND chip_color IS NOT NULL",
                (row["id"],),
            ).fetchall()
            used = {used_row["chip_color"] for used_row in used_rows}
            available = [color for color in CHIP_COLOR_PALETTE if color not in used]
        else:
            available = []

    if row is None:
        raise HTTPException(status_code=404, detail="invite_not_found")
    if row["setup_complete"] != 1:
        raise HTTPException(status_code=409, detail="setup_pending")

    return InvitePreviewResponse(
        group_id=row["id"],
        group_name=row["name"],
        group_icon_url=row["icon_url"],
        available_chip_colors=available,
    )


@router.post("/invites/{invite_code}/join")
def join_invite(
    invite_code: str,
    payload: JoinInviteRequest,
    x_session_token: str | None = Header(default=None),
) -> dict:
    if not x_session_token:
        raise HTTPException(status_code=401, detail="missing_session")

    with get_conn() as conn:
        target = conn.execute(
            "SELECT id, setup_complete FROM groups WHERE invite_code = ?",
            (invite_code,),
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="invite_not_found")
        if target["setup_complete"] != 1:
            raise HTTPException(status_code=409, detail="setup_pending")

        session = conn.execute(
            """
            SELECT s.token, s.member_id, m.group_id, m.active, m.role
            FROM sessions s
            JOIN members m ON m.id = s.member_id
            WHERE s.token = ? AND s.active = 1
            """,
            (x_session_token,),
        ).fetchone()
        anonymous_session = None
        if session is None:
            anonymous_session = conn.execute(
                "SELECT token FROM anonymous_sessions WHERE token = ? AND active = 1",
                (x_session_token,),
            ).fetchone()
            if anonymous_session is None:
                raise HTTPException(status_code=401, detail="invalid_session")

        target_group_id = target["id"]

        if session is None:
            # Anonymous sessions are brand-new joiners, so there is no prior group to leave.
            next_color = _reserve_member_color(conn, target_group_id, payload.chip_color)
            new_member_id = str(uuid4())
            now = _now_iso()
            try:
                conn.execute(
                    """
                    INSERT INTO members (id, group_id, display_name, chip_color, avatar_photo_url, role, setup_status, active, created_at)
                    VALUES (?, ?, ?, ?, NULL, 'member', 'incomplete', 1, ?)
                    """,
                    (new_member_id, target_group_id, payload.display_name.strip(), next_color, now),
                )
            except sqlite3.IntegrityError as exc:
                if "idx_members_active_group_color" in str(exc):
                    raise HTTPException(status_code=409, detail="chip_color_unavailable") from exc
                raise
            conn.execute(
                """
                INSERT INTO sessions (token, member_id, created_at, active)
                VALUES (?, ?, ?, 1)
                """,
                (anonymous_session["token"], new_member_id, now),
            )
            conn.execute("DELETE FROM anonymous_sessions WHERE token = ?", (anonymous_session["token"],))
            return {"ok": True, "already_joined": False}

        current_group_id = session["group_id"]

        if current_group_id == target_group_id:
            return {"ok": True, "already_joined": True}

        if not payload.leave_current_group:
            raise HTTPException(status_code=409, detail="already_in_group")

        # Leave current group and become fresh profile in the target group.
        conn.execute("UPDATE members SET active = 0 WHERE id = ?", (session["member_id"],))
        next_color = _reserve_member_color(conn, target_group_id, payload.chip_color)
        new_member_id = str(uuid4())
        now = _now_iso()
        try:
            conn.execute(
                """
                INSERT INTO members (id, group_id, display_name, chip_color, avatar_photo_url, role, setup_status, active, created_at)
                VALUES (?, ?, ?, ?, NULL, 'member', 'incomplete', 1, ?)
                """,
                (new_member_id, target_group_id, payload.display_name.strip(), next_color, now),
            )
        except sqlite3.IntegrityError as exc:
            if "idx_members_active_group_color" in str(exc):
                raise HTTPException(status_code=409, detail="chip_color_unavailable") from exc
            raise
        conn.execute(
            "UPDATE sessions SET member_id = ? WHERE token = ?",
            (new_member_id, session["token"]),
        )

    return {"ok": True, "already_joined": False}


@router.patch("/members/me")
def update_member(payload: MemberUpdateRequest, session=Depends(require_session)) -> dict:
    with get_conn() as conn:
        if payload.chip_color is not None:
            normalized = normalize_chip_color(payload.chip_color)
            if not validate_chip_color(normalized):
                raise HTTPException(status_code=400, detail="invalid_chip_color")
            used_rows = conn.execute(
                "SELECT chip_color FROM members WHERE group_id = ? AND active = 1 AND id != ? AND chip_color IS NOT NULL",
                (session["group_id"], session["member_id"]),
            ).fetchall()
            used = {row["chip_color"] for row in used_rows}
            if normalized in used:
                raise HTTPException(status_code=409, detail="chip_color_unavailable")

        fields = []
        values = []
        if payload.display_name is not None:
            fields.append("display_name = ?")
            values.append(payload.display_name.strip())
        if payload.chip_color is not None:
            fields.append("chip_color = ?")
            values.append(normalize_chip_color(payload.chip_color))

        if not fields:
            return {"ok": True}

        values.append(session["member_id"])
        conn.execute(
            f"UPDATE members SET {', '.join(fields)} WHERE id = ?",
            values,
        )
    return {"ok": True}


@router.post("/members/me/leave")
def leave_group(payload: LeaveGroupRequest, session=Depends(require_session)) -> dict:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="confirmation_required")
    if session["role"] == "founder":
        raise HTTPException(status_code=409, detail="founder_cannot_leave")

    with get_conn() as conn:
        conn.execute("UPDATE members SET active = 0 WHERE id = ?", (session["member_id"],))
        conn.execute("UPDATE sessions SET active = 0 WHERE token = ?", (session["token"],))

    return {"ok": True}


@router.delete("/groups/{group_id}")
def delete_group(group_id: str, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE member_id IN (SELECT id FROM members WHERE group_id = ?)", (group_id,))
        conn.execute("DELETE FROM members WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))

    return {"ok": True}


@router.get("/members/me/home")
def member_home(session=Depends(require_session)) -> dict:
    with get_conn() as conn:
        member = conn.execute(
            """
            SELECT m.id, m.group_id, m.display_name, m.chip_color, m.role, m.setup_status,
                   g.name AS group_name, g.icon_url, g.festival_days
            FROM members m
            JOIN groups g ON g.id = m.group_id
            WHERE m.id = ? AND m.active = 1
            """,
            (session["member_id"],),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=401, detail="invalid_session")

        members = conn.execute(
            """
            SELECT id, display_name, chip_color, role, setup_status, active
            FROM members
            WHERE group_id = ? AND active = 1
            ORDER BY created_at
            """,
            (member["group_id"],),
        ).fetchall()

        pref_counts = conn.execute(
            """
            SELECT
              COUNT(*) AS total_sets,
              SUM(CASE WHEN preference = 'must_see' THEN 1 ELSE 0 END) AS must_see_sets,
              SUM(CASE WHEN attendance = 'not_going' THEN 1 ELSE 0 END) AS not_going_sets
            FROM member_set_preferences
            WHERE member_id = ?
            """,
            (member["id"],),
        ).fetchone()

        day_rows = conn.execute(
            """
            SELECT day_index, COUNT(*) AS cnt
            FROM canonical_sets
            WHERE group_id = ? AND source = 'official'
            GROUP BY day_index
            ORDER BY day_index
            """,
            (member["group_id"],),
        ).fetchall()

        has_official_lineup = bool(day_rows)
        official_set_count = 0
        official_days: list[str] = []
        if has_official_lineup:
            official_set_count = sum(row["cnt"] for row in day_rows)
            raw_festival_days = member["festival_days"]
            try:
                festival_days_list = json.loads(raw_festival_days) if raw_festival_days else []
            except (json.JSONDecodeError, TypeError):
                festival_days_list = []
            day_index_to_label = {d["day_index"]: d["label"] for d in festival_days_list}
            official_days = [
                day_index_to_label.get(row["day_index"], f"Day {row['day_index']}")
                for row in day_rows
            ]

    parsed_festival_days = json.loads(member["festival_days"]) if member["festival_days"] else [
        {"day_index": 1, "label": "Friday"},
        {"day_index": 2, "label": "Saturday"},
        {"day_index": 3, "label": "Sunday"},
    ]

    return {
        "festival_days": parsed_festival_days,
        "me": {
            "id": member["id"],
            "display_name": member["display_name"],
            "chip_color": member["chip_color"] if "chip_color" in member.keys() else None,
            "role": member["role"],
            "setup_status": member["setup_status"],
        },
        "group": {
            "id": member["group_id"],
            "name": member["group_name"],
            "icon_url": member["icon_url"],
            "festival_days": parsed_festival_days,
            "has_official_lineup": has_official_lineup,
            "official_set_count": official_set_count,
            "official_days": official_days,
        },
        "members": [
            {
                "id": row["id"],
                "display_name": row["display_name"],
                "chip_color": row["chip_color"] if "chip_color" in row.keys() else None,
                "role": row["role"],
                "setup_status": row["setup_status"],
                "active": bool(row["active"]),
            }
            for row in members
        ],
        "my_sets": {
            "total": pref_counts["total_sets"] if pref_counts and pref_counts["total_sets"] is not None else 0,
            "must_see": pref_counts["must_see_sets"] if pref_counts and pref_counts["must_see_sets"] is not None else 0,
            "not_going": pref_counts["not_going_sets"] if pref_counts and pref_counts["not_going_sets"] is not None else 0,
        },
    }


@router.delete("/members/me")
def delete_member_data(payload: DeleteMemberRequest, session=Depends(require_session)) -> dict:
    """Permanently delete this member's data and session.

    If the member is the founder and the only active member in the group,
    the entire group is deleted as well.
    """
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="confirmation_required")

    with get_conn() as conn:
        member = conn.execute(
            "SELECT id, group_id, role FROM members WHERE id = ? AND active = 1",
            (session["member_id"],),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=401, detail="invalid_session")

        group_id = member["group_id"]

        # Check if this is the only active member in the group
        other_active_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM members WHERE group_id = ? AND active = 1 AND id != ?",
            (group_id, member["id"]),
        ).fetchone()["cnt"]

        if other_active_count == 0:
            # Sole member — delete the whole group
            conn.execute(
                "DELETE FROM member_set_preferences WHERE member_id IN (SELECT id FROM members WHERE group_id = ?)",
                (group_id,),
            )
            conn.execute(
                "DELETE FROM member_parse_jobs WHERE member_id IN (SELECT id FROM members WHERE group_id = ?)",
                (group_id,),
            )
            conn.execute(
                "DELETE FROM sessions WHERE member_id IN (SELECT id FROM members WHERE group_id = ?)",
                (group_id,),
            )
            conn.execute("DELETE FROM canonical_sets WHERE group_id = ?", (group_id,))
            conn.execute("DELETE FROM members WHERE group_id = ?", (group_id,))
            conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
            return {"ok": True, "group_deleted": True}

        # Other members remain — delete only this member's data
        conn.execute(
            "DELETE FROM member_set_preferences WHERE member_id = ?",
            (member["id"],),
        )
        conn.execute(
            "DELETE FROM member_parse_jobs WHERE member_id = ?",
            (member["id"],),
        )
        conn.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
        conn.execute("DELETE FROM members WHERE id = ?", (member["id"],))

    return {"ok": True, "group_deleted": False}


_PRESETS_DIR = Path(__file__).parent.parent / "data" / "presets"


@router.get("/lineup/presets")
def list_lineup_presets() -> dict:
    """Return available official lineup presets (no auth required)."""
    manifest_path = _PRESETS_DIR / "presets_manifest.json"
    if not manifest_path.exists():
        return {"presets": []}
    with manifest_path.open() as f:
        presets = json.load(f)
    return {"presets": presets}


@router.post("/groups/{group_id}/lineup/from-preset")
def import_lineup_from_preset(
    group_id: str,
    body: dict,
    session=Depends(require_session),
) -> dict:
    """Seed the group's canonical_sets from a pre-verified JSON preset (founder only).

    Body: { "preset_id": "coachella_2026_w1" }
    Returns: { "sets_created": int, "days_processed": list[str] }
    """
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    preset_id = body.get("preset_id", "")
    if not preset_id:
        raise HTTPException(status_code=400, detail="preset_id_required")

    manifest_path = _PRESETS_DIR / "presets_manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="presets_not_found")

    with manifest_path.open() as f:
        presets = json.load(f)

    preset = next((p for p in presets if p["id"] == preset_id), None)
    if preset is None:
        raise HTTPException(status_code=404, detail="preset_not_found")

    all_entries: list[dict] = []
    for day in preset["days"]:
        day_file = _PRESETS_DIR / day["file"]
        if not day_file.exists():
            logger.warning(f"Preset file missing: {day['file']}")
            continue
        with day_file.open() as f:
            entries = json.load(f)
        all_entries.extend(entries)

    if not all_entries:
        raise HTTPException(status_code=400, detail="preset_empty")

    with get_conn() as conn:
        group = conn.execute(
            "SELECT id FROM groups WHERE id = ?", (group_id,)
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")

    now = _now_iso()
    sets_created = 0
    days_processed: set[int] = set()

    # Deduplicate preset entries before hitting the DB: same artist can appear
    # multiple times (e.g. two SURPRISE sets at different times on the same stage).
    # Use (artist_name, stage_name, start_time, day_index) as the uniqueness key.
    seen_in_file: set[tuple] = set()
    unique_entries: list[dict] = []
    for entry in all_entries:
        key = (
            entry["artist_name"].lower().strip(),
            entry["stage_name"].lower().strip(),
            entry["start_time"],
            entry["day_index"],
        )
        if key not in seen_in_file:
            seen_in_file.add(key)
            unique_entries.append(entry)

    with get_conn() as conn:
        # Load all existing sets for this group upfront so we can dedup in Python.
        # Use Python's .lower() (not SQLite's LOWER()) so that Unicode artist names
        # with non-ASCII characters (e.g. GIVĒON, MËSTIZA) match correctly.
        existing_rows = conn.execute(
            "SELECT artist_name, stage_name, start_time_pt, day_index FROM canonical_sets WHERE group_id = ?",
            (group_id,),
        ).fetchall()
        existing_keys: set[tuple] = {
            (row[0].lower().strip(), row[1].lower().strip(), row[2], row[3])
            for row in existing_rows
        }

        for entry in unique_entries:
            key = (
                entry["artist_name"].lower().strip(),
                entry["stage_name"].lower().strip(),
                entry["start_time"],
                entry["day_index"],
            )
            if key in existing_keys:
                continue

            conn.execute(
                """
                INSERT INTO canonical_sets
                (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                 day_index, status, source_confidence, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 1.0, 'official', ?)
                """,
                (
                    str(uuid4()),
                    group_id,
                    entry["artist_name"],
                    entry["stage_name"],
                    entry["start_time"],
                    entry["end_time"] or entry["start_time"],
                    entry["day_index"],
                    now,
                ),
            )
            existing_keys.add(key)
            sets_created += 1
            days_processed.add(entry["day_index"])

    day_labels = [
        next(
            (d["label"] for d in preset["days"] if d["day_index"] == di),
            f"Day {di}",
        )
        for di in sorted(days_processed)
    ]

    return {"sets_created": sets_created, "days_processed": day_labels}


@router.post("/groups/{group_id}/lineup/import")
async def import_official_lineup(
    group_id: str,
    images: list[UploadFile] = File(...),
    session=Depends(require_session),
) -> dict:
    """Import the official festival lineup from graphic images (founder only).

    Accepts up to 3 official day lineup images. Parses all artists using
    Claude Vision concurrently and seeds canonical_sets with source='official'.
    Skips duplicates (same artist + day already exists for group).
    """
    import asyncio

    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    with get_conn() as conn:
        group = conn.execute(
            "SELECT id, festival_days FROM groups WHERE id = ?",
            (group_id,),
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")
        festival_days = json.loads(group["festival_days"]) if group["festival_days"] else [
            {"day_index": 1, "label": "Friday"},
            {"day_index": 2, "label": "Saturday"},
            {"day_index": 3, "label": "Sunday"},
        ]

    # Phase 1: read + validate all images (sequential, cheap)
    compressed_images: list[bytes] = []
    for image in images:
        raw = await image.read()
        try:
            compressed = validate_and_compress(raw)
            compressed_images.append(compressed)
        except ImageValidationError as e:
            logger.warning(f"Official lineup image validation failed: {e}")

    if not compressed_images:
        raise HTTPException(status_code=400, detail="no_valid_images")

    # Phase 2: parse all images concurrently (Anthropic client is sync → thread pool)
    async def _parse_one(image_bytes: bytes) -> list[dict]:
        return await asyncio.to_thread(
            parse_official_lineup_from_image, image_bytes, festival_days
        )

    try:
        results = await asyncio.gather(*[_parse_one(img) for img in compressed_images])
    except Exception as e:
        logger.error(f"Official lineup parse failed: {e}")
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")

    all_parsed: list[dict] = []
    days_processed: set[int] = set()
    for parsed in results:
        logger.info(f"Official lineup parse: {len(parsed)} sets")
        all_parsed.extend(parsed)
        for entry in parsed:
            days_processed.add(entry["day_index"])

    if not all_parsed:
        raise HTTPException(status_code=400, detail="no_sets_parsed")

    now = _now_iso()
    sets_created = 0

    with get_conn() as conn:
        for entry in all_parsed:
            existing = conn.execute(
                """
                SELECT id FROM canonical_sets
                WHERE group_id = ?
                  AND LOWER(TRIM(artist_name)) = ?
                  AND day_index = ?
                """,
                (group_id, entry["artist_name"].lower().strip(), entry["day_index"]),
            ).fetchone()

            if existing:
                continue

            conn.execute(
                """
                INSERT INTO canonical_sets
                (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                 day_index, status, source_confidence, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 1.0, 'official', ?)
                """,
                (
                    str(uuid4()),
                    group_id,
                    entry["artist_name"],
                    entry["stage_name"],
                    entry["start_time"],
                    entry["end_time"] or entry["start_time"],
                    entry["day_index"],
                    now,
                ),
            )
            sets_created += 1

    day_labels = [
        next((d["label"] for d in festival_days if d["day_index"] == di), f"Day {di}")
        for di in sorted(days_processed)
    ]

    return {"sets_created": sets_created, "days_processed": day_labels}


@router.delete("/groups/{group_id}/lineup")
def delete_official_lineup(group_id: str, session=Depends(require_session)) -> dict:
    """Delete all official lineup sets for a group (founder only).

    Also deletes member_set_preferences pointing to those sets, since they
    would be orphaned. Non-official canonical_sets and their preferences
    are untouched.
    """
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    with get_conn() as conn:
        official_rows = conn.execute(
            "SELECT id FROM canonical_sets WHERE group_id = ? AND source = 'official'",
            (group_id,),
        ).fetchall()
        official_ids = [row["id"] for row in official_rows]

        if official_ids:
            placeholders = ",".join("?" * len(official_ids))
            conn.execute(
                f"DELETE FROM member_set_preferences WHERE canonical_set_id IN ({placeholders})",
                official_ids,
            )
            conn.execute(
                "DELETE FROM canonical_sets WHERE group_id = ? AND source = 'official'",
                (group_id,),
            )

    return {"ok": True, "sets_deleted": len(official_ids)}
