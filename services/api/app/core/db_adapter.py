"""Database adapter: unified get_conn() that works with SQLite and Postgres.

When DATABASE_URL is empty (local dev / tests): uses sqlite3.
When DATABASE_URL is set (production on Render): uses psycopg2 with Postgres.

All SQL in callers uses `?` placeholders. This adapter translates `?` → `%s`
for Postgres automatically. Row access uses dict-style row["column"] in both
cases (sqlite3.Row for SQLite, RealDictCursor for Postgres).
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.core.config import settings


# ── SQLite path ───────────────────────────────────────────────────────────────

@contextmanager
def _sqlite_conn() -> Iterator[sqlite3.Connection]:
    path = Path(settings.sqlite_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── Postgres path ─────────────────────────────────────────────────────────────

class _PgConn:
    """Wraps a psycopg2 connection to expose the same interface as sqlite3.Connection.

    All SQL is rewritten to replace `?` with `%s` before execution.
    Rows are returned as dicts (RealDictCursor) so row["column"] access works
    identically to sqlite3.Row.
    """

    def __init__(self, raw_conn: Any) -> None:
        self._conn = raw_conn
        self._cur = raw_conn.cursor()

    @staticmethod
    def _pg_sql(sql: str) -> str:
        return sql.replace("?", "%s")

    def execute(self, sql: str, params: tuple = ()) -> "_PgConn":
        self._cur.execute(self._pg_sql(sql), params)
        return self

    def executemany(self, sql: str, param_list: Any) -> "_PgConn":
        self._cur.executemany(self._pg_sql(sql), param_list)
        return self

    def fetchone(self) -> Any:
        return self._cur.fetchone()

    def fetchall(self) -> Any:
        return self._cur.fetchall()

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


@contextmanager
def _postgres_conn() -> Iterator[_PgConn]:
    import psycopg2
    import psycopg2.extras

    raw = psycopg2.connect(settings.database_url, cursor_factory=psycopg2.extras.RealDictCursor)
    wrapped = _PgConn(raw)
    try:
        yield wrapped
        raw.commit()
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


# ── Public interface ──────────────────────────────────────────────────────────

@contextmanager
def get_conn() -> Iterator[Any]:
    """Return a database connection using the appropriate driver.

    Use as a context manager:
        with get_conn() as conn:
            conn.execute("SELECT ...", (...,))
    """
    if settings.database_url:
        with _postgres_conn() as conn:
            yield conn
    else:
        with _sqlite_conn() as conn:
            yield conn
