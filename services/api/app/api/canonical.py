from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_session
from app.core.db import get_conn
from app.schemas.canonical import CanonicalImportRequest, CanonicalReviewResponse, CanonicalSet

router = APIRouter(tags=["canonical"])


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _seed_full_day_sets(group_id: str, now: datetime) -> list[tuple]:
    stages = ["Main Stage", "Sahara", "Outdoor", "Mojave", "Gobi", "Sonora"]
    artist_pool = [
        "Aurora Skyline", "Neon Valley", "Desert Echo", "Sundial City", "Palm Static", "Mirage Club",
        "Golden Transit", "Afterglow Kids", "Cactus Choir", "Solar Ritual", "Moonline", "Circuit Bloom",
        "Dune Parade", "Velvet Arcade", "Night Ferry", "Cosmic Lanes", "Heatwave Social", "Luma Avenue",
        "Atlas Garden", "Echo Harbor", "Midnight Current", "Prism Motel", "Radiant Form", "Tropic Fade",
    ]
    sets: list[tuple] = []
    artist_idx = 0
    for stage_idx, stage in enumerate(stages):
        current_min = (12 * 60) + (stage_idx * 10)  # stagger start per stage
        slot = 0
        while current_min <= (23 * 60):
            start_hour = current_min // 60
            if start_hour < 17:
                duration = [45, 50, 60][(slot + stage_idx) % 3]
            elif start_hour < 20:
                duration = [60, 70, 75][(slot + stage_idx) % 3]
            else:
                duration = [75, 85, 90][(slot + stage_idx) % 3]
            gap = [30, 45, 60][(slot + stage_idx + 1) % 3]
            start_h, start_m = divmod(current_min, 60)
            end_total = current_min + duration
            # Keep seeded demo data within a single calendar day; real OCR imports can span midnight.
            if end_total > (23 * 60 + 59):
                break
            end_h, end_m = divmod(end_total, 60)

            artist_name = artist_pool[artist_idx % len(artist_pool)]
            artist_idx += 1
            sets.append(
                (
                    str(uuid4()),
                    group_id,
                    artist_name,
                    stage,
                    f"{start_h:02d}:{start_m:02d}",
                    f"{end_h:02d}:{end_m:02d}",
                    1,
                    "resolved",
                    now.isoformat(),
                )
            )
            current_min = end_total + gap
            slot += 1
    return sets


@router.post("/groups/{group_id}/canonical/import")
def import_canonical(group_id: str, payload: CanonicalImportRequest, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    now = _now()
    job_id = str(uuid4())
    unresolved_count = 0

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
        sets = _seed_full_day_sets(group_id, now)
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
