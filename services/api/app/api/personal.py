from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_session
from app.core.db import get_conn
from app.schemas.personal import (
    CompleteSetupRequest,
    MemberSetUpdateRequest,
    PersonalImportRequest,
    PersonalReviewResponse,
    PersonalSet,
)

router = APIRouter(tags=["personal"])


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _select_mapped_rows(canonical_rows, member_id: str, screenshot_count: int):
    if len(canonical_rows) == 0:
        return []

    # Deterministic member-specific mapping to create overlap variety in demo data.
    seed = sum(ord(ch) for ch in member_id)
    desired_count = min(len(canonical_rows), max(4, min(12, screenshot_count * 2)))
    start_idx = seed % len(canonical_rows)
    stride = 5 + (seed % 7)

    selected = []
    seen = set()
    idx = start_idx
    while len(selected) < desired_count and len(seen) < len(canonical_rows):
        if idx not in seen:
            selected.append(canonical_rows[idx])
            seen.add(idx)
        idx = (idx + stride) % len(canonical_rows)

    return selected


@router.post("/members/me/personal/import")
def import_personal(payload: PersonalImportRequest, session=Depends(require_session)) -> dict:
    now = _now_iso()
    parse_job_id = str(uuid4())

    with get_conn() as conn:
        member = conn.execute(
            "SELECT id, group_id, active FROM members WHERE id = ?",
            (session["member_id"],),
        ).fetchone()
        if member is None or member["active"] != 1:
            raise HTTPException(status_code=401, detail="invalid_session")

        canonical_rows = conn.execute(
            """
            SELECT id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status
            FROM canonical_sets
            WHERE group_id = ? AND status = 'resolved'
            ORDER BY day_index, start_time_pt
            """,
            (member["group_id"],),
        ).fetchall()
        if len(canonical_rows) == 0:
            raise HTTPException(status_code=409, detail="canonical_not_ready")

        conn.execute("DELETE FROM member_parse_jobs WHERE member_id = ?", (session["member_id"],))

        # Simulate mapped parse results with deterministic per-member variety.
        mapped_rows = _select_mapped_rows(
            canonical_rows,
            member_id=session["member_id"],
            screenshot_count=payload.screenshot_count,
        )
        if len(mapped_rows) == 0:
            raise HTTPException(status_code=400, detail="no_parsed_sets")

        conn.execute("DELETE FROM member_set_preferences WHERE member_id = ?", (session["member_id"],))

        for row in mapped_rows:
            conn.execute(
                """
                INSERT INTO member_set_preferences
                (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
                VALUES (?, ?, ?, 'flexible', 'going', ?, ?, ?)
                """,
                (str(uuid4()), session["member_id"], row["id"], 0.85, now, now),
            )

        conn.execute(
            """
            INSERT INTO member_parse_jobs (id, member_id, status, screenshot_count, parsed_count, failed_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, 0, ?, ?)
            """,
            (parse_job_id, session["member_id"], payload.screenshot_count, len(mapped_rows), now, now),
        )
        conn.execute(
            "UPDATE members SET setup_status = 'incomplete' WHERE id = ?",
            (session["member_id"],),
        )

    return {"ok": True, "parse_job_id": parse_job_id, "parsed_count": len(mapped_rows), "failed_count": 0}


@router.get("/members/me/personal/review", response_model=PersonalReviewResponse)
def review_personal(session=Depends(require_session)) -> PersonalReviewResponse:
    with get_conn() as conn:
        job = conn.execute(
            """
            SELECT id, parsed_count, failed_count
            FROM member_parse_jobs
            WHERE member_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (session["member_id"],),
        ).fetchone()
        rows = conn.execute(
            """
            SELECT
              msp.canonical_set_id,
              cs.artist_name,
              cs.stage_name,
              cs.start_time_pt,
              cs.end_time_pt,
              cs.day_index,
              msp.preference,
              msp.attendance,
              msp.source_confidence
            FROM member_set_preferences msp
            JOIN canonical_sets cs ON cs.id = msp.canonical_set_id
            WHERE msp.member_id = ?
            ORDER BY cs.day_index, cs.start_time_pt
            """,
            (session["member_id"],),
        ).fetchall()

    sets = [
        PersonalSet(
            canonical_set_id=row["canonical_set_id"],
            artist_name=row["artist_name"],
            stage_name=row["stage_name"],
            start_time_pt=row["start_time_pt"],
            end_time_pt=row["end_time_pt"],
            day_index=row["day_index"],
            preference=row["preference"],
            attendance=row["attendance"],
            source_confidence=row["source_confidence"],
        )
        for row in rows
    ]

    return PersonalReviewResponse(
        parse_job_id=job["id"] if job else None,
        parsed_count=job["parsed_count"] if job else 0,
        failed_count=job["failed_count"] if job else 0,
        sets=sets,
    )


@router.patch("/members/me/sets/{canonical_set_id}")
def update_member_set(canonical_set_id: str, payload: MemberSetUpdateRequest, session=Depends(require_session)) -> dict:
    allowed_preferences = {"must_see", "flexible"}
    allowed_attendance = {"going", "not_going"}

    updates: list[str] = []
    values: list[str | float] = []
    if payload.preference is not None:
        if payload.preference not in allowed_preferences:
            raise HTTPException(status_code=400, detail="invalid_preference")
        updates.append("preference = ?")
        values.append(payload.preference)
    if payload.attendance is not None:
        if payload.attendance not in allowed_attendance:
            raise HTTPException(status_code=400, detail="invalid_attendance")
        updates.append("attendance = ?")
        values.append(payload.attendance)

    if not updates:
        raise HTTPException(status_code=400, detail="no_updates_provided")

    updates.append("updated_at = ?")
    values.append(_now_iso())
    values.extend([session["member_id"], canonical_set_id])

    with get_conn() as conn:
        result = conn.execute(
            f"""
            UPDATE member_set_preferences
            SET {', '.join(updates)}
            WHERE member_id = ? AND canonical_set_id = ?
            """,
            tuple(values),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="set_not_found")

    return {"ok": True}


@router.post("/members/me/setup/complete")
def complete_setup(payload: CompleteSetupRequest, session=Depends(require_session)) -> dict:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="confirmation_required")

    with get_conn() as conn:
        pref_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM member_set_preferences WHERE member_id = ?",
            (session["member_id"],),
        ).fetchone()
        if pref_count is None or pref_count["cnt"] < 1:
            raise HTTPException(status_code=400, detail="at_least_one_set_required")

        conn.execute(
            "UPDATE members SET setup_status = 'complete' WHERE id = ?",
            (session["member_id"],),
        )

    return {"ok": True}
