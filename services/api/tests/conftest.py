"""Shared test configuration.

Force all tests to use SQLite regardless of any DATABASE_URL set in .env.
Individual test modules set their own temp sqlite_path in setup_module().
"""
from app.core.config import settings


def pytest_configure(config) -> None:  # noqa: ARG001
    settings.database_url = ""
