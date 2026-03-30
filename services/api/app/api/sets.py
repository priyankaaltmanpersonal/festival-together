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
        canonical_set = conn.execute(
            "SELECT id, group_id FROM canonical_sets WHERE id = ?",
            (canonical_set_id,),
        ).fetchone()
        if canonical_set is None:
            raise HTTPException(status_code=404, detail="set_not_found")
        if canonical_set["group_id"] != session["group_id"]:
            raise HTTPException(status_code=403, detail="forbidden")

        values.append(canonical_set_id)
        conn.execute(
            f"UPDATE canonical_sets SET {', '.join(updates)} WHERE id = ?",
            tuple(values),
        )

    return {"ok": True}
