from datetime import datetime, timezone
import json
import logging
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import require_session
from app.core.db import get_conn
from app.core.image_utils import ImageValidationError, validate_and_compress
from app.core.llm_parser import parse_schedule_from_image
from app.core.parser import ScreenshotInput, build_demo_personal_screenshots, parse_personal_screenshots
from app.schemas.personal import (
    AddSetRequest,
    CompleteSetupRequest,
    MemberSetUpdateRequest,
    PersonalImportRequest,
    PersonalReviewResponse,
    PersonalSet,
)

logger = logging.getLogger(__name__)

MAX_UPLOAD_IMAGES = 30

router = APIRouter(tags=["personal"])


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _coerce_personal_screenshots(payload: PersonalImportRequest, canonical_rows, member_id: str) -> list[ScreenshotInput]:
    if payload.screenshots:
        return [
            ScreenshotInput(
                source_id=item.source_id or f"personal-upload-{index + 1}",
                raw_text=item.raw_text,
            )
            for index, item in enumerate(payload.screenshots)
        ]
    return build_demo_personal_screenshots(canonical_rows, member_id=member_id, screenshot_count=payload.screenshot_count)


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
        conn.execute("DELETE FROM member_set_preferences WHERE member_id = ?", (session["member_id"],))

        screenshots = _coerce_personal_screenshots(
            payload,
            canonical_rows=canonical_rows,
            member_id=session["member_id"],
        )
        mapped_rows = parse_personal_screenshots(screenshots, canonical_rows)
        if len(mapped_rows) == 0:
            raise HTTPException(status_code=400, detail="no_parsed_sets")

        for row in mapped_rows:
            conn.execute(
                """
                INSERT INTO member_set_preferences
                (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
                VALUES (?, ?, ?, 'flexible', 'going', ?, ?, ?)
                """,
                (str(uuid4()), session["member_id"], row.canonical_set_id, row.source_confidence, now, now),
            )

        conn.execute(
            """
            INSERT INTO member_parse_jobs (id, member_id, status, screenshot_count, parsed_count, failed_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, 0, ?, ?)
            """,
            (parse_job_id, session["member_id"], len(screenshots), len(mapped_rows), now, now),
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


@router.post("/members/me/setup/complete")
def complete_setup(payload: CompleteSetupRequest, session=Depends(require_session)) -> dict:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="confirmation_required")

    with get_conn() as conn:
        member = conn.execute(
            "SELECT id, group_id, role FROM members WHERE id = ? AND active = 1",
            (session["member_id"],),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=401, detail="invalid_session")

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

        # Founder completing setup opens the group for members to join
        if member["role"] == "founder":
            conn.execute(
                "UPDATE groups SET setup_complete = 1 WHERE id = ?",
                (member["group_id"],),
            )

    return {"ok": True}


@router.post("/members/me/personal/upload")
def upload_personal_images(
    images: List[UploadFile] = File(...),
    day_label: str = Form(None),
    session=Depends(require_session),
) -> dict:
    """Accept schedule screenshot uploads (list view or grid/column view).

    Uses Claude Haiku to interpret OCR text from any screenshot format.
    Parsed sets are upserted into the group's canonical schedule (union approach)
    and saved as this member's preferences. Re-uploading merges — it never
    deletes sets or preferences from previous uploads.
    """
    if len(images) > MAX_UPLOAD_IMAGES:
        raise HTTPException(status_code=400, detail="too_many_images")

    # ── Phase 1: read member + group festival config ──────────────────────────
    with get_conn() as conn:
        member = conn.execute(
            """
            SELECT m.id, m.group_id, m.active, g.festival_days
            FROM members m JOIN groups g ON g.id = m.group_id
            WHERE m.id = ? AND m.active = 1
            """,
            (session["member_id"],),
        ).fetchone()
        if member is None or member["active"] != 1:
            raise HTTPException(status_code=401, detail="invalid_session")

        festival_days = json.loads(member["festival_days"]) if member["festival_days"] else [
            {"day_index": 1, "label": "Friday"},
            {"day_index": 2, "label": "Saturday"},
            {"day_index": 3, "label": "Sunday"},
        ]

    # ── Phase 2: Claude vision parse (outside DB transaction) ────────────────
    failed_count = 0
    all_parsed: list[dict] = []
    effective_day_label = day_label or (festival_days[0]["label"] if festival_days else "")

    for idx, upload in enumerate(images):
        upload.file.seek(0)
        raw = upload.file.read()
        try:
            compressed = validate_and_compress(raw)
        except ImageValidationError:
            failed_count += 1
            continue

        try:
            parsed = parse_schedule_from_image(compressed, effective_day_label, festival_days)
            logger.info(f"Vision parse for image {idx + 1}: {len(parsed)} sets")
            all_parsed.extend(parsed)
        except Exception as e:
            logger.error(f"Vision parse error for image {idx + 1}: {e}")
            raise HTTPException(status_code=500, detail=f"Vision parse failed: {e}")

    if not all_parsed and failed_count == len(images):
        raise HTTPException(status_code=400, detail="all_images_failed")

    if not all_parsed:
        raise HTTPException(status_code=400, detail="no_parsed_sets")

    now = _now_iso()
    parse_job_id = str(uuid4())

    # ── Phase 3: upsert canonical + member preferences ────────────────────────
    with get_conn() as conn:
        group_id = member["group_id"]

        # Ensure canonical set exists for each parsed entry (union approach).
        # Match on artist+stage+start_time+day_index; insert if new.
        canonical_id_map: dict[tuple, str] = {}
        for entry in all_parsed:
            key = (
                entry["artist_name"].lower().strip(),
                entry["stage_name"].lower().strip(),
                entry["start_time"],
                entry["day_index"],
            )
            existing = conn.execute(
                """
                SELECT id FROM canonical_sets
                WHERE group_id = ?
                  AND LOWER(TRIM(artist_name)) = ?
                  AND LOWER(TRIM(stage_name)) = ?
                  AND start_time_pt = ?
                  AND day_index = ?
                """,
                (group_id, key[0], key[1], key[2], key[3]),
            ).fetchone()

            if existing:
                canonical_id_map[key] = existing["id"]
            else:
                new_id = str(uuid4())
                conn.execute(
                    """
                    INSERT INTO canonical_sets
                    (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                     day_index, status, source_confidence, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 0.85, ?)
                    """,
                    (
                        new_id,
                        group_id,
                        entry["artist_name"],
                        entry["stage_name"],
                        entry["start_time"],
                        entry["end_time"] or entry["start_time"],
                        entry["day_index"],
                        now,
                    ),
                )
                canonical_id_map[key] = new_id

        # Upsert member preferences — don't delete existing ones
        added = 0
        for entry in all_parsed:
            key = (
                entry["artist_name"].lower().strip(),
                entry["stage_name"].lower().strip(),
                entry["start_time"],
                entry["day_index"],
            )
            canonical_set_id = canonical_id_map.get(key)
            if not canonical_set_id:
                continue

            existing_pref = conn.execute(
                "SELECT id FROM member_set_preferences WHERE member_id = ? AND canonical_set_id = ?",
                (session["member_id"], canonical_set_id),
            ).fetchone()

            if not existing_pref:
                conn.execute(
                    """
                    INSERT INTO member_set_preferences
                    (id, member_id, canonical_set_id, preference, attendance,
                     source_confidence, created_at, updated_at)
                    VALUES (?, ?, ?, 'flexible', 'going', 0.85, ?, ?)
                    """,
                    (str(uuid4()), session["member_id"], canonical_set_id, now, now),
                )
                added += 1

        conn.execute(
            """
            INSERT INTO member_parse_jobs
            (id, member_id, status, screenshot_count, parsed_count, failed_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)
            """,
            (
                parse_job_id, session["member_id"],
                len(images), len(all_parsed), failed_count, now, now,
            ),
        )
        conn.execute(
            "UPDATE members SET setup_status = 'incomplete' WHERE id = ?",
            (session["member_id"],),
        )

    # Build sets response from all_parsed + canonical_id_map
    sets_response = [
        {
            "canonical_set_id": canonical_id_map[(
                e["artist_name"].lower().strip(),
                e["stage_name"].lower().strip(),
                e["start_time"],
                e["day_index"],
            )],
            "artist_name": e["artist_name"],
            "stage_name": e["stage_name"],
            "start_time_pt": e["start_time"],
            "end_time_pt": e["end_time"] or e["start_time"],
            "day_index": e["day_index"],
        }
        for e in all_parsed
        if (e["artist_name"].lower().strip(), e["stage_name"].lower().strip(), e["start_time"], e["day_index"]) in canonical_id_map
    ]

    return {
        "ok": True,
        "parse_job_id": parse_job_id,
        "parsed_count": len(all_parsed),
        "new_canonical_count": len(canonical_id_map),
        "failed_count": failed_count,
        "sets": sets_response,
    }
