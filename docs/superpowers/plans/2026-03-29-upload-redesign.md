# Upload Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single bulk-upload onboarding flow with per-day uploads using Claude vision (no Google Cloud Vision), dynamic festival days, and prod-readiness cleanup.

**Architecture:** Backend-first (Tasks 1–4 are self-contained backend changes with tests), then mobile (Tasks 5–8 wire up the new flow). Each task commits independently. The new `upload_day` onboarding step replaces `choose_library` + `review` + `confirm`. Claude vision replaces Google Cloud Vision + separate LLM text call.

**Tech Stack:** React Native / Expo Go (mobile), FastAPI + SQLite/Neon (backend), Anthropic Claude Haiku vision API, pytest (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-29-upload-redesign.md`

---

## Task 1: Replace vision pipeline with Claude vision

**Files:**
- Delete: `services/api/app/core/vision_client.py`
- Rewrite: `services/api/app/core/llm_parser.py`
- Modify: `services/api/app/core/config.py`
- Modify: `services/api/tests/test_vision_client.py` (delete or repurpose)

- [ ] **Step 1: Write failing test for `parse_schedule_from_image`**

In `services/api/tests/test_llm_parser.py` (create new file):

```python
import base64
import io
from unittest.mock import MagicMock, patch

from PIL import Image

from app.core.llm_parser import parse_schedule_from_image


def _make_test_image_bytes() -> bytes:
    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


FESTIVAL_DAYS = [{"day_index": 1, "label": "Friday"}, {"day_index": 2, "label": "Saturday"}]

MOCK_RESPONSE_JSON = '[{"artist_name":"Lady Gaga","stage_name":"Main Stage","start_time":"23:10","end_time":"24:10","day_index":1}]'


def test_parse_schedule_from_image_returns_structured_sets():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=MOCK_RESPONSE_JSON)]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    assert len(result) == 1
    assert result[0]["artist_name"] == "Lady Gaga"
    assert result[0]["day_index"] == 1


def test_parse_schedule_from_image_uses_image_block():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text="[]")]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    call_args = mock_client.messages.create.call_args
    messages = call_args.kwargs["messages"]
    content = messages[0]["content"]
    image_blocks = [b for b in content if isinstance(b, dict) and b.get("type") == "image"]
    assert len(image_blocks) == 1


def test_parse_schedule_from_image_defaults_day_label_to_first_day():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text='[{"artist_name":"Test","stage_name":"Stage","start_time":"20:00","end_time":null,"day_index":1}]')]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "", FESTIVAL_DAYS)
    assert result[0]["day_index"] == 1


def test_parse_schedule_from_image_no_api_key_returns_empty():
    with patch("app.core.llm_parser._get_client", return_value=None):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    assert result == []
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd services/api && python -m pytest tests/test_llm_parser.py -v
```
Expected: `ImportError` or `AttributeError` — `parse_schedule_from_image` doesn't exist yet.

- [ ] **Step 3: Rewrite `llm_parser.py` with vision function**

Replace entire contents of `services/api/app/core/llm_parser.py`:

```python
"""Claude vision-based schedule parser.

Replaces the two-step Google Cloud Vision OCR + Claude text pipeline.
Sends the image directly to Claude Haiku with vision to handle both
list-view screenshots (all artists are user picks) and full grid screenshots
(only highlighted/selected cells are user picks).
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_VISION_PROMPT = """\
You are extracting a user's selected festival performances from a mobile app screenshot.

The screenshot is one of two types:
1. PERSONAL LIST VIEW: Shows only the artists the user has saved/starred. All visible artists are the user's picks. Extract all of them.
2. FULL GRID WITH HIGHLIGHTS: Shows the complete festival schedule across all stages with time columns. The user's selected artists appear in highlighted, darkened, or visually distinct cells (darker background, different color, bold). Extract ONLY the highlighted/selected artists — ignore all others.

For each selected artist, extract:
- artist_name: performer name (string)
- stage_name: stage or venue name (string)
- start_time: 24-hour "HH:MM" format. Times from 12:00AM–5:59AM use "24:MM"–"29:MM" to preserve ordering after midnight (e.g. 1:00AM = "25:00")
- end_time: same format, or null if not shown
- day_index: integer matching the festival day (use the provided festival_days list to resolve day names)

Festival days for this group: {festival_days_json}
This screenshot is for day: {day_label}

Rules:
- Ignore UI chrome, headers, footers, branding, download prompts
- Ignore "Surprise", "TBA", or placeholder entries
- If the same artist appears more than once with identical time/stage, include only once
- Return ONLY a valid JSON array, no markdown fences, no explanation
- If no selected performances found, return []
"""


def _get_client():
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    except Exception as e:
        logger.error(f"Failed to create Anthropic client: {e}")
        return None


def parse_schedule_from_image(
    image_bytes: bytes,
    day_label: str,
    festival_days: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Parse a festival schedule screenshot using Claude vision.

    Handles both personal list-view screenshots and full grid screenshots
    with visual highlighting. Returns only the user's selected artists.

    Args:
        image_bytes: Compressed JPEG bytes from validate_and_compress.
        day_label: Which day this screenshot covers, e.g. "Friday".
                   If empty, defaults to festival_days[0].label.
        festival_days: List of {day_index, label} dicts from group config.

    Returns:
        List of dicts: {artist_name, stage_name, start_time, end_time, day_index}.
        Empty list if parsing fails or API key not configured.
    """
    client = _get_client()
    if client is None:
        logger.warning("ANTHROPIC_API_KEY not set — skipping vision parse")
        return []

    effective_day_label = day_label.strip() if day_label and day_label.strip() else (
        festival_days[0]["label"] if festival_days else "Day 1"
    )

    prompt = _VISION_PROMPT.format(
        festival_days_json=json.dumps(festival_days),
        day_label=effective_day_label,
    )

    image_b64 = base64.standard_b64encode(image_bytes).decode()

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        text = response.content[0].text.strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            logger.error(f"Vision parser returned non-list: {type(parsed)}")
            return []
    except json.JSONDecodeError as e:
        logger.error(f"Vision parser returned invalid JSON: {e}")
        return []
    except Exception as e:
        logger.error(f"Vision parse failed: {e}")
        return []

    # Build day_label → day_index map
    day_map: dict[str, int] = {}
    for day in festival_days:
        label = day.get("label", "")
        idx = day.get("day_index", 1)
        day_map[label.upper()] = idx

    default_day_index = (
        day_map.get(effective_day_label.upper(), festival_days[0]["day_index"])
        if festival_days else 1
    )

    results = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        artist = (entry.get("artist_name") or "").strip()
        stage = (entry.get("stage_name") or "").strip()
        start = (entry.get("start_time") or "").strip()
        end = entry.get("end_time")
        if end:
            end = str(end).strip()
        day_index = entry.get("day_index")
        if not isinstance(day_index, int):
            day_index = default_day_index
        if not artist or not stage or not start:
            continue
        results.append({
            "artist_name": artist,
            "stage_name": stage,
            "start_time": start,
            "end_time": end,
            "day_index": day_index,
        })

    logger.info(f"parse_schedule_from_image returned {len(results)} sets")
    return results
```

- [ ] **Step 4: Update `config.py` — remove Google Vision key, rename app**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "festival-together"
    app_env: str = "local"
    app_version: str = "0.1.0"
    api_prefix: str = "/v1"
    sqlite_path: str = "./festival-together.db"
    database_url: str = ""
    anthropic_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
```

- [ ] **Step 5: Delete `vision_client.py` and remove its test**

```bash
rm services/api/app/core/vision_client.py
rm services/api/tests/test_vision_client.py
```

- [ ] **Step 6: Run tests**

```bash
cd services/api && python -m pytest tests/test_llm_parser.py -v
```
Expected: All 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add services/api/app/core/llm_parser.py services/api/app/core/config.py services/api/tests/test_llm_parser.py
git rm services/api/app/core/vision_client.py services/api/tests/test_vision_client.py
git commit -m "feat: replace Google Vision + text LLM with single Claude vision parser"
```

---

## Task 2: Update personal upload endpoint

**Files:**
- Modify: `services/api/app/api/personal.py`
- Modify: `services/api/tests/test_personal.py`

- [ ] **Step 1: Write failing tests**

Add to `services/api/tests/test_personal.py`:

```python
def test_upload_returns_sets_array() -> None:
    """Upload endpoint must return a 'sets' array in the response."""
    founder = _create_group("UploadTest", "Founder")
    session_token = founder["session"]["token"]

    img_bytes = _make_test_image()

    with patch("app.api.personal.parse_schedule_from_image") as mock_parse:
        mock_parse.return_value = [
            {"artist_name": "Lady Gaga", "stage_name": "Main Stage",
             "start_time": "23:10", "end_time": "24:10", "day_index": 1}
        ]
        resp = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": session_token},
            files={"images": ("img.jpg", img_bytes, "image/jpeg")},
            data={"day_label": "Friday"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "sets" in body
    assert len(body["sets"]) >= 1
    assert "canonical_set_id" in body["sets"][0]
    assert "artist_name" in body["sets"][0]


def test_upload_accepts_day_label_param() -> None:
    """Upload endpoint must accept day_label as a form field."""
    founder = _create_group("DayLabelTest", "Founder2")
    session_token = founder["session"]["token"]
    img_bytes = _make_test_image()

    with patch("app.api.personal.parse_schedule_from_image") as mock_parse:
        mock_parse.return_value = []
        resp = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": session_token},
            files={"images": ("img.jpg", img_bytes, "image/jpeg")},
            data={"day_label": "Saturday"},
        )
        call_args = mock_parse.call_args
        # second positional arg is day_label
        assert call_args.args[1] == "Saturday" or call_args.kwargs.get("day_label") == "Saturday"
```

Add helper at the top of the test file (after imports):
```python
import io
from unittest.mock import patch
from PIL import Image

def _make_test_image() -> bytes:
    img = Image.new("RGB", (100, 100), color=(200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()
```

Also update `test_personal_import_and_setup_completion` — it uses the legacy `/personal/import` endpoint which is being kept for tests (the import endpoint is separate from upload). No change needed there. The upload tests use `/personal/upload`.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd services/api && python -m pytest tests/test_personal.py::test_upload_returns_sets_array tests/test_personal.py::test_upload_accepts_day_label_param -v
```
Expected: FAIL — `sets` key missing from response, `day_label` param not accepted.

- [ ] **Step 3: Update `personal.py` upload endpoint**

At top of file, replace import of vision/llm modules:
```python
# Remove this line:
from app.core.vision_client import extract_text_from_image
# Remove this line:
from app.core.llm_parser import parse_schedule_with_llm
# Add this line:
from app.core.llm_parser import parse_schedule_from_image
```

Change endpoint signature (add `day_label` form field):
```python
@router.post("/members/me/personal/upload")
def upload_personal_images(
    images: List[UploadFile] = File(...),
    day_label: str = Form(None),
    session=Depends(require_session),
) -> dict:
```

Add `Form` to the FastAPI imports at top of file:
```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
```

Replace the per-image processing loop (Phase 2) — remove the two-step OCR+LLM calls, replace with single vision call:
```python
    # ── Phase 2: Claude vision parse (outside DB transaction) ────────────────
    failed_count = 0
    all_parsed: list[dict] = []
    effective_day_label = day_label or (festival_days[0]["label"] if festival_days else "")

    for idx, upload in enumerate(images):
        raw = upload.file.read()
        try:
            compressed = validate_and_compress(raw)
        except ImageValidationError:
            failed_count += 1
            continue

        parsed = parse_schedule_from_image(compressed, effective_day_label, festival_days)
        logger.info(f"Vision parse for image {idx + 1}: {len(parsed)} sets")
        all_parsed.extend(parsed)
```

Remove the demo fallback from `_coerce_personal_screenshots` — delete the entire helper function and its call site in `import_personal`. The `/personal/import` endpoint (legacy/test) can be left as-is for now since tests depend on it; just remove the demo path from `upload`:

The upload endpoint already doesn't use `_coerce_personal_screenshots`, so just remove those lines from Phase 2 and the function won't be called from upload anymore.

At the end of the upload endpoint, build and return the `sets` array. Replace the return statement:
```python
    # Build sets response from all_parsed + canonical_id_map
    sets_response = [
        {
            "canonical_set_id": canonical_id_map[(
                e["artist_name"].lower().strip(),
                e["stage_name"].lower().strip(),
                e["start_time"],
                e["day_index"],
            )],
            "artist_name": e["artist_name"],
            "stage_name": e["stage_name"],
            "start_time_pt": e["start_time"],
            "end_time_pt": e["end_time"] or e["start_time"],
            "day_index": e["day_index"],
        }
        for e in all_parsed
        if (e["artist_name"].lower().strip(), e["stage_name"].lower().strip(), e["start_time"], e["day_index"]) in canonical_id_map
    ]

    return {
        "ok": True,
        "parse_job_id": parse_job_id,
        "parsed_count": len(all_parsed),
        "new_canonical_count": len(canonical_id_map),
        "failed_count": failed_count,
        "sets": sets_response,
    }
```

- [ ] **Step 4: Run tests**

```bash
cd services/api && python -m pytest tests/test_personal.py -v
```
Expected: All tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/personal.py services/api/tests/test_personal.py
git commit -m "feat: update upload endpoint — Claude vision, day_label param, sets response"
```

---

## Task 3: Fix founder setup_status + remove canonical demo fallback

**Files:**
- Modify: `services/api/app/api/groups.py`
- Modify: `services/api/app/api/canonical.py`
- Modify: `services/api/tests/test_groups.py`

- [ ] **Step 1: Write failing test**

Add to `services/api/tests/test_groups.py`:

```python
def test_founder_created_with_incomplete_setup_status() -> None:
    """Founders must start as 'incomplete' so the upload flow is required."""
    resp = client.post(
        "/v1/groups",
        json={"group_name": "TestGroup", "display_name": "Alice"},
    )
    assert resp.status_code == 200
    member = resp.json()["member"]
    assert member["setup_status"] == "incomplete"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd services/api && python -m pytest tests/test_groups.py::test_founder_created_with_incomplete_setup_status -v
```
Expected: FAIL — `setup_status` is `"complete"`.

- [ ] **Step 3: Fix `groups.py` founder insert**

In `services/api/app/api/groups.py`, find the member INSERT in `create_group` and change `'complete'` to `'incomplete'`:

```python
        conn.execute(
            """
            INSERT INTO members (id, group_id, display_name, chip_color, avatar_photo_url, role, setup_status, active, created_at)
            VALUES (?, ?, ?, ?, NULL, 'founder', 'incomplete', 1, ?)
            """,
            (member_id, group_id, payload.display_name.strip(), founder_color, now),
        )
```

Also update the `MemberSummary` in the response:
```python
        member=MemberSummary(
            ...
            setup_status="incomplete",
        ),
```

- [ ] **Step 4: Remove demo fallback from `canonical.py`**

In `services/api/app/api/canonical.py`, replace `_coerce_screenshots`:

```python
def _coerce_screenshots(payload: CanonicalImportRequest) -> list[ScreenshotInput]:
    if not payload.screenshots:
        raise HTTPException(status_code=400, detail="screenshots_required")
    return [
        ScreenshotInput(
            source_id=item.source_id or f"canonical-upload-{index + 1}",
            raw_text=item.raw_text,
        )
        for index, item in enumerate(payload.screenshots)
    ]
```

Remove unused import: `from app.core.parser import ScreenshotInput, build_demo_canonical_screenshots, parse_canonical_screenshots` → remove `build_demo_canonical_screenshots`.

Note: The legacy `canonical/import` endpoint is kept for post-launch founder tools (FounderToolsScreen). It now requires real screenshots — no demo data.

- [ ] **Step 5: Run tests**

```bash
cd services/api && python -m pytest tests/test_groups.py tests/test_canonical.py -v
```
Expected: All pass. If `test_groups.py` has tests that relied on `setup_status == 'complete'` for founders, update them to expect `'incomplete'`.

- [ ] **Step 6: Commit**

```bash
git add services/api/app/api/groups.py services/api/app/api/canonical.py services/api/tests/test_groups.py
git commit -m "fix: founder starts incomplete, remove canonical demo fallback"
```

---

## Task 4: Run full backend test suite + deploy

- [ ] **Step 1: Run all backend tests**

```bash
cd services/api && python -m pytest tests/ -v
```
Expected: All tests pass.

- [ ] **Step 2: Deploy to Render**

```bash
git push
```
Watch Render deploy logs — confirm `alembic upgrade head` runs, server starts healthy.

- [ ] **Step 3: Smoke test**

```bash
curl https://festival-together-api.onrender.com/health
```
Expected: `{"status": "ok"}` or similar.

---

## Task 5: Dynamic festival days — mobile

**Files:**
- Modify: `apps/mobile/App.js`
- Modify: `apps/mobile/src/screens/SetupScreen.js`

- [ ] **Step 1: Update App.js — remove `DEFAULT_FESTIVAL_DAYS`, update state and handlers**

In `App.js`:

a) Remove the `DEFAULT_FESTIVAL_DAYS` constant (lines 17–21).

b) Change `festivalDays` initial state:
```js
const [festivalDays, setFestivalDays] = useState([{ dayIndex: 1, label: '' }]);
```

c) Update `loadAppState` restore:
```js
setFestivalDays(storedState.festivalDays || [{ dayIndex: 1, label: '' }]);
```

d) Add `addFestivalDay` and `removeFestivalDay` handlers (after `setFestivalDayLabel`):
```js
const addFestivalDay = () => {
  setFestivalDays((prev) => {
    const nextIndex = prev.length + 1;
    return [...prev, { dayIndex: nextIndex, label: '' }];
  });
};

const removeFestivalDay = (dayIndex) => {
  setFestivalDays((prev) => {
    if (prev.length <= 1) return prev; // minimum 1
    const filtered = prev.filter((d) => d.dayIndex !== dayIndex);
    // Reassign sequential indices
    return filtered.map((d, i) => ({ ...d, dayIndex: i + 1 }));
  });
};
```

e) Pass new props to `SetupScreen`:
```jsx
onAddFestivalDay={addFestivalDay}
onRemoveFestivalDay={removeFestivalDay}
```

f) Update `completeFestivalSetup` validation — require all labels non-empty:
```js
const completeFestivalSetup = () =>
  run('create group', async () => {
    if (!isOnline) throw new Error('Creating the group requires a connection');
    if (festivalDays.some((d) => !d.label.trim())) throw new Error('Enter a name for each day');
    // ... rest unchanged
  });
```

- [ ] **Step 2: Update `festival_setup` step in `SetupScreen.js`**

Replace the `festival_setup` block in `SetupScreen.js`. Add `onAddFestivalDay` and `onRemoveFestivalDay` to the component props. Replace the static day list with:

```jsx
{onboardingStep === 'festival_setup' ? (
  <View style={styles.stepCard}>
    <ActionButton label="← Back" onPress={() => onChoosePath('founder')} disabled={loading} />
    <Text style={styles.stepTitle}>Festival Days</Text>
    <Text style={styles.helper}>Add each day of the festival you're attending.</Text>
    {(festivalDays || []).map((day, index) => (
      <View key={day.dayIndex} style={styles.dayRow}>
        <Text style={styles.dayIndexLabel}>Day {index + 1}</Text>
        <TextInput
          value={day.label}
          onChangeText={(text) => setFestivalDayLabel(day.dayIndex, text)}
          style={[styles.input, styles.dayInput]}
          placeholder={index === 0 ? 'e.g. Friday' : index === 1 ? 'e.g. Saturday' : 'e.g. Sunday'}
          maxLength={20}
        />
        <Pressable
          onPress={() => onRemoveFestivalDay(day.dayIndex)}
          disabled={(festivalDays || []).length <= 1}
          style={[styles.removeButton, (festivalDays || []).length <= 1 && styles.removeButtonDisabled]}
        >
          <Text style={styles.removeButtonText}>×</Text>
        </Pressable>
      </View>
    ))}
    <ActionButton label="＋ Add Day" onPress={onAddFestivalDay} disabled={loading} />
    <ActionButton label="Continue" onPress={onCompleteFestivalSetup} primary disabled={loading} />
  </View>
) : null}
```

Add styles:
```js
removeButton: {
  width: 32, height: 32, borderRadius: 16,
  backgroundColor: '#e8ddd0', alignItems: 'center', justifyContent: 'center'
},
removeButtonDisabled: { opacity: 0.3 },
removeButtonText: { fontSize: 18, color: '#5a4d3b', fontWeight: '700', lineHeight: 20 },
```

- [ ] **Step 3: Test on device**

Reload Expo Go. Go through "Create a Group" → `festival_setup`. Verify:
- Starts with 1 blank day row
- "＋ Add Day" appends a new row
- "×" removes a row; disabled when only 1 remains
- Continue blocked when any label is empty

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/App.js apps/mobile/src/screens/SetupScreen.js
git commit -m "feat: dynamic festival days — start with 1, add/remove UI"
```

---

## Task 6: Per-day upload state + upload service update

**Files:**
- Modify: `apps/mobile/App.js`
- Modify: `apps/mobile/src/services/uploadImages.js`

- [ ] **Step 1: Add `day_label` support to `uploadImages.js`**

Add `dayLabel` optional parameter and append to formData:

```js
export async function uploadImages(apiUrl, endpoint, sessionToken, imageUris, onProgress, dayLabel) {
  const formData = new FormData();

  if (dayLabel) {
    formData.append('day_label', dayLabel);
  }

  for (let i = 0; i < imageUris.length; i++) {
    const compressedUri = await compressImage(imageUris[i]);
    formData.append('images', {
      uri: compressedUri,
      name: `image_${i}.jpg`,
      type: 'image/jpeg',
    });
    if (onProgress) onProgress(i + 1, imageUris.length);
  }
  // ... rest unchanged
}
```

Also update `pickImages` to accept an optional `selectionLimit` (default 30):
```js
export async function pickImages(selectionLimit = 30) {
  // ...
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
    selectionLimit,
  });
  // ...
}
```

- [ ] **Step 2: Add new upload state variables to App.js**

After existing state declarations, add:
```js
const [uploadDayIndex, setUploadDayIndex] = useState(1);
const [dayUploadStatus, setDayUploadStatus] = useState('idle'); // 'idle'|'uploading'|'done'|'error'
const [dayParsedSets, setDayParsedSets] = useState([]);
const [skippedDayIndices, setSkippedDayIndices] = useState(new Set());
const [successfulUploadCount, setSuccessfulUploadCount] = useState(0);
```

- [ ] **Step 3: Add new fields to `saveAppState` and `loadAppState`**

In the `saveAppState` call (the `useEffect` around line 163), add to the object:
```js
uploadDayIndex,
successfulUploadCount,
skippedDayIndices: Array.from(skippedDayIndices),
```

Add to the dependency array too.

In `loadAppState` restore:
```js
setUploadDayIndex(storedState.uploadDayIndex || 1);
setSuccessfulUploadCount(storedState.successfulUploadCount || 0);
setSkippedDayIndices(new Set(storedState.skippedDayIndices || []));
```

- [ ] **Step 4: Add upload action handlers to App.js**

```js
const chooseAndUploadDayScreenshot = async () => {
  if (!memberSession || !isOnline) {
    setError(isOnline ? 'Start onboarding first' : 'Upload requires a connection');
    return;
  }
  let uris;
  try {
    uris = await pickImages(1); // one screenshot per day
  } catch (e) {
    setError('Photo library permission denied');
    return;
  }
  if (!uris || uris.length === 0) return;

  const currentDay = festivalDays.find((d) => d.dayIndex === uploadDayIndex);
  const dayLabel = currentDay?.label || '';

  setDayUploadStatus('uploading');
  setDayParsedSets([]);
  setError('');

  try {
    const response = await uploadImages(
      apiUrl,
      '/v1/members/me/personal/upload',
      memberSession,
      uris,
      null,
      dayLabel
    );
    const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
    setDayParsedSets(sets);
    setDayUploadStatus('done');
  } catch (e) {
    setDayUploadStatus('error');
    setError(e instanceof Error ? e.message : String(e));
  }
};

const advanceUploadDay = (wasSuccessful = false) => {
  if (wasSuccessful) {
    setSuccessfulUploadCount((prev) => prev + 1);
  }
  const currentIdx = festivalDays.findIndex((d) => d.dayIndex === uploadDayIndex);
  const nextDay = festivalDays[currentIdx + 1];
  if (nextDay) {
    setUploadDayIndex(nextDay.dayIndex);
    setDayUploadStatus('idle');
    setDayParsedSets([]);
    setError('');
  } else {
    finishUploadFlow(wasSuccessful);
  }
};

const skipUploadDay = () => {
  setSkippedDayIndices((prev) => new Set([...prev, uploadDayIndex]));
  advanceUploadDay(false);
};

const finishUploadFlow = (lastDayWasSuccessful = false) => {
  const totalCount = successfulUploadCount + (lastDayWasSuccessful ? 1 : 0);
  if (totalCount < 1) {
    setError('Upload at least one day\'s schedule to continue');
    return;
  }
  run('finish setup', async () => {
    if (!isOnline) throw new Error('Finish setup requires a connection');
    await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/setup/complete',
      method: 'POST',
      sessionToken: memberSession,
      body: { confirm: true }
    });
    const homePayload = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/home',
      method: 'GET',
      sessionToken: memberSession
    });
    const nextGroupId = homePayload.group.id;
    setHomeSnapshot(homePayload);
    setGroupId(nextGroupId);
    const schedulePayload = await fetchSchedule(memberSession, nextGroupId, { memberIds: [] });
    setSelectedMemberIds([]);
    setScheduleSnapshot(schedulePayload);
    setLastSyncAt(new Date().toISOString());
    setOnboardingStep('complete');
    setActiveView('group');
    setMenuOpen(false);
  });
};

const setDayPreference = (canonicalSetId, preference) => {
  // Optimistic local update to dayParsedSets
  setDayParsedSets((prev) =>
    prev.map((s) => s.canonical_set_id === canonicalSetId ? { ...s, preference } : s)
  );
  // Fire PATCH (reuse existing setPreference logic but for dayParsedSets)
  if (!memberSession || !isOnline) return;
  apiRequest({
    baseUrl: apiUrl,
    path: `/v1/members/me/sets/${canonicalSetId}`,
    method: 'PATCH',
    sessionToken: memberSession,
    body: { preference }
  }).catch(() => {
    // Revert on error
    setDayParsedSets((prev) =>
      prev.map((s) => s.canonical_set_id === canonicalSetId
        ? { ...s, preference: preference === 'must_see' ? 'flexible' : 'must_see' }
        : s
      )
    );
  });
};
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.js apps/mobile/src/services/uploadImages.js
git commit -m "feat: per-day upload state and action handlers"
```

---

## Task 7: Per-day upload screen in SetupScreen

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/App.js` (add new props, update transitions)

- [ ] **Step 1: Add `upload_day` step to SetupScreen.js**

Add new props to the `SetupScreen` function signature:
```js
onChooseDayScreenshot,
onSkipDay,
onAdvanceDay,
onFinishUploadFlow,
onSetDayPreference,
uploadDayIndex,
dayUploadStatus,
dayParsedSets,
successfulUploadCount,
```

Add the `upload_day` step block (after `festival_setup` block, before closing of the main conditional chain):

```jsx
{onboardingStep === 'upload_day' ? (() => {
  const totalDays = (festivalDays || []).length;
  const dayPosition = (festivalDays || []).findIndex((d) => d.dayIndex === uploadDayIndex) + 1;
  const currentDay = (festivalDays || []).find((d) => d.dayIndex === uploadDayIndex);
  const dayLabel = currentDay?.label || `Day ${uploadDayIndex}`;
  const truncatedLabel = dayLabel.length > 15 ? dayLabel.slice(0, 15) + '…' : dayLabel;
  const isLastDay = dayPosition === totalDays;
  const canFinish = successfulUploadCount >= 1 || dayUploadStatus === 'done';

  return (
    <View style={styles.stepCard}>
      <View style={styles.skipRow}>
        <Pressable onPress={onSkipDay}>
          <Text style={styles.skipLink}>Skip this day →</Text>
        </Pressable>
      </View>

      <Text style={styles.stepTitle}>Upload {truncatedLabel} schedule</Text>
      <Text style={styles.helper}>Day {dayPosition} of {totalDays}</Text>

      {dayUploadStatus === 'idle' || dayUploadStatus === 'error' ? (
        <ActionButton
          label="Choose Screenshot"
          onPress={onChooseDayScreenshot}
          primary
          disabled={loading}
        />
      ) : null}

      {dayUploadStatus === 'uploading' ? (
        <View style={styles.uploadingRow}>
          <ActivityIndicator color="#183a27" />
          <Text style={styles.helper}>Processing…</Text>
        </View>
      ) : null}

      {dayUploadStatus === 'error' ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      {dayUploadStatus === 'done' ? (
        <>
          <Text style={styles.parsedCount}>✓ {dayParsedSets.length} artists found</Text>
          {(dayParsedSets || []).map((setItem) => (
            <View key={setItem.canonical_set_id} style={styles.setRow}>
              <Text style={styles.setTitle}>{setItem.artist_name}</Text>
              <Text style={styles.helper}>{setItem.stage_name} · {setItem.start_time_pt}–{setItem.end_time_pt}</Text>
              <View style={styles.prefRow}>
                <PrefButton
                  label="Must See"
                  selected={setItem.preference === 'must_see'}
                  onPress={() => onSetDayPreference(setItem.canonical_set_id, 'must_see')}
                />
                <PrefButton
                  label="Maybe"
                  selected={setItem.preference !== 'must_see'}
                  onPress={() => onSetDayPreference(setItem.canonical_set_id, 'flexible')}
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      {dayUploadStatus === 'done' ? (
        isLastDay ? (
          <ActionButton
            label="Finish →"
            onPress={() => onFinishUploadFlow()}
            primary
            disabled={loading}
          />
        ) : (
          <ActionButton
            label="Next Day →"
            onPress={() => onAdvanceDay(true)}
            primary
            disabled={loading}
          />
        )
      ) : isLastDay && canFinish ? (
        <ActionButton
          label="Finish →"
          onPress={() => onFinishUploadFlow()}
          primary
          disabled={loading || dayUploadStatus === 'uploading'}
        />
      ) : null}
    </View>
  );
})() : null}
```

Add styles:
```js
skipRow: { flexDirection: 'row', justifyContent: 'flex-end' },
skipLink: { color: '#345a46', fontWeight: '600', fontSize: 13 },
uploadingRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
parsedCount: { color: '#2d6a4a', fontWeight: '700', fontSize: 14 },
```

Remove the old `choose_library`, `review`, and `confirm` step blocks entirely.

- [ ] **Step 2: Remove `confirm` step from App.js `finishOnboarding`**

The old `finishOnboarding` function is now replaced by `finishUploadFlow`. Remove `finishOnboarding` from App.js. (It should no longer be passed to SetupScreen.)

- [ ] **Step 3: Pass new props to SetupScreen in App.js render**

In the `<SetupScreen ... />` JSX, add:
```jsx
uploadDayIndex={uploadDayIndex}
dayUploadStatus={dayUploadStatus}
dayParsedSets={dayParsedSets}
successfulUploadCount={successfulUploadCount}
onChooseDayScreenshot={chooseAndUploadDayScreenshot}
onSkipDay={skipUploadDay}
onAdvanceDay={advanceUploadDay}
onFinishUploadFlow={finishUploadFlow}
onSetDayPreference={setDayPreference}
```

Remove old props no longer needed: `onImportPersonal`, `onContinueFromReview`, `onFinishOnboarding`, `uploadProgress`, `uploadFailedCount`, `failedCount`, `onRetryUpload`, `onSkipFailed`.

- [ ] **Step 4: Update transitions to `upload_day`**

In `completeFestivalSetup` (founder): change `setOnboardingStep('choose_library')` → `setOnboardingStep('upload_day')`. Also initialize `uploadDayIndex` to the first day:
```js
setUploadDayIndex(festivalDays[0]?.dayIndex || 1);
setDayUploadStatus('idle');
setSuccessfulUploadCount(0);
setSkippedDayIndices(new Set());
```

In `beginProfile` (member join flow):
1. After `setHomeSnapshot(homePayload)`, normalize `festival_days` casing:
```js
setFestivalDays((homePayload.festival_days || []).map((d) => ({ dayIndex: d.day_index, label: d.label })));
```
2. Change `setOnboardingStep('choose_library')` → `setOnboardingStep('upload_day')`
3. Initialize upload state:
```js
setUploadDayIndex((homePayload.festival_days || [{ day_index: 1 }])[0].day_index);
setDayUploadStatus('idle');
setSuccessfulUploadCount(0);
setSkippedDayIndices(new Set());
```

- [ ] **Step 5: Test on device**

Reload Expo Go. Run through the full flow:
- Founder: Create Group → festival_setup (1 day, add to 3) → upload_day for each day (skip one, upload one) → Finish
- Verify Finish blocked until at least 1 upload succeeds
- Verify inline artist list with Must See/Maybe toggles after upload

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/App.js apps/mobile/src/screens/SetupScreen.js
git commit -m "feat: per-day upload screen with inline review and preferences"
```

---

## Task 8: Cleanup — remove demo flow + input limits + error fix

**Files:**
- Modify: `apps/mobile/App.js`
- Modify: `apps/mobile/src/screens/SetupScreen.js`

- [ ] **Step 1: Remove `runSimulatorDemoFlow` from App.js**

Delete the entire `runSimulatorDemoFlow` function (approximately lines 746–907 in original, covering the demo flow that creates fake members). Also remove:
- Any reference to `runSimulatorDemoFlow` in the `SetupScreen` JSX props
- `DEFAULT_FESTIVAL_DAYS` references in the demo flow (already removed in Task 5)

- [ ] **Step 2: Add `maxLength` to name inputs in SetupScreen**

In `profile_create` and `profile_join` steps, update name and group name inputs:
```jsx
<TextInput value={displayName} onChangeText={setDisplayName} style={styles.input}
  placeholder="Your name" maxLength={60} />
<TextInput value={groupName} onChangeText={setGroupName} style={styles.input}
  placeholder="Group name" maxLength={100} />
```

- [ ] **Step 3: Fix silent error swallowing in saveAppState**

In `App.js`, update the `saveAppState` call to log failures:
```js
}).catch((err) => {
  console.warn('saveAppState failed:', err);
});
```

- [ ] **Step 4: Remove stale state variables**

Remove these state declarations from App.js (no longer used after removing old flow):
- `screenshotCount` / `setScreenshotCount`
- `uploadProgress` / `setUploadProgress`
- `uploadFailedCount` / `setUploadFailedCount`

Remove them from `saveAppState`/`loadAppState` as well.

- [ ] **Step 5: Run full test suite**

```bash
cd services/api && python -m pytest tests/ -v
```
Expected: All tests pass.

- [ ] **Step 6: Final device test + commit**

Test the full onboarding flow end-to-end on device. Then commit:

```bash
git add apps/mobile/App.js apps/mobile/src/screens/SetupScreen.js
git commit -m "cleanup: remove simulator demo flow, add input limits, fix saveAppState logging"
git push
```

---

## Task 9: Post-deploy verification + Google Vision cleanup

- [ ] **Step 1: Manual acceptance test — vision parser**

Before announcing to users, upload:
1. A list-view Coachella screenshot → verify ≥80% of visible artists appear in the inline review
2. A full grid screenshot → verify only highlighted artists appear (not the full schedule)

If either fails, check Render logs for `parse_schedule_from_image returned N sets`.

- [ ] **Step 2: Remove Google Vision env var from Render**

In Render dashboard → Environment → delete `GOOGLE_VISION_API_KEY`.

- [ ] **Step 3: Revoke Google Cloud Vision API key**

In Google Cloud Console → APIs & Services → Credentials → delete the key.

- [ ] **Step 4: Tag release**

```bash
git tag v0.2.0
git push origin v0.2.0
```
