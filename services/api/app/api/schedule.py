from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import require_session
from app.core.db import get_conn
from app.core.llm_parser import normalize_stage

router = APIRouter(tags=["schedule"])

_STAGE_ORDER = [
    'Coachella Stage', 'Outdoor Theatre', 'Sonora', 'Gobi',
    'Mojave', 'Sahara', 'Yuma', 'Quasar', 'Do Lab',
]


def _stage_sort_key(name: str) -> tuple[int, str]:
    try:
        return (_STAGE_ORDER.index(name), '')
    except ValueError:
        return (len(_STAGE_ORDER), name)


def _popularity_tier(attendee_count: int) -> str:
    if attendee_count <= 0:
        return "none"
    if attendee_count == 1:
        return "low"
    if attendee_count <= 3:
        return "medium"
    return "high"


@router.get("/groups/{group_id}/schedule")
def group_schedule(
    group_id: str,
    must_see_only: bool = Query(default=False),
    member_ids: str | None = Query(default=None),
    session=Depends(require_session),
) -> dict:
    if session["group_id"] != group_id:
        raise HTTPException(status_code=403, detail="forbidden")

    member_filter = [item.strip() for item in member_ids.split(",")] if member_ids else []
    member_filter = [item for item in member_filter if item]

    with get_conn() as conn:
        group = conn.execute(
            "SELECT id, name FROM groups WHERE id = ?",
            (group_id,),
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")

        canonical_sets = conn.execute(
            """
            SELECT id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status
            FROM canonical_sets
            WHERE group_id = ?
            ORDER BY day_index, start_time_pt, stage_name
            """,
            (group_id,),
        ).fetchall()

        attendees = conn.execute(
            """
            SELECT
              msp.canonical_set_id,
              m.id AS member_id,
              m.display_name,
              m.chip_color,
              msp.preference,
              msp.attendance,
              m.setup_status
            FROM member_set_preferences msp
            JOIN members m ON m.id = msp.member_id
            WHERE m.group_id = ?
              AND m.active = 1
              AND m.setup_status = 'complete'
              AND msp.attendance = 'going'
            """,
            (group_id,),
        ).fetchall()

    attendees_by_set: dict[str, list[dict]] = {}
    for row in attendees:
        if member_filter and row["member_id"] not in member_filter:
            continue

        attendees_by_set.setdefault(row["canonical_set_id"], []).append(
            {
                "member_id": row["member_id"],
                "display_name": row["display_name"],
                "chip_color": row["chip_color"],
                "preference": row["preference"],
            }
        )

    schedule_sets = []
    for row in canonical_sets:
        set_attendees = attendees_by_set.get(row["id"], [])

        if member_filter and not set_attendees:
            continue
        if must_see_only and not any(item["preference"] == "must_see" for item in set_attendees):
            continue

        schedule_sets.append(
            {
                "id": row["id"],
                "artist_name": row["artist_name"],
                "stage_name": normalize_stage(row["stage_name"] or ""),
                "start_time_pt": row["start_time_pt"],
                "end_time_pt": row["end_time_pt"],
                "day_index": row["day_index"],
                "status": row["status"],
                "attendees": set_attendees,
                "attendee_count": len(set_attendees),
                "must_see_count": sum(1 for item in set_attendees if item["preference"] == "must_see"),
                "popularity_tier": _popularity_tier(len(set_attendees)),
            }
        )

    stages = sorted(
        {item["stage_name"] for item in schedule_sets if item["stage_name"]},
        key=_stage_sort_key,
    )
    row_groups: dict[tuple[int, str], list[dict]] = {}
    for set_item in schedule_sets:
        key = (set_item["day_index"], set_item["start_time_pt"])
        row_groups.setdefault(key, []).append(set_item)

    time_rows = []
    for key in sorted(row_groups.keys()):
        day_index, start_time_pt = key
        row_sets = row_groups[key]
        cells = {stage: [] for stage in stages}
        for item in row_sets:
            cells.setdefault(item["stage_name"], []).append(item)

        time_rows.append(
            {
                "day_index": day_index,
                "time_pt": start_time_pt,
                "cells": cells,
            }
        )

    return {
        "group": {"id": group["id"], "name": group["name"]},
        "filters": {"must_see_only": must_see_only, "member_ids": member_filter},
        "stages": stages,
        "time_rows": time_rows,
        "sets": schedule_sets,
    }


@router.get("/groups/{group_id}/individual-schedules")
def individual_schedules(group_id: str, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id:
        raise HTTPException(status_code=403, detail="forbidden")

    with get_conn() as conn:
        group = conn.execute("SELECT id, name FROM groups WHERE id = ?", (group_id,)).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")

        rows = conn.execute(
            """
            SELECT
              m.id AS member_id,
              m.display_name,
              m.setup_status,
              cs.id AS canonical_set_id,
              cs.artist_name,
              cs.stage_name,
              cs.start_time_pt,
              cs.end_time_pt,
              cs.day_index,
              msp.preference,
              msp.attendance
            FROM members m
            LEFT JOIN member_set_preferences msp ON msp.member_id = m.id
            LEFT JOIN canonical_sets cs ON cs.id = msp.canonical_set_id
            WHERE m.group_id = ? AND m.active = 1
            ORDER BY m.created_at, cs.day_index, cs.start_time_pt
            """,
            (group_id,),
        ).fetchall()

    by_member: dict[str, dict] = {}
    for row in rows:
        member_id = row["member_id"]
        if member_id not in by_member:
            by_member[member_id] = {
                "member_id": member_id,
                "display_name": row["display_name"],
                "setup_status": row["setup_status"],
                "sets": [],
            }

        if row["canonical_set_id"] is None:
            continue

        by_member[member_id]["sets"].append(
            {
                "canonical_set_id": row["canonical_set_id"],
                "artist_name": row["artist_name"],
                "stage_name": row["stage_name"],
                "start_time_pt": row["start_time_pt"],
                "end_time_pt": row["end_time_pt"],
                "day_index": row["day_index"],
                "preference": row["preference"],
                "attendance": row["attendance"],
            }
        )

    return {
        "group": {"id": group["id"], "name": group["name"]},
        "members": list(by_member.values()),
    }
