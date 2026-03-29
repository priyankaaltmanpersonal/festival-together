# Real OCR, Deployment & Beta Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all demo/stub code with real Google Cloud Vision OCR, deploy the API to Render with Postgres, wire real image upload on mobile, add parse error handling, and add a privacy/terms gate — producing a TestFlight-ready private beta.

**Architecture:** Backend adds a new multipart upload endpoint per parse type; images are validated, sent to Google Cloud Vision REST API, and the extracted text is passed to the existing parser pipeline unchanged. The database layer grows a thin adapter so SQLite (local/tests) and Postgres (production) both work via the same `?`-style SQL. Mobile gains `expo-image-picker` + `expo-image-manipulator` for real photo selection and compression, an upload service that posts multipart to the new endpoints, and error retry/skip UI in the onboarding review step.

**Tech Stack:** FastAPI (Python 3.11), psycopg2-binary, python-multipart, httpx, Pillow; Expo 54 / React Native 0.81, expo-image-picker, expo-image-manipulator; Render (API host), Neon (managed Postgres, free tier), Google Cloud Vision REST API.

---

## File Map

### New files (backend)
- `services/api/app/core/vision_client.py` — Google Cloud Vision REST client; returns extracted text from image bytes; falls back to `None` if API key not configured
- `services/api/app/core/db_adapter.py` — thin adapter wrapping sqlite3 + psycopg2, unifying `?`-style SQL, dict-row access, and `executemany`; chosen driver decided at import time via `DATABASE_URL` env var

### Modified files (backend)
- `services/api/pyproject.toml` — add `httpx`, `python-multipart`, `Pillow`, `psycopg2-binary`
- `services/api/app/core/config.py` — add `google_vision_api_key`, `database_url` settings
- `services/api/app/core/db.py` — replace sqlite3 impl with import + re-export from `db_adapter.py`
- `services/api/app/api/canonical.py` — add `POST /groups/{group_id}/canonical/upload` multipart endpoint
- `services/api/app/api/personal.py` — add `POST /members/me/personal/upload` multipart endpoint
- `services/api/tests/test_canonical.py` — add upload endpoint tests (mock Vision)
- `services/api/tests/test_personal.py` — add upload endpoint tests (mock Vision)

### New files (infra)
- `render.yaml` — Render service + env var declarations
- `services/api/.env.example` — add new env var stubs

### New files (mobile)
- `apps/mobile/src/services/uploadImages.js` — compress + upload images, return parsed sets or per-image errors
- `apps/mobile/src/screens/PrivacyScreen.js` — privacy + terms acknowledgment screen (shown once before create/join)

### Modified files (mobile)
- `apps/mobile/package.json` — add `expo-image-picker`, `expo-image-manipulator`
- `apps/mobile/src/screens/SetupScreen.js` — replace demo buttons with real picker UI; add privacy step; add retry/skip error state to review step
- `apps/mobile/App.js` — replace `onCompleteFounderSetup` + `onImportPersonal` handlers with real upload calls; add privacy step routing; add retry/skip handlers

### New files (docs)
- `docs/release-runbook.md` — step-by-step: create Apple Developer + Google Play accounts, configure EAS, build, submit to TestFlight + Play internal

---

## Task 1: Google Cloud Vision client

**Files:**
- Create: `services/api/app/core/vision_client.py`
- Modify: `services/api/pyproject.toml`
- Test: `services/api/tests/test_vision_client.py`

> Uses Google Cloud Vision REST API (not the Python SDK) with a plain API key so no service account JSON is needed in production.

- [ ] **Step 1.1: Add httpx + Pillow to dependencies**

Edit `services/api/pyproject.toml`, replace the `dependencies` list:
```toml
dependencies = [
  "fastapi>=0.116.0",
  "uvicorn>=0.35.0",
  "pydantic-settings>=2.10.0",
  "httpx>=0.28.0",
  "python-multipart>=0.0.20",
  "Pillow>=11.0.0",
  "psycopg2-binary>=2.9.0"
]
```

Also add `httpx` to the `dev` dependency group (it was already there; confirm no duplicate).

- [ ] **Step 1.2: Write the failing test**

Create `services/api/tests/test_vision_client.py`:
```python
import base64
from unittest.mock import MagicMock, patch

import pytest

from app.core.vision_client import extract_text_from_image


def test_extract_text_returns_none_without_api_key(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "")
    result = extract_text_from_image(b"\xff\xd8\xff" + b"\x00" * 10)
    assert result is None


def test_extract_text_calls_vision_api_and_returns_text(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "responses": [
            {
                "textAnnotations": [
                    {"description": "DAY 1\nArtist Name | Stage | 12:00 PM - 1:00 PM"}
                ]
            }
        ]
    }
    with patch("app.core.vision_client.httpx.post", return_value=mock_response) as mock_post:
        result = extract_text_from_image(b"\x89PNG\x00" * 10)
    assert result == "DAY 1\nArtist Name | Stage | 12:00 PM - 1:00 PM"
    called_url = mock_post.call_args[0][0]
    assert "vision.googleapis.com" in called_url
    assert "test-key" in called_url


def test_extract_text_returns_none_on_empty_annotations(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"responses": [{}]}
    with patch("app.core.vision_client.httpx.post", return_value=mock_response):
        result = extract_text_from_image(b"\x89PNG\x00" * 10)
    assert result is None


def test_extract_text_returns_none_on_http_error(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "test-key")
    with patch("app.core.vision_client.httpx.post", side_effect=Exception("network error")):
        result = extract_text_from_image(b"\x89PNG\x00" * 10)
    assert result is None
```

- [ ] **Step 1.3: Run test to verify it fails**

```bash
cd services/api && python -m pytest tests/test_vision_client.py -v
```
Expected: `ImportError` or `ModuleNotFoundError` for `vision_client`.

- [ ] **Step 1.4: Implement the vision client**

Create `services/api/app/core/vision_client.py`:
```python
from __future__ import annotations

import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


def extract_text_from_image(image_bytes: bytes) -> str | None:
    """Send image bytes to Google Cloud Vision TEXT_DETECTION.

    Returns the extracted text string, or None if the API key is not
    configured, the image contains no text, or any error occurs.
    """
    if not settings.google_vision_api_key:
        return None

    try:
        payload = {
            "requests": [
                {
                    "image": {"content": base64.b64encode(image_bytes).decode()},
                    "features": [{"type": "TEXT_DETECTION", "maxResults": 1}],
                }
            ]
        }
        response = httpx.post(
            _VISION_URL,
            json=payload,
            headers={"x-goog-api-key": settings.google_vision_api_key},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        annotations = data.get("responses", [{}])[0].get("textAnnotations", [])
        if not annotations:
            return None
        return annotations[0].get("description")
    except Exception as exc:
        logger.warning("Vision API call failed: %s", exc)
        return None
```

- [ ] **Step 1.5: Add google_vision_api_key to settings**

Edit `services/api/app/core/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "coachella-api"
    app_env: str = "local"
    app_version: str = "0.1.0"
    api_prefix: str = "/v1"
    sqlite_path: str = "./coachella.db"
    database_url: str = ""
    google_vision_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
```

- [ ] **Step 1.6: Run tests to verify they pass**

```bash
cd services/api && python -m pytest tests/test_vision_client.py -v
```
Expected: 4 tests pass.

- [ ] **Step 1.7: Commit**

```bash
cd services/api && git add app/core/vision_client.py app/core/config.py pyproject.toml tests/test_vision_client.py
git commit -m "feat: add Google Cloud Vision OCR client with API key auth"
```

---

## Task 2: Image validation utility

**Files:**
- Create: `services/api/app/core/image_utils.py`
- Test: `services/api/tests/test_image_utils.py`

> Validates uploaded image bytes (JPEG/PNG only, max 10 MB) and compresses them to ≤1500px longest side before sending to Vision to stay well under Vision's 10 MB limit.

- [ ] **Step 2.1: Write the failing test**

Create `services/api/tests/test_image_utils.py`:
```python
import io
import pytest
from PIL import Image

from app.core.image_utils import validate_and_compress, ImageValidationError

def _make_jpeg_bytes(width=100, height=100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(128, 64, 32)).save(buf, format="JPEG")
    return buf.getvalue()

def _make_png_bytes(width=100, height=100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()

def test_validate_jpeg_passes():
    result = validate_and_compress(_make_jpeg_bytes())
    assert result[:3] == b"\xff\xd8\xff"  # JPEG magic bytes

def test_validate_png_passes():
    result = validate_and_compress(_make_png_bytes())
    assert result[:4] == b"\x89PNG"

def test_rejects_non_image_bytes():
    with pytest.raises(ImageValidationError, match="unsupported_format"):
        validate_and_compress(b"this is not an image at all")

def test_rejects_oversized_file():
    # Build minimal JPEG header then pad to 11 MB
    header = _make_jpeg_bytes()
    oversized = header + b"\x00" * (11 * 1024 * 1024)
    with pytest.raises(ImageValidationError, match="file_too_large"):
        validate_and_compress(oversized)

def test_resizes_large_image():
    big = _make_jpeg_bytes(width=4000, height=3000)
    result = validate_and_compress(big, max_dimension=1500)
    img = Image.open(io.BytesIO(result))
    assert max(img.size) <= 1500
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd services/api && python -m pytest tests/test_image_utils.py -v
```
Expected: `ImportError`.

- [ ] **Step 2.3: Implement image_utils**

Create `services/api/app/core/image_utils.py`:
```python
from __future__ import annotations

import io

from PIL import Image

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG"


class ImageValidationError(ValueError):
    pass


def validate_and_compress(image_bytes: bytes, max_dimension: int = 1500) -> bytes:
    """Validate image type/size and compress to max_dimension longest side.

    Returns JPEG bytes ready for Vision API upload.
    Raises ImageValidationError with a machine-readable code on failure.
    """
    # Check size before any further processing to avoid reading huge files into memory
    if len(image_bytes) > MAX_FILE_BYTES:
        raise ImageValidationError("file_too_large")

    if not (image_bytes[:3] == _JPEG_MAGIC or image_bytes[:4] == _PNG_MAGIC):
        raise ImageValidationError("unsupported_format")

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise ImageValidationError("unreadable_image") from exc

    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd services/api && python -m pytest tests/test_image_utils.py -v
```
Expected: 5 tests pass.

- [ ] **Step 2.5: Commit**

```bash
cd services/api && git add app/core/image_utils.py tests/test_image_utils.py
git commit -m "feat: add image validation and compression utility"
```

---

## Task 3: Canonical image upload endpoint

**Files:**
- Modify: `services/api/app/api/canonical.py`
- Modify: `services/api/tests/test_canonical.py`

> New endpoint: `POST /v1/groups/{group_id}/canonical/upload` accepts up to 30 image files as `multipart/form-data`. Each image is validated, compressed, sent to Vision API (or falls back gracefully), text is parsed with existing pipeline.

- [ ] **Step 3.1: Write the failing test**

Append to `services/api/tests/test_canonical.py`:
```python
import io
from unittest.mock import patch
from PIL import Image


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(50, 100, 150)).save(buf, format="JPEG")
    return buf.getvalue()


def _vision_text_for_two_sets() -> str:
    return (
        "DAY 1\n"
        "Aurora Skyline | Main Stage | 12:00 PM - 12:45 PM\n"
        "Neon Valley | Sahara | 1:10 PM - 2:00 PM"
    )


def test_canonical_upload_with_vision_mock() -> None:
    founder = _create_group("Upload Crew", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    with patch("app.api.canonical.extract_text_from_image", return_value=_vision_text_for_two_sets()):
        response = client.post(
            f"/v1/groups/{group_id}/canonical/upload",
            headers={"x-session-token": session_token},
            files=[("images", ("shot1.jpg", _make_jpeg_bytes(), "image/jpeg"))],
        )

    assert response.status_code == 200
    data = response.json()
    assert data["parsed_count"] >= 2
    assert data["failed_count"] == 0


def test_canonical_upload_rejects_non_founder() -> None:
    founder = _create_group("Upload Crew 2", "Founder")
    group_id = founder["group"]["id"]
    founder_token = founder["session"]["token"]

    # Complete founder setup so member can join
    client.post(
        f"/v1/groups/{group_id}/canonical/import",
        headers={"x-session-token": founder_token},
        json={"screenshot_count": 1},
    )
    client.post(
        f"/v1/groups/{group_id}/canonical/confirm",
        headers={"x-session-token": founder_token},
    )
    invite_code = founder["group"]["invite_code"]
    member_resp = client.post("/v1/invites/join", json={"invite_code": invite_code, "display_name": "Member", "chip_color": "#20A36B"})
    member_token = member_resp.json()["session"]["token"]

    with patch("app.api.canonical.extract_text_from_image", return_value=_vision_text_for_two_sets()):
        response = client.post(
            f"/v1/groups/{group_id}/canonical/upload",
            headers={"x-session-token": member_token},
            files=[("images", ("shot1.jpg", _make_jpeg_bytes(), "image/jpeg"))],
        )
    assert response.status_code == 403


def test_canonical_upload_rejects_too_many_images() -> None:
    founder = _create_group("Upload Crew 3", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    files = [("images", (f"shot{i}.jpg", _make_jpeg_bytes(), "image/jpeg")) for i in range(31)]
    response = client.post(
        f"/v1/groups/{group_id}/canonical/upload",
        headers={"x-session-token": session_token},
        files=files,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "too_many_images"


def test_canonical_upload_counts_failed_images() -> None:
    founder = _create_group("Upload Crew 4", "Founder")
    group_id = founder["group"]["id"]
    session_token = founder["session"]["token"]

    # One good image, one that vision returns None for (simulating OCR failure)
    call_count = {"n": 0}
    def _mock_vision(image_bytes):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return _vision_text_for_two_sets()
        return None  # second image fails OCR

    with patch("app.api.canonical.extract_text_from_image", side_effect=_mock_vision):
        response = client.post(
            f"/v1/groups/{group_id}/canonical/upload",
            headers={"x-session-token": session_token},
            files=[
                ("images", ("good.jpg", _make_jpeg_bytes(), "image/jpeg")),
                ("images", ("bad.jpg", _make_jpeg_bytes(), "image/jpeg")),
            ],
        )
    assert response.status_code == 200
    data = response.json()
    assert data["failed_count"] == 1
    assert data["parsed_count"] >= 2
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd services/api && python -m pytest tests/test_canonical.py::test_canonical_upload_with_vision_mock -v
```
Expected: 404 (route not found) or `ImportError`.

- [ ] **Step 3.3: Implement the upload endpoint**

Add to `services/api/app/api/canonical.py` (below existing imports):
```python
from fastapi import File, UploadFile
from typing import List
from app.core.vision_client import extract_text_from_image
from app.core.image_utils import validate_and_compress, ImageValidationError

MAX_UPLOAD_IMAGES = 30
```

Add this route at the bottom of `canonical.py`:
```python
@router.post("/groups/{group_id}/canonical/upload")
def upload_canonical_images(
    group_id: str,
    images: List[UploadFile] = File(...),
    session=Depends(require_session),
) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")
    if len(images) > MAX_UPLOAD_IMAGES:
        raise HTTPException(status_code=400, detail="too_many_images")

    now = _now()
    job_id = str(uuid4())
    screenshots: list[ScreenshotInput] = []
    failed_count = 0

    for idx, upload in enumerate(images):
        raw = upload.file.read()
        try:
            compressed = validate_and_compress(raw)
        except ImageValidationError:
            failed_count += 1
            continue

        text = extract_text_from_image(compressed)
        if text is None:
            failed_count += 1
            continue

        screenshots.append(
            ScreenshotInput(
                source_id=upload.filename or f"canonical-upload-{idx + 1}",
                raw_text=text,
            )
        )

    if not screenshots:
        raise HTTPException(status_code=400, detail="no_parsed_sets")

    parse_outcome = parse_canonical_screenshots(screenshots)
    if not parse_outcome.sets:
        raise HTTPException(status_code=400, detail="no_parsed_sets")

    with get_conn() as conn:
        group = conn.execute("SELECT id FROM groups WHERE id = ?", (group_id,)).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")

        conn.execute("DELETE FROM canonical_sets WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM canonical_parse_jobs WHERE group_id = ?", (group_id,))

        conn.execute(
            """
            INSERT INTO canonical_parse_jobs (id, group_id, status, screenshot_count, unresolved_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, ?, ?)
            """,
            (job_id, group_id, len(screenshots), parse_outcome.unresolved_count, now.isoformat(), now.isoformat()),
        )

        conn.executemany(
            """
            INSERT INTO canonical_sets (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status, source_confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (str(uuid4()), group_id, item.artist_name, item.stage_name, item.start_time_pt,
                 item.end_time_pt, item.day_index, item.status, round(item.source_confidence, 2), now.isoformat())
                for item in parse_outcome.sets
            ],
        )

        retention = (now + timedelta(hours=24)).isoformat()
        for screenshot in screenshots:
            conn.execute(
                "INSERT INTO parse_artifacts (id, parse_job_id, temp_image_path, retention_expires_at, deleted_at) VALUES (?, ?, ?, ?, NULL)",
                (str(uuid4()), job_id, f"tmp/canonical/{job_id}/{screenshot.source_id}", retention),
            )

        conn.execute("UPDATE groups SET setup_complete = 0 WHERE id = ?", (group_id,))

    return {
        "ok": True,
        "parse_job_id": job_id,
        "parsed_count": len(parse_outcome.sets),
        "failed_count": failed_count,
        "unresolved_count": parse_outcome.unresolved_count,
    }
```

- [ ] **Step 3.4: Run all canonical tests**

```bash
cd services/api && python -m pytest tests/test_canonical.py -v
```
Expected: all pass (existing 2 + new 4 = 6 total).

- [ ] **Step 3.5: Commit**

```bash
cd services/api && git add app/api/canonical.py tests/test_canonical.py
git commit -m "feat: add canonical image upload endpoint with Vision OCR"
```

---

## Task 4: Personal image upload endpoint

**Files:**
- Modify: `services/api/app/api/personal.py`
- Modify: `services/api/tests/test_personal.py`

> New endpoint: `POST /v1/members/me/personal/upload` — same pattern as canonical upload.

- [ ] **Step 4.1: Write the failing test**

Append to `services/api/tests/test_personal.py`:
```python
import io
from unittest.mock import patch
from PIL import Image


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, format="JPEG")
    return buf.getvalue()


def _make_personal_vision_text(canonical_sets) -> str:
    """Return OCR text matching the first 2 canonical sets."""
    rows = canonical_sets[:2]
    from app.core.parser import _display_time
    lines = ["DAY 1"]
    for row in rows:
        lines.append(
            f"{row['artist_name']} | {row['stage_name']} | "
            f"{_display_time(row['start_time_pt'])} - {_display_time(row['end_time_pt'])}"
        )
    return "\n".join(lines)


def _get_canonical_sets(group_id, session_token):
    from app.core.db import get_conn
    with get_conn() as conn:
        return conn.execute(
            "SELECT artist_name, stage_name, start_time_pt, end_time_pt, day_index FROM canonical_sets WHERE group_id = ? LIMIT 5",
            (group_id,)
        ).fetchall()


def test_personal_upload_with_vision_mock() -> None:
    # Set up: create group, complete founder setup
    founder = _create_group_and_setup("Upload Personal Crew")
    group_id = founder["group_id"]
    invite_code = founder["invite_code"]

    member_resp = client.post("/v1/invites/join", json={
        "invite_code": invite_code, "display_name": "Tester", "chip_color": "#8A5CE6"
    })
    assert member_resp.status_code == 200
    member_token = member_resp.json()["session"]["token"]

    canonical_sets = _get_canonical_sets(group_id, founder["session_token"])
    vision_text = _make_personal_vision_text(canonical_sets)

    with patch("app.api.personal.extract_text_from_image", return_value=vision_text):
        response = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": member_token},
            files=[("images", ("mine.jpg", _make_jpeg_bytes(), "image/jpeg"))],
        )
    assert response.status_code == 200
    data = response.json()
    assert data["parsed_count"] >= 1
    assert data["failed_count"] == 0
```

Also add the `_create_group_and_setup` helper at the top of the test file (check if it already exists; add it after the existing helpers):
```python
def _create_group_and_setup(group_name: str) -> dict:
    resp = client.post("/v1/groups", json={"group_name": group_name, "display_name": "Founder"})
    assert resp.status_code == 200
    data = resp.json()
    group_id = data["group"]["id"]
    session_token = data["session"]["token"]
    invite_code = data["group"]["invite_code"]
    import_resp = client.post(
        f"/v1/groups/{group_id}/canonical/import",
        headers={"x-session-token": session_token},
        json={"screenshot_count": 2},
    )
    assert import_resp.status_code == 200
    confirm_resp = client.post(
        f"/v1/groups/{group_id}/canonical/confirm",
        headers={"x-session-token": session_token},
    )
    assert confirm_resp.status_code == 200
    return {"group_id": group_id, "session_token": session_token, "invite_code": invite_code, "group": data["group"]}
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd services/api && python -m pytest tests/test_personal.py::test_personal_upload_with_vision_mock -v
```
Expected: 404 (route not found).

- [ ] **Step 4.3: Implement the personal upload endpoint**

Add to `services/api/app/api/personal.py` (add to existing imports):
```python
from fastapi import File, UploadFile
from typing import List
from app.core.vision_client import extract_text_from_image
from app.core.image_utils import validate_and_compress, ImageValidationError

MAX_UPLOAD_IMAGES = 30
```

Add this route at the bottom of `personal.py`:
```python
@router.post("/members/me/personal/upload")
def upload_personal_images(
    images: List[UploadFile] = File(...),
    session=Depends(require_session),
) -> dict:
    if len(images) > MAX_UPLOAD_IMAGES:
        raise HTTPException(status_code=400, detail="too_many_images")

    now = _now_iso()
    parse_job_id = str(uuid4())
    failed_count = 0

    with get_conn() as conn:
        member = conn.execute(
            "SELECT id, group_id, active FROM members WHERE id = ?",
            (session["member_id"],),
        ).fetchone()
        if member is None or member["active"] != 1:
            raise HTTPException(status_code=401, detail="invalid_session")

        canonical_rows = conn.execute(
            """
            SELECT id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status
            FROM canonical_sets
            WHERE group_id = ? AND status = 'resolved'
            ORDER BY day_index, start_time_pt
            """,
            (member["group_id"],),
        ).fetchall()
        if len(canonical_rows) == 0:
            raise HTTPException(status_code=409, detail="canonical_not_ready")

        screenshots: list[ScreenshotInput] = []
        for idx, upload in enumerate(images):
            raw = upload.file.read()
            try:
                compressed = validate_and_compress(raw)
            except ImageValidationError:
                failed_count += 1
                continue
            text = extract_text_from_image(compressed)
            if text is None:
                failed_count += 1
                continue
            screenshots.append(
                ScreenshotInput(
                    source_id=upload.filename or f"personal-upload-{idx + 1}",
                    raw_text=text,
                )
            )

        if not screenshots:
            raise HTTPException(status_code=400, detail="no_parsed_sets")

        mapped_rows = parse_personal_screenshots(screenshots, canonical_rows)
        if len(mapped_rows) == 0:
            raise HTTPException(status_code=400, detail="no_parsed_sets")

        conn.execute("DELETE FROM member_parse_jobs WHERE member_id = ?", (session["member_id"],))
        conn.execute("DELETE FROM member_set_preferences WHERE member_id = ?", (session["member_id"],))

        for row in mapped_rows:
            conn.execute(
                """
                INSERT INTO member_set_preferences
                (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
                VALUES (?, ?, ?, 'flexible', 'going', ?, ?, ?)
                """,
                (str(uuid4()), session["member_id"], row.canonical_set_id, row.source_confidence, now, now),
            )

        conn.execute(
            """
            INSERT INTO member_parse_jobs (id, member_id, status, screenshot_count, parsed_count, failed_count, created_at, completed_at)
            VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)
            """,
            (parse_job_id, session["member_id"], len(screenshots) + failed_count, len(mapped_rows), failed_count, now, now),
        )
        conn.execute("UPDATE members SET setup_status = 'incomplete' WHERE id = ?", (session["member_id"],))

    return {
        "ok": True,
        "parse_job_id": parse_job_id,
        "parsed_count": len(mapped_rows),
        "failed_count": failed_count,
    }
```

- [ ] **Step 4.4: Run all tests to confirm nothing is broken**

```bash
cd services/api && python -m pytest -v
```
Expected: all 13+ tests pass.

- [ ] **Step 4.5: Commit**

```bash
cd services/api && git add app/api/personal.py tests/test_personal.py
git commit -m "feat: add personal image upload endpoint with Vision OCR"
```

---

## Task 5: Postgres database adapter

**Files:**
- Create: `services/api/app/core/db_adapter.py`
- Modify: `services/api/app/core/db.py`
- Modify: `services/api/app/core/config.py` (already done in Task 1.5)

> Uses `DATABASE_URL` env var. If set, uses psycopg2 with `%s`-translated SQL. Otherwise uses sqlite3 (unchanged for local dev and tests). The `get_conn()` interface is unchanged so all routers continue to work.

- [ ] **Step 5.1: Implement the adapter**

Create `services/api/app/core/db_adapter.py`:
```python
"""Database adapter: provides a unified get_conn() that works with both
SQLite (local dev / tests, when DATABASE_URL is empty) and Postgres (production).

All SQL in callers uses `?` for parameters. This adapter translates `?` → `%s`
for Postgres automatically. Row access uses dict-style `row["column"]` in both cases.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from app.core.config import settings


# ── SQLite path ──────────────────────────────────────────────────────────────

@contextmanager
def _sqlite_conn() -> Iterator[Any]:
    from pathlib import Path
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
    """Wraps a psycopg2 connection to expose the same interface as sqlite3.Connection."""

    def __init__(self, raw):
        self._conn = raw
        self._cur = raw.cursor()

    def execute(self, sql: str, params: tuple = ()) -> "_PgConn":
        self._cur.execute(sql.replace("?", "%s"), params)
        return self

    def executemany(self, sql: str, param_list) -> "_PgConn":
        self._cur.executemany(sql.replace("?", "%s"), param_list)
        return self

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    def commit(self):
        self._conn.commit()

    def close(self):
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
    if settings.database_url:
        with _postgres_conn() as conn:
            yield conn
    else:
        with _sqlite_conn() as conn:
            yield conn
```

- [ ] **Step 5.2: Update db.py to delegate to the adapter**

Replace `services/api/app/core/db.py` with:
```python
"""Database initialization and connection management.

Connection is provided by db_adapter: SQLite when DATABASE_URL is empty (local/tests),
Postgres when DATABASE_URL is set (production).
"""
from __future__ import annotations

from app.core.db_adapter import get_conn  # noqa: F401 — re-exported for callers
from app.core.config import settings


_SCHEMA_SQL = [
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


def init_db() -> None:
    """Create all tables. Safe to call multiple times (IF NOT EXISTS)."""
    with get_conn() as conn:
        for stmt in _SCHEMA_SQL:
            conn.execute(stmt)

        if not settings.database_url:
            # SQLite-only: add columns that may be missing from old DBs
            import sqlite3
            from pathlib import Path
            raw = sqlite3.connect(Path(settings.sqlite_path).resolve())
            member_cols = [row[1] for row in raw.execute("PRAGMA table_info(members)").fetchall()]
            if "chip_color" not in member_cols:
                raw.execute("ALTER TABLE members ADD COLUMN chip_color TEXT")
            canonical_cols = [row[1] for row in raw.execute("PRAGMA table_info(canonical_sets)").fetchall()]
            if "source_confidence" not in canonical_cols:
                raw.execute("ALTER TABLE canonical_sets ADD COLUMN source_confidence REAL NOT NULL DEFAULT 0.0")
            raw.commit()
            raw.close()
```

- [ ] **Step 5.3: Run full test suite to confirm SQLite path still works**

```bash
cd services/api && python -m pytest -v
```
Expected: all existing tests + new tests pass.

- [ ] **Step 5.4: Commit**

```bash
cd services/api && git add app/core/db_adapter.py app/core/db.py
git commit -m "feat: add Postgres/SQLite dual-mode db adapter via DATABASE_URL"
```

---

## Task 6: Render deployment config

**Files:**
- Create: `render.yaml`
- Modify: `services/api/.env.example`
- Create: `services/api/Procfile` (optional, handled by render.yaml startCommand)

> Render Web Service (Starter, $7/mo) for the API + user-managed Neon free-tier Postgres. Hard cost ceiling: Render's Starter plan is fixed price; Google Cloud Vision has a free-tier 1000 images/month which covers the beta comfortably.

- [ ] **Step 6.1: Create render.yaml**

Create `render.yaml` at the repo root:
```yaml
services:
  - type: web
    name: festival-together-api
    runtime: python
    rootDir: services/api
    buildCommand: pip install .
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    plan: starter
    healthCheckPath: /health
    healthCheckTimeout: 15
    envVars:
      - key: APP_ENV
        value: production
      - key: DATABASE_URL
        sync: false          # set manually in Render dashboard — paste Neon connection string
      - key: GOOGLE_VISION_API_KEY
        sync: false          # set manually in Render dashboard
      - key: PYTHONUNBUFFERED
        value: "1"
```

- [ ] **Step 6.2: Update .env.example**

Edit `services/api/.env.example` to add new vars:
```
APP_ENV=local
SQLITE_PATH=./coachella.db
DATABASE_URL=
GOOGLE_VISION_API_KEY=
```

- [ ] **Step 6.3: Verify render.yaml is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('render.yaml'))" && echo "valid"
```
Expected: `valid`

- [ ] **Step 6.4: Commit**

```bash
git add render.yaml services/api/.env.example
git commit -m "feat: add Render deployment config with Postgres + Vision env vars"
```

---

## Task 7: STOP — Accounts and credentials needed

> **This task requires the user to create accounts and obtain credentials before proceeding.**

Before continuing, the following accounts must be set up. These are one-time steps:

**A) Google Cloud Vision API Key (~15 minutes)**
1. Go to https://console.cloud.google.com and create a new project named `festival-together`
2. Enable the "Cloud Vision API" in APIs & Services → Library
3. Go to APIs & Services → Credentials → Create Credentials → API Key
4. Copy the key — you'll paste it into Render as `GOOGLE_VISION_API_KEY`
5. Under "API restrictions", restrict the key to "Cloud Vision API" only
6. Set a monthly budget alert at $5: Billing → Budgets & alerts → Create budget

**B) Neon Postgres (~10 minutes, free)**
1. Go to https://neon.tech and sign up (free tier, no credit card required)
2. Create a project named `festival-together`
3. Copy the connection string (starts with `postgresql://`) — you'll paste it into Render as `DATABASE_URL`
4. Note: Neon free tier = 0.5 GB storage, plenty for 12 users

**C) Render account (~10 minutes, $7/month)**
1. Go to https://render.com and sign up
2. Connect your GitHub account
3. Deploy the service by selecting the repo → "New Web Service" — Render will detect `render.yaml`
4. In the service's Environment tab, set `DATABASE_URL` and `GOOGLE_VISION_API_KEY`
5. Note: Render Starter plan is $7/month flat — no surprise scaling bills

**After setup:** provide the deployed API base URL (e.g. `https://festival-together-api.onrender.com`) so it can be set in the mobile app.

> **Also needed later (Tasks 11-12):**
> - Apple Developer Program ($99/year): https://developer.apple.com/programs/enroll/
> - Google Play Developer account ($25 one-time): https://play.google.com/console/signup

---

## Task 8: Mobile — install packages and upload service

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/services/uploadImages.js`

- [ ] **Step 8.1: Install expo-image-picker and expo-image-manipulator**

```bash
cd apps/mobile && npx expo install expo-image-picker expo-image-manipulator
```
Expected: packages added to `package.json` and `node_modules`.

- [ ] **Step 8.2: Verify packages installed**

```bash
cd apps/mobile && node -e "require('expo-image-picker'); require('expo-image-manipulator'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 8.3: Create the upload service**

Create `apps/mobile/src/services/uploadImages.js`:
```javascript
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Open the system photo picker and return an array of compressed image URIs.
 * Returns null if the user cancels.
 */
export async function pickImages() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('permission_denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 1,
    selectionLimit: 30,
  });

  if (result.canceled) return null;
  return result.assets.map((a) => a.uri);
}

/**
 * Compress a single image URI to a JPEG with longest side ≤ 1500px.
 * Returns the compressed URI.
 */
async function compressImage(uri) {
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1500 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipResult.uri;
}

/**
 * Upload images to the given endpoint as multipart/form-data.
 *
 * @param {string} apiUrl  - base URL, e.g. https://festival-together-api.onrender.com
 * @param {string} endpoint - path, e.g. /v1/groups/abc/canonical/upload
 * @param {string} sessionToken
 * @param {string[]} imageUris
 * @param {function} onProgress - called with (completedCount, totalCount)
 * @returns {{ parsed_count, failed_count, parse_job_id, unresolved_count? }}
 */
export async function uploadImages(apiUrl, endpoint, sessionToken, imageUris, onProgress) {
  const formData = new FormData();

  for (let i = 0; i < imageUris.length; i++) {
    const compressedUri = await compressImage(imageUris[i]);
    const filename = `image_${i}.jpg`;
    formData.append('images', {
      uri: compressedUri,
      name: filename,
      type: 'image/jpeg',
    });
    if (onProgress) onProgress(i + 1, imageUris.length);
  }

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'x-session-token': sessionToken,
      // Note: do NOT set Content-Type — let fetch set it with the boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `upload_failed_${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 8.4: Commit**

```bash
cd apps/mobile && git add package.json src/services/uploadImages.js
git commit -m "feat: add mobile image picker and upload service with compression"
```

---

## Task 9: Wire founder upload flow in mobile

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/App.js`

> Replace the "Load Demo Schedule" button in the founder setup step with a real "Choose Screenshots" button that opens the photo picker, uploads to `/v1/groups/{group_id}/canonical/upload`, and shows upload progress.

- [ ] **Step 9.1: Update SetupScreen founder_setup step**

In `apps/mobile/src/screens/SetupScreen.js`, find the `founder_setup` step block (around line 94–103) and replace it:
```javascript
{onboardingStep === 'founder_setup' ? (
  <View style={styles.stepCard}>
    <Text style={styles.stepTitle}>Upload Festival Schedule</Text>
    <Text style={styles.helper}>
      Take screenshots of the official Coachella schedule (from the app or website) and select them here.
      You can select up to 30 screenshots.
    </Text>
    {uploadProgress ? (
      <Text style={styles.helper}>{uploadProgress}</Text>
    ) : null}
    <ActionButton
      label="Choose Screenshots from Library"
      onPress={onChooseFounderScreenshots}
      primary
      disabled={loading}
    />
    {inviteCode ? <Text style={styles.helper}>Invite code: {inviteCode}</Text> : null}
  </View>
) : null}
```

Also add `uploadProgress` and `onChooseFounderScreenshots` to the SetupScreen props destructuring at the top of the function.

The full updated props list:
```javascript
export function SetupScreen({
  userRole,
  onboardingStep,
  displayName,
  setDisplayName,
  groupName,
  setGroupName,
  inviteCodeInput,
  setInviteCodeInput,
  inviteCode,
  selectedChipColor,
  setSelectedChipColor,
  chipColorOptions,
  availableJoinColors,
  personalSets,
  loading,
  error,
  log,
  uploadProgress,
  onBeginProfile,
  onChooseFounderScreenshots,
  onCompleteFounderSetup,
  onChooseMemberScreenshots,
  onImportPersonal,
  onSetPreference,
  onContinueFromReview,
  onFinishOnboarding,
  onRunSimulatorDemoFlow,
  onResetFlow,
  onChoosePath
})
```

Update the `choose_library` step to use the new prop name:
```javascript
{onboardingStep === 'choose_library' ? (
  <View style={styles.stepCard}>
    <Text style={styles.stepTitle}>Upload Your Schedule</Text>
    <Text style={styles.helper}>Select your personal schedule screenshots from your photo library.</Text>
    {uploadProgress ? (
      <Text style={styles.helper}>{uploadProgress}</Text>
    ) : null}
    <ActionButton label="Choose Screenshots from Library" onPress={onChooseMemberScreenshots} primary disabled={loading} />
    <ActionButton label="Use Demo Data" onPress={onImportPersonal} disabled={loading} />
  </View>
) : null}
```

- [ ] **Step 9.2: Add upload handlers in App.js**

Read `apps/mobile/App.js` lines 1–80 (already done above). Now add the import for uploadImages near the top of App.js, after existing imports:
```javascript
import { pickImages, uploadImages } from './src/services/uploadImages';
```

Add a new state variable after the existing state declarations:
```javascript
const [uploadProgress, setUploadProgress] = useState('');
```

Add the `handleChooseFounderScreenshots` handler (add near other handler functions):
```javascript
const handleChooseFounderScreenshots = async () => {
  setError('');
  try {
    const uris = await pickImages();
    if (!uris) return; // user cancelled
    setLoading(true);
    setUploadProgress(`Uploading 0 of ${uris.length}...`);
    const result = await uploadImages(
      apiUrl,
      `/v1/groups/${groupId}/canonical/upload`,
      memberSession,
      uris,
      (done, total) => setUploadProgress(`Uploading ${done} of ${total}...`),
    );
    setUploadProgress('');
    appendLog(`Parsed ${result.parsed_count} sets (${result.failed_count} failed)`);
    // Proceed to confirm step
    await handleCompleteFounderSetup();
  } catch (err) {
    setUploadProgress('');
    setError(err.message || 'Upload failed');
  } finally {
    setLoading(false);
  }
};
```

Add `handleChooseMemberScreenshots` handler:
```javascript
const handleChooseMemberScreenshots = async () => {
  setError('');
  try {
    const uris = await pickImages();
    if (!uris) return;
    setLoading(true);
    setUploadProgress(`Uploading 0 of ${uris.length}...`);
    const result = await uploadImages(
      apiUrl,
      '/v1/members/me/personal/upload',
      memberSession,
      uris,
      (done, total) => setUploadProgress(`Uploading ${done} of ${total}...`),
    );
    setUploadProgress('');
    appendLog(`Parsed ${result.parsed_count} sets (${result.failed_count} failed)`);
    // Refresh review data same as existing onImportPersonal success path
    await handleRefreshPersonalReview();
    setOnboardingStep('review');
  } catch (err) {
    setUploadProgress('');
    setError(err.message || 'Upload failed');
  } finally {
    setLoading(false);
  }
};
```

Pass `uploadProgress`, `onChooseFounderScreenshots`, and `onChooseMemberScreenshots` to `<SetupScreen>`:
Find the `<SetupScreen` JSX in App.js and add these props:
```javascript
uploadProgress={uploadProgress}
onChooseFounderScreenshots={handleChooseFounderScreenshots}
onChooseMemberScreenshots={handleChooseMemberScreenshots}
```

- [ ] **Step 9.3: Verify the app compiles**

```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-test-build 2>&1 | tail -5
```
Expected: `Bundle exported successfully` (or similar success message).

- [ ] **Step 9.4: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/App.js
git commit -m "feat: wire real image picker and upload in mobile onboarding flow"
```

---

## Task 10: Parse error retry/skip UI

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/App.js`

> After upload, show failed count with "Upload More" (retry) and "Skip & Continue" options. The review step already shows parsed sets; we enhance it with failure awareness.

- [ ] **Step 10.1: Add failed count state and retry/skip UI to review step**

In `apps/mobile/src/screens/SetupScreen.js`, find the `review` step block and update it to show failure info and retry/skip options. Add `failedCount` and `onRetryUpload` and `onSkipFailed` to the props list.

Replace the `review` step block with:
```javascript
{onboardingStep === 'review' ? (
  <View style={styles.stepCard}>
    <Text style={styles.stepTitle}>Review and Confirm</Text>
    {failedCount > 0 ? (
      <View style={styles.warningBox}>
        <Text style={styles.warningText}>
          {failedCount} screenshot{failedCount > 1 ? 's' : ''} could not be read.
        </Text>
        <View style={styles.retryRow}>
          <ActionButton label="Upload More" onPress={onRetryUpload} disabled={loading} />
          <ActionButton label="Skip & Continue" onPress={onSkipFailed} disabled={loading} />
        </View>
      </View>
    ) : null}
    {reviewCount ? (
      <View style={{ gap: 8 }}>
        {(personalSets || []).slice(0, 8).map((setItem) => (
          <View key={setItem.canonical_set_id} style={styles.setRow}>
            <Text style={styles.setTitle}>{setItem.artist_name}</Text>
            <Text style={styles.setMeta}>{setItem.stage_name} · Day {setItem.day_index}</Text>
            <View style={styles.prefRow}>
              <Pressable
                style={[styles.prefChip, setItem.preference === 'must_see' && styles.prefChipActive]}
                onPress={() => onSetPreference(setItem.canonical_set_id, 'must_see')}
              >
                <Text style={styles.prefChipText}>Must See</Text>
              </Pressable>
              <Pressable
                style={[styles.prefChip, setItem.preference === 'flexible' && styles.prefChipActive]}
                onPress={() => onSetPreference(setItem.canonical_set_id, 'flexible')}
              >
                <Text style={styles.prefChipText}>Flexible</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {reviewCount > 8 ? (
          <Text style={styles.helper}>+{reviewCount - 8} more sets</Text>
        ) : null}
      </View>
    ) : (
      <Text style={styles.helper}>No sets parsed yet.</Text>
    )}
    <ActionButton
      label={`Confirm ${reviewCount} Set${reviewCount !== 1 ? 's' : ''}`}
      onPress={onContinueFromReview}
      primary
      disabled={loading || reviewCount === 0}
    />
  </View>
) : null}
```

Add styles for the warning box (in the StyleSheet at the bottom of SetupScreen.js):
```javascript
warningBox: {
  backgroundColor: '#FFF3CD',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
  gap: 8,
},
warningText: {
  fontSize: 14,
  color: '#7B5E00',
},
retryRow: {
  flexDirection: 'row',
  gap: 8,
},
```

Add `failedCount`, `onRetryUpload`, `onSkipFailed` to the SetupScreen props destructuring.

- [ ] **Step 10.2: Add failedCount state and retry/skip handlers in App.js**

Add to App.js state declarations:
```javascript
const [uploadFailedCount, setUploadFailedCount] = useState(0);
```

After the upload completes in `handleChooseMemberScreenshots`, store failed count:
```javascript
setUploadFailedCount(result.failed_count);
```

Add retry handler (reuses the same picker flow):
```javascript
const handleRetryUpload = async () => {
  setUploadFailedCount(0);
  await handleChooseMemberScreenshots();
};

const handleSkipFailed = () => {
  setUploadFailedCount(0);
  // Already on review step with whatever was parsed; just continue
};
```

Pass to `<SetupScreen>`:
```javascript
failedCount={uploadFailedCount}
onRetryUpload={handleRetryUpload}
onSkipFailed={handleSkipFailed}
```

- [ ] **Step 10.3: Verify build**

```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-test-build2 2>&1 | tail -5
```
Expected: success.

- [ ] **Step 10.4: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/App.js
git commit -m "feat: add parse error retry/skip UI to onboarding review step"
```

---

## Task 11: Privacy screen and Terms gate

**Files:**
- Create: `apps/mobile/src/screens/PrivacyScreen.js`
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/App.js`

> A simple "Data & Privacy" screen shown once before the user chooses Create/Join. Tapping "I Agree & Continue" records acceptance locally and proceeds. No separate backend call needed — the session creation already implies acceptance.

- [ ] **Step 11.1: Create PrivacyScreen component**

Create `apps/mobile/src/screens/PrivacyScreen.js`:
```javascript
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function PrivacyScreen({ onAccept }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Privacy & Data Use</Text>
      <Text style={styles.body}>
        Festival Together helps your group coordinate Coachella schedules. Here is what we store and how we use it:
      </Text>

      <Text style={styles.sectionTitle}>What we store</Text>
      <Text style={styles.body}>
        • Your display name and avatar color{'\n'}
        • Your schedule preferences (which sets you want to see){'\n'}
        • Your group membership
      </Text>

      <Text style={styles.sectionTitle}>What we do not store</Text>
      <Text style={styles.body}>
        • Your location{'\n'}
        • Your contacts{'\n'}
        • Any information beyond your festival schedule preferences
      </Text>

      <Text style={styles.sectionTitle}>Your uploaded screenshots</Text>
      <Text style={styles.body}>
        Schedule screenshots are processed to extract set times and are deleted within 24 hours. We do not retain the original images.
      </Text>

      <Text style={styles.sectionTitle}>Deleting your data</Text>
      <Text style={styles.body}>
        You can leave your group at any time. Leaving removes your preferences from the group view immediately.
      </Text>

      <View style={styles.footer}>
        <Pressable style={styles.button} onPress={onAccept}>
          <Text style={styles.buttonText}>I Agree &amp; Continue</Text>
        </Pressable>
        <Text style={styles.fine}>
          By continuing you agree to use this app only for lawful personal use.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  body: { fontSize: 14, color: '#444', lineHeight: 22 },
  footer: { marginTop: 32, gap: 12 },
  button: {
    backgroundColor: '#4D73FF',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  fine: { fontSize: 11, color: '#888', textAlign: 'center' },
});
```

- [ ] **Step 11.2: Add privacy step to onboarding in SetupScreen.js**

In `SetupScreen.js`, import `PrivacyScreen` at the top:
```javascript
import { PrivacyScreen } from './PrivacyScreen';
```

The welcome screen already uses `onChoosePath`. Update it: change `onChoosePath('founder')` and `onChoosePath('member')` calls to first show the privacy step. The simplest way: replace the welcome action buttons to call `onShowPrivacy('founder')` and `onShowPrivacy('member')` respectively.

Update welcome screen buttons:
```javascript
<ActionButton
  label="Create a Group"
  onPress={() => onShowPrivacy('founder')}
  primary
  disabled={loading}
  large
/>
<ActionButton label="Join a Group" onPress={() => onShowPrivacy('member')} disabled={loading} large />
```

Add `privacy` step rendering before the `isWelcome` check (at the very top of the returned JSX):
```javascript
{onboardingStep === 'privacy' ? (
  <PrivacyScreen onAccept={onPrivacyAccepted} />
) : null}
```

Add `onShowPrivacy` and `onPrivacyAccepted` to props destructuring.

- [ ] **Step 11.3: Add privacy step routing in App.js**

Add state for pending path:
```javascript
const [pendingPath, setPendingPath] = useState('');
```

Add handlers:
```javascript
const handleShowPrivacy = (path) => {
  setPendingPath(path);
  setOnboardingStep('privacy');
};

const handlePrivacyAccepted = () => {
  onChoosePath(pendingPath);
};
```

Pass to `<SetupScreen>`:
```javascript
onShowPrivacy={handleShowPrivacy}
onPrivacyAccepted={handlePrivacyAccepted}
```

- [ ] **Step 11.4: Verify build**

```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-test-build3 2>&1 | tail -5
```
Expected: success.

- [ ] **Step 11.5: Commit**

```bash
git add apps/mobile/src/screens/PrivacyScreen.js apps/mobile/src/screens/SetupScreen.js apps/mobile/App.js
git commit -m "feat: add privacy/terms gate screen before create or join flow"
```

---

## Task 12: EAS build config and distribution runbook

**Files:**
- Modify: `apps/mobile/eas.json`
- Modify: `apps/mobile/app.json` (add permissions for photo library)
- Create: `docs/release-runbook.md`

> Configures EAS Build for iOS (TestFlight) and Android (internal testing). The runbook is a step-by-step guide the user follows once they have their Apple + Google accounts.

- [ ] **Step 12.1: Read current eas.json and app.json**

```bash
cat apps/mobile/eas.json
cat apps/mobile/app.json
```

- [ ] **Step 12.2: Update eas.json for full production builds**

Update `apps/mobile/eas.json` to ensure production profile has correct settings:
```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": {
        "distribution": "store"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "",
        "ascAppId": "",
        "appleTeamId": ""
      },
      "android": {
        "serviceAccountKeyPath": ""
      }
    }
  }
}
```

- [ ] **Step 12.3: Add photo library permission to app.json**

In `apps/mobile/app.json`, ensure `ios.infoPlist` and `android.permissions` include photo library access. Find the `expo` key and add:
```json
"ios": {
  "infoPlist": {
    "NSPhotoLibraryUsageDescription": "Festival Together needs access to your photo library to select your schedule screenshots."
  }
},
"android": {
  "permissions": ["READ_MEDIA_IMAGES", "READ_EXTERNAL_STORAGE"]
}
```

- [ ] **Step 12.4: Create the release runbook**

Create `docs/release-runbook.md`:
```markdown
# Release Runbook — Festival Together Private Beta

## Prerequisites

Before running any build commands, complete these one-time account setups:

### Apple Developer Program (~15 min, $99/year)
1. Go to https://developer.apple.com/programs/enroll/
2. Sign in with your Apple ID and complete enrollment
3. Note your Team ID from https://developer.apple.com/account (top right)
4. In `apps/mobile/eas.json`, fill in `appleTeamId`

### Google Play Developer (~10 min, $25 one-time)
1. Go to https://play.google.com/console/signup
2. Complete registration
3. Create an app: Festival Together, type: App, free

### EAS CLI login
```bash
npm install -g eas-cli
eas login     # uses your Expo account credentials
```

## Building for iOS (TestFlight)

```bash
cd apps/mobile

# First time only: configure your bundle ID and Apple credentials
eas build:configure

# Build for TestFlight
eas build --platform ios --profile production
```

When the build finishes, EAS prints a URL. Download the `.ipa` and upload to App Store Connect, or run:
```bash
eas submit --platform ios --profile production
```

Then in App Store Connect:
1. Go to TestFlight → your build
2. Add internal testers (up to 100 people with Apple IDs)
3. Each tester gets an email invite to install via TestFlight app

## Building for Android (Internal Testing)

```bash
eas build --platform android --profile production
# Then
eas submit --platform android --profile production
```

In Google Play Console:
1. Internal testing → Create new release → upload AAB
2. Add testers by email address
3. Share the internal testing link

## Environment Variable

The app reads `EXPO_PUBLIC_API_BASE_URL` to find the backend. Set this before building:

In `apps/mobile/.env` (create this file, it is git-ignored):
```
EXPO_PUBLIC_API_BASE_URL=https://festival-together-api.onrender.com
```

Or set it in your EAS build profile's `env` section in `eas.json`.

## Checklist before releasing to friends

- [ ] Render API deployed and `/health` returns 200
- [ ] `DATABASE_URL` (Neon) set in Render environment
- [ ] `GOOGLE_VISION_API_KEY` set in Render environment
- [ ] `EXPO_PUBLIC_API_BASE_URL` set to Render URL in mobile `.env`
- [ ] iOS build submitted to TestFlight, testers invited
- [ ] Android build submitted to Play internal testing, testers added
- [ ] Founder has completed canonical schedule upload (screenshots of official Coachella app)
- [ ] Invite code shared with group
```

- [ ] **Step 12.5: Commit**

```bash
git add apps/mobile/eas.json apps/mobile/app.json docs/release-runbook.md
git commit -m "chore: update EAS build config and add distribution runbook"
```

---

## Final verification

- [ ] **Run full backend test suite**
```bash
cd services/api && python -m pytest -v
```
Expected: all tests pass (12 original + new Vision/upload tests).

- [ ] **Run iOS export**
```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-final-check 2>&1 | tail -5
```
Expected: success.

- [ ] **Final commit message**
```bash
git log --oneline -10
```
Confirm all feature commits are present.
