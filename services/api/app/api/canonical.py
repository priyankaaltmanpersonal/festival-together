from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_session
from app.core.db import get_conn
from app.schemas.canonical import CanonicalImportRequest, CanonicalReviewResponse, CanonicalSet

router = APIRouter(tags=["canonical"])


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


@router.post("/groups/{group_id}/canonical/import")
def import_canonical(group_id: str, payload: CanonicalImportRequest, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    now = _now()
    job_id = str(uuid4())
    unresolved_count = 1

    with get_conn() as conn:
        group = conn.execute("SELECT id FROM groups WHERE id = ?", (group_id,)).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")

        conn.execute("DELETE FROM canonical_sets WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM canonical_parse_jobs WHERE group_id = ?", (group_id,))

        conn.execute(
            """
            INSERT INTO canonical_parse_jobs (id, group_id, status, screenshot_count, unresolved_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, ?, ?)
            """,
            (
                job_id,
                group_id,
                payload.screenshot_count,
                unresolved_count,
                now.isoformat(),
                now.isoformat(),
            ),
        )

        # Placeholder parse output for M2 wiring; real OCR mapping lands in parser-worker milestones.
        sets = [
            (str(uuid4()), group_id, "Artist A", "Main Stage", "18:00", "18:45", 1, "resolved", now.isoformat()),
            (str(uuid4()), group_id, "Artist B", "Sahara", "19:00", "19:45", 1, "resolved", now.isoformat()),
            (str(uuid4()), group_id, "Unresolved Set", "TBD", "20:00", "20:45", 1, "unresolved", now.isoformat()),
        ]
        conn.executemany(
            """
            INSERT INTO canonical_sets (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            sets,
        )

        retention = (now + timedelta(hours=24)).isoformat()
        for idx in range(payload.screenshot_count):
            conn.execute(
                """
                INSERT INTO parse_artifacts (id, parse_job_id, temp_image_path, retention_expires_at, deleted_at)
                VALUES (?, ?, ?, ?, NULL)
                """,
                (str(uuid4()), job_id, f"tmp/canonical/{job_id}/{idx}.jpg", retention),
            )

        conn.execute("UPDATE groups SET setup_complete = 0 WHERE id = ?", (group_id,))

    return {"ok": True, "parse_job_id": job_id, "unresolved_count": unresolved_count}


@router.get("/groups/{group_id}/canonical/review", response_model=CanonicalReviewResponse)
def review_canonical(group_id: str, session=Depends(require_session)) -> CanonicalReviewResponse:
    if session["group_id"] != group_id:
        raise HTTPException(status_code=403, detail="forbidden")

    with get_conn() as conn:
        job = conn.execute(
            "SELECT id, unresolved_count FROM canonical_parse_jobs WHERE group_id = ? ORDER BY created_at DESC LIMIT 1",
            (group_id,),
        ).fetchone()
        rows = conn.execute(
            """
            SELECT id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status
            FROM canonical_sets
            WHERE group_id = ?
            ORDER BY day_index, start_time_pt, stage_name
            """,
            (group_id,),
        ).fetchall()

    sets = [
        CanonicalSet(
            id=row["id"],
            artist_name=row["artist_name"],
            stage_name=row["stage_name"],
            start_time_pt=row["start_time_pt"],
            end_time_pt=row["end_time_pt"],
            day_index=row["day_index"],
            status=row["status"],
        )
        for row in rows
    ]

    return CanonicalReviewResponse(
        parse_job_id=job["id"] if job else None,
        unresolved_count=job["unresolved_count"] if job else 0,
        sets=sets,
    )


@router.post("/groups/{group_id}/canonical/confirm")
def confirm_canonical(group_id: str, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    with get_conn() as conn:
        has_sets = conn.execute(
            "SELECT COUNT(*) AS cnt FROM canonical_sets WHERE group_id = ?",
            (group_id,),
        ).fetchone()
        if has_sets is None or has_sets["cnt"] == 0:
            raise HTTPException(status_code=400, detail="canonical_not_imported")

        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))

    return {"ok": True}
