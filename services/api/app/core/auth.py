from fastapi import Header, HTTPException

from app.core.db import get_conn


def require_session(x_session_token: str | None = Header(default=None)) -> dict:
    if not x_session_token:
        raise HTTPException(status_code=401, detail="missing_session")

    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT s.token, m.id as member_id, m.group_id, m.role, m.active
            FROM sessions s
            JOIN members m ON m.id = s.member_id
            WHERE s.token = ? AND s.active = 1
            """,
            (x_session_token,),
        ).fetchone()

    if row is None or row["active"] != 1:
        raise HTTPException(status_code=401, detail="invalid_session")

    return {
        "token": row["token"],
        "member_id": row["member_id"],
        "group_id": row["group_id"],
        "role": row["role"],
    }
