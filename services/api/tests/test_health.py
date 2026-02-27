import os
import tempfile

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import init_db
from app.main import app


client = TestClient(app)


def setup_module() -> None:
    temp_dir = tempfile.mkdtemp(prefix="coachella-api-tests-")
    settings.sqlite_path = os.path.join(temp_dir, "test.db")
    init_db()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"


def test_version() -> None:
    response = client.get("/v1/meta/version")
    assert response.status_code == 200
    payload = response.json()
    assert "version" in payload
