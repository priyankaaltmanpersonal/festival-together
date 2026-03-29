from datetime import datetime, timedelta, timezone
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.auth import require_session
from app.core.db import get_conn
from app.core.image_utils import ImageValidationError, validate_and_compress
from app.core.parser import ScreenshotInput, build_demo_canonical_screenshots, parse_canonical_screenshots
from app.schemas.canonical import CanonicalImportRequest, CanonicalReviewResponse, CanonicalSet

router = APIRouter(tags=["canonical"])

MAX_UPLOAD_IMAGES = 30


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _coerce_screenshots(payload: CanonicalImportRequest) -> list[ScreenshotInput]:
    if payload.screenshots:
        return [
            ScreenshotInput(
                source_id=item.source_id or f"canonical-upload-{index + 1}",
                raw_text=item.raw_text,
            )
            for index, item in enumerate(payload.screenshots)
        ]
    return build_demo_canonical_screenshots(payload.screenshot_count)


@router.post("/groups/{group_id}/canonical/import")
def import_canonical(group_id: str, payload: CanonicalImportRequest, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    now = _now()
    job_id = str(uuid4())
    screenshots = _coerce_screenshots(payload)
    parse_outcome = parse_canonical_screenshots(screenshots)

    with get_conn() as conn:
        group = conn.execute("SELECT id FROM groups WHERE id = ?", (group_id,)).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")
        if not parse_outcome.sets:
            raise HTTPException(status_code=400, detail="no_parsed_sets")

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
                len(screenshots),
                parse_outcome.unresolved_count,
                now.isoformat(),
                now.isoformat(),
            ),
        )

        conn.executemany(
            """
            INSERT INTO canonical_sets (
              id,
              group_id,
              artist_name,
              stage_name,
              start_time_pt,
              end_time_pt,
              day_index,
              status,
              source_confidence,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(uuid4()),
                    group_id,
                    item.artist_name,
                    item.stage_name,
                    item.start_time_pt,
                    item.end_time_pt,
                    item.day_index,
                    item.status,
                    round(item.source_confidence, 2),
                    now.isoformat(),
                )
                for item in parse_outcome.sets
            ],
        )

        retention = (now + timedelta(hours=24)).isoformat()
        for screenshot in screenshots:
            conn.execute(
                """
                INSERT INTO parse_artifacts (id, parse_job_id, temp_image_path, retention_expires_at, deleted_at)
                VALUES (?, ?, ?, ?, NULL)
                """,
                (str(uuid4()), job_id, f"tmp/canonical/{job_id}/{screenshot.source_id}.txt", retention),
            )

        conn.execute("UPDATE groups SET setup_complete = 0 WHERE id = ?", (group_id,))

    return {"ok": True, "parse_job_id": job_id, "unresolved_count": parse_outcome.unresolved_count}


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
            SELECT id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status, source_confidence
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
            source_confidence=row["source_confidence"],
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


@router.post("/groups/{group_id}/canonical/upload")
def upload_canonical_images(
    group_id: str,
    images: List[UploadFile] = File(...),
    session=Depends(require_session),
) -> dict:
    """Accept real schedule screenshot uploads, run OCR, parse, and store canonical sets.

    Accepts up to 30 JPEG/PNG images as multipart/form-data.
    Each image is validated, compressed, and sent to Google Cloud Vision.
    The extracted text is passed to the existing parser pipeline.
    """
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")
    if len(images) > MAX_UPLOAD_IMAGES:
        raise HTTPException(status_code=400, detail="too_many_images")

    # Validate group exists before spending time on OCR
    with get_conn() as conn:
        group = conn.execute("SELECT id FROM groups WHERE id = ?", (group_id,)).fetchone()
    if group is None:
        raise HTTPException(status_code=404, detail="group_not_found")

    screenshots: list[ScreenshotInput] = []
    failed_count = 0

    for idx, upload in enumerate(images):
        raw = upload.file.read()
        try:
            compressed = validate_and_compress(raw)
        except ImageValidationError:
            failed_count += 1
            continue

        # TODO(Task 2): replace with parse_schedule_from_image vision call
        raise HTTPException(status_code=501, detail="upload_not_implemented")

        screenshots.append(
            ScreenshotInput(
                source_id=upload.filename or f"canonical-upload-{idx + 1}",
                raw_text=text,
            )
        )

    if not screenshots:
        raise HTTPException(status_code=400, detail="no_parsed_sets")

    parse_outcome = parse_canonical_screenshots(screenshots)
    if not parse_outcome.sets:
        raise HTTPException(status_code=400, detail="no_parsed_sets")

    now = _now()
    job_id = str(uuid4())

    with get_conn() as conn:
        conn.execute("DELETE FROM canonical_sets WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM canonical_parse_jobs WHERE group_id = ?", (group_id,))

        conn.execute(
            """
            INSERT INTO canonical_parse_jobs (id, group_id, status, screenshot_count, unresolved_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, ?, ?)
            """,
            (job_id, group_id, len(screenshots), parse_outcome.unresolved_count, now.isoformat(), now.isoformat()),
        )

        conn.executemany(
            """
            INSERT INTO canonical_sets (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status, source_confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(uuid4()), group_id, item.artist_name, item.stage_name,
                    item.start_time_pt, item.end_time_pt, item.day_index,
                    item.status, round(item.source_confidence, 2), now.isoformat(),
                )
                for item in parse_outcome.sets
            ],
        )

        retention = (now + timedelta(hours=24)).isoformat()
        for screenshot in screenshots:
            conn.execute(
                "INSERT INTO parse_artifacts (id, parse_job_id, temp_image_path, retention_expires_at, deleted_at) VALUES (?, ?, ?, ?, NULL)",
                (str(uuid4()), job_id, f"tmp/canonical/{job_id}/{screenshot.source_id}", retention),
            )

        conn.execute("UPDATE groups SET setup_complete = 0 WHERE id = ?", (group_id,))

    return {
        "ok": True,
        "parse_job_id": job_id,
        "parsed_count": len(parse_outcome.sets),
        "failed_count": failed_count,
        "unresolved_count": parse_outcome.unresolved_count,
    }
