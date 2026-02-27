from datetime import datetime, timezone
from secrets import token_urlsafe
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_session
from app.core.db import get_conn
from app.schemas.groups import (
    GroupCreateRequest,
    GroupCreateResponse,
    GroupSummary,
    GroupUpdateRequest,
    JoinInviteRequest,
    InvitePreviewResponse,
    LeaveGroupRequest,
    MemberSummary,
    SessionSummary,
)

router = APIRouter(tags=["groups"])


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


@router.post("/groups", response_model=GroupCreateResponse)
def create_group(payload: GroupCreateRequest) -> GroupCreateResponse:
    group_id = str(uuid4())
    member_id = str(uuid4())
    invite_code = token_urlsafe(8)
    session_token = token_urlsafe(32)
    now = _now_iso()

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO groups (id, name, icon_url, invite_code, founder_member_id, setup_complete, created_at)
            VALUES (?, ?, NULL, ?, ?, 0, ?)
            """,
            (group_id, payload.group_name.strip(), invite_code, member_id, now),
        )
        conn.execute(
            """
            INSERT INTO members (id, group_id, display_name, avatar_photo_url, role, setup_status, active, created_at)
            VALUES (?, ?, ?, NULL, 'founder', 'complete', 1, ?)
            """,
            (member_id, group_id, payload.display_name.strip(), now),
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
        ),
        member=MemberSummary(
            id=member_id,
            group_id=group_id,
            display_name=payload.display_name.strip(),
            role="founder",
            setup_status="complete",
        ),
        session=SessionSummary(token=session_token),
    )


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

    if row is None:
        raise HTTPException(status_code=404, detail="invite_not_found")
    if row["setup_complete"] != 1:
        raise HTTPException(status_code=409, detail="setup_pending")

    return InvitePreviewResponse(
        group_id=row["id"],
        group_name=row["name"],
        group_icon_url=row["icon_url"],
    )


@router.post("/invites/{invite_code}/join")
def join_invite(
    invite_code: str,
    payload: JoinInviteRequest,
    session=Depends(require_session),
) -> dict:
    with get_conn() as conn:
        target = conn.execute(
            "SELECT id, setup_complete FROM groups WHERE invite_code = ?",
            (invite_code,),
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="invite_not_found")
        if target["setup_complete"] != 1:
            raise HTTPException(status_code=409, detail="setup_pending")

        member = conn.execute(
            "SELECT id, group_id, active FROM members WHERE id = ?",
            (session["member_id"],),
        ).fetchone()
        if member is None or member["active"] != 1:
            raise HTTPException(status_code=401, detail="invalid_session")

        current_group_id = member["group_id"]
        target_group_id = target["id"]

        if current_group_id == target_group_id:
            return {"ok": True, "already_joined": True}

        if not payload.leave_current_group:
            raise HTTPException(status_code=409, detail="already_in_group")

        # Leave current group and become fresh profile in the target group.
        conn.execute("UPDATE members SET active = 0 WHERE id = ?", (session["member_id"],))
        new_member_id = str(uuid4())
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO members (id, group_id, display_name, avatar_photo_url, role, setup_status, active, created_at)
            VALUES (?, ?, ?, NULL, 'member', 'incomplete', 1, ?)
            """,
            (new_member_id, target_group_id, payload.display_name.strip(), now),
        )
        conn.execute(
            "UPDATE sessions SET member_id = ? WHERE token = ?",
            (new_member_id, session["token"]),
        )

    return {"ok": True, "already_joined": False}


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
            SELECT m.id, m.group_id, m.display_name, m.role, m.setup_status, g.name AS group_name, g.icon_url
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
            SELECT id, display_name, role, setup_status, active
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

    return {
        "me": {
            "id": member["id"],
            "display_name": member["display_name"],
            "role": member["role"],
            "setup_status": member["setup_status"],
        },
        "group": {
            "id": member["group_id"],
            "name": member["group_name"],
            "icon_url": member["icon_url"],
        },
        "members": [
            {
                "id": row["id"],
                "display_name": row["display_name"],
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
