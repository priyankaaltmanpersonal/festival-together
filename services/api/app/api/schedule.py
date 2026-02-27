from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import require_session
from app.core.db import get_conn

router = APIRouter(tags=["schedule"])


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
                "stage_name": row["stage_name"],
                "start_time_pt": row["start_time_pt"],
                "end_time_pt": row["end_time_pt"],
                "day_index": row["day_index"],
                "status": row["status"],
                "attendees": set_attendees,
                "attendee_count": len(set_attendees),
                "must_see_count": sum(1 for item in set_attendees if item["preference"] == "must_see"),
            }
        )

    return {
        "group": {"id": group["id"], "name": group["name"]},
        "filters": {"must_see_only": must_see_only, "member_ids": member_filter},
        "sets": schedule_sets,
    }
