import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core.config import settings


def _db_path() -> Path:
    return Path(settings.sqlite_path).resolve()


def init_db() -> None:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS groups (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              icon_url TEXT,
              invite_code TEXT NOT NULL UNIQUE,
              founder_member_id TEXT,
              setup_complete INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS members (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              display_name TEXT NOT NULL,
              chip_color TEXT,
              avatar_photo_url TEXT,
              role TEXT NOT NULL,
              setup_status TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              FOREIGN KEY(group_id) REFERENCES groups(id)
            )
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_members_active_group_color
            ON members(group_id, chip_color)
            WHERE active = 1 AND chip_color IS NOT NULL
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              member_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1,
              FOREIGN KEY(member_id) REFERENCES members(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS anonymous_sessions (
              token TEXT PRIMARY KEY,
              created_at TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS anonymous_session_issuance (
              id TEXT PRIMARY KEY,
              client_ip TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS canonical_sets (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              artist_name TEXT NOT NULL,
              stage_name TEXT NOT NULL,
              start_time_pt TEXT NOT NULL,
              end_time_pt TEXT NOT NULL,
              day_index INTEGER NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(group_id) REFERENCES groups(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS canonical_parse_jobs (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              status TEXT NOT NULL,
              screenshot_count INTEGER NOT NULL,
              unresolved_count INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              completed_at TEXT,
              FOREIGN KEY(group_id) REFERENCES groups(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS parse_artifacts (
              id TEXT PRIMARY KEY,
              parse_job_id TEXT NOT NULL,
              temp_image_path TEXT NOT NULL,
              retention_expires_at TEXT NOT NULL,
              deleted_at TEXT,
              FOREIGN KEY(parse_job_id) REFERENCES canonical_parse_jobs(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS member_parse_jobs (
              id TEXT PRIMARY KEY,
              member_id TEXT NOT NULL,
              status TEXT NOT NULL,
              screenshot_count INTEGER NOT NULL,
              parsed_count INTEGER NOT NULL DEFAULT 0,
              failed_count INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              completed_at TEXT,
              FOREIGN KEY(member_id) REFERENCES members(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS member_set_preferences (
              id TEXT PRIMARY KEY,
              member_id TEXT NOT NULL,
              canonical_set_id TEXT NOT NULL,
              preference TEXT NOT NULL,
              attendance TEXT NOT NULL,
              source_confidence REAL NOT NULL DEFAULT 0.0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(member_id, canonical_set_id),
              FOREIGN KEY(member_id) REFERENCES members(id),
              FOREIGN KEY(canonical_set_id) REFERENCES canonical_sets(id)
            )
            """
        )
        member_cols = [row[1] for row in conn.execute("PRAGMA table_info(members)").fetchall()]
        if "chip_color" not in member_cols:
            conn.execute("ALTER TABLE members ADD COLUMN chip_color TEXT")
        conn.commit()


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
