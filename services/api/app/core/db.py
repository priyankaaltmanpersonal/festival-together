"""Database initialization and connection management.

Connection handling is delegated to db_adapter:
- SQLite when DATABASE_URL is empty (local dev / tests)
- Postgres when DATABASE_URL is set (production)

All callers import get_conn from here; db_adapter is an implementation detail.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from app.core.config import settings
from app.core.db_adapter import get_conn  # noqa: F401 — re-exported for callers

_SCHEMA_SQL = [
    """
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_url TEXT,
      invite_code TEXT NOT NULL UNIQUE,
      founder_member_id TEXT,
      setup_complete INTEGER NOT NULL DEFAULT 0,
      festival_days TEXT,
      created_at TEXT NOT NULL
    )
    """,
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
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(member_id) REFERENCES members(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS anonymous_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS anonymous_session_issuance (
      id TEXT PRIMARY KEY,
      client_ip TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
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
      source_confidence REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(group_id) REFERENCES groups(id)
    )
    """,
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
    """,
    """
    CREATE TABLE IF NOT EXISTS parse_artifacts (
      id TEXT PRIMARY KEY,
      parse_job_id TEXT NOT NULL,
      temp_image_path TEXT NOT NULL,
      retention_expires_at TEXT NOT NULL,
      deleted_at TEXT
    )
    """,
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
    """,
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
    """,
]


_POSTGRES_INDEXES = [
    # Partial unique index: only one active member per chip color per group.
    # SQLite version is in the sqlite-only block below.
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_members_active_group_color
    ON members(group_id, chip_color)
    WHERE active = 1 AND chip_color IS NOT NULL
    """,
]


def init_db() -> None:
    """Create all tables and indexes. Safe to call multiple times (IF NOT EXISTS)."""
    with get_conn() as conn:
        for stmt in _SCHEMA_SQL:
            conn.execute(stmt)
        if settings.database_url:
            for stmt in _POSTGRES_INDEXES:
                conn.execute(stmt)

    if not settings.database_url:
        # SQLite only: create partial unique index for chip color uniqueness per active member.
        # Column additions are handled by Alembic migrations.
        raw = sqlite3.connect(Path(settings.sqlite_path).resolve())
        try:
            raw.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_members_active_group_color
                ON members(group_id, chip_color)
                WHERE active = 1 AND chip_color IS NOT NULL
                """
            )
            raw.commit()
        finally:
            raw.close()
