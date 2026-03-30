"""Shared test configuration.

Force all tests to use SQLite regardless of any DATABASE_URL set in .env.
Individual test modules set their own temp sqlite_path in setup_module().
"""
import io
from datetime import datetime, timezone
from uuid import uuid4

from PIL import Image

from app.core.config import settings
from app.core.db import get_conn


def pytest_configure(config) -> None:  # noqa: ARG001
    settings.database_url = ""


def seed_canonical_sets(group_id: str) -> None:
    """Insert 4 canonical sets + mark group setup_complete. Used by multiple test modules."""
    now = datetime.now(tz=timezone.utc).isoformat()
    sets = [
        ("Aurora Skyline", "Main Stage", "12:00", "12:45", 1),
        ("Neon Valley", "Sahara", "13:10", "14:00", 1),
        ("Desert Echo", "Outdoor", "14:15", "15:05", 1),
        ("Solar Ritual", "Mojave", "16:20", "17:10", 1),
    ]
    with get_conn() as conn:
        for artist, stage, start, end, day in sets:
            conn.execute(
                """
                INSERT INTO canonical_sets
                  (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                   day_index, status, source_confidence, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 0.9, ?)
                """,
                (str(uuid4()), group_id, artist, stage, start, end, day, now),
            )
        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))


def make_jpeg_bytes() -> bytes:
    """Create a minimal valid JPEG for upload endpoint tests."""
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, format="JPEG")
    return buf.getvalue()
