# Upload Redesign: Per-Day Flow, Dynamic Days, Claude Vision

**Date:** 2026-03-29
**Status:** Approved for implementation

---

## Overview

Three interconnected changes that together replace the current single "Upload Your Schedule" screen with a guided per-day flow, remove hardcoded festival day assumptions, and replace the Google Cloud Vision + Claude text pipeline with a single Claude vision call.

**Resulting onboarding step sequences:**

Founder: `welcome → profile_create → festival_setup → upload_day (cycling) → done`

Member: `welcome → profile_join → upload_day (cycling) → done`

Members skip `festival_setup` entirely. After `profile_join` succeeds and `homeSnapshot` is fetched, they transition directly to `upload_day`. Their `festival_days` come from `homeSnapshot.festival_days`.

Founders' `festival_days` come from App.js state (the `festivalDays` array set during `festival_setup`). Founders do not re-fetch from `homeSnapshot` before `upload_day` begins.

The existing `choose_library`, `review`, and `confirm` steps are removed entirely.

---

## 1. Dynamic Festival Days

### Current state
`DEFAULT_FESTIVAL_DAYS` in `App.js` hardcodes Friday/Saturday/Sunday. There is no UI to add or remove days. All groups silently inherit 3 days even if the festival has a different structure.

### New behavior

**Setup screen (`festival_setup` step):**
- Starts with **1 blank day row** (not 3)
- Each row: text input for day label + "×" remove button
- Remove button is **disabled when only 1 row remains** (minimum enforced in UI)
- "＋ Add Day" button at the bottom appends a new blank row
- No upper limit on day count
- Continue button requires all labels to be non-empty (validated before API call)
- Placeholder text: Day 1 → `"e.g. Friday"`, Day 2 → `"e.g. Saturday"`, Day 3+ → `"e.g. Sunday"`
- `maxLength={20}` on each day label input

**`DEFAULT_FESTIVAL_DAYS` constant:** removed. Initial state is `[{ dayIndex: 1, label: '' }]`.

**Day index assignment:** sequential starting at 1, reassigned on add/remove to stay contiguous.

**Members skip `festival_setup` entirely** — they never call `POST /groups`. Their `festival_days` are fetched from the backend via `GET /members/me/home` after joining, which returns the group's stored `festival_days`. The per-day upload flow reads `festival_days` from the `homeSnapshot` that is already fetched during join.

---

## 2. Per-Day Upload Flow

### Current state
A single "Upload Your Schedule" screen uploads all days at once. A separate review screen follows. This causes a 30-second timeout on Render when uploading multiple images (~8s per image).

### New behavior

`choose_library`, `review`, and `confirm` steps are removed. Replaced by a `upload_day` step that cycles through each festival day using `uploadDayIndex`.

**New state (App.js):**
- `uploadDayIndex` (number): day index currently being uploaded; initialized to `festivalDays[0].dayIndex` when entering the upload flow
- `dayUploadStatus` (`'idle' | 'uploading' | 'done' | 'error'`): state for the current day
- `dayParsedSets` (array of `DayParsedSet`): inline review data for the current day, cleared on advance to next day; NOT persisted to AsyncStorage
- `skippedDayIndices` (array of numbers, serialized from a `Set`): persisted to AsyncStorage as a JSON array; restored as `new Set(stored)` on relaunch
- `successfulUploadCount` (number): count of days with at least one successful upload; persisted to AsyncStorage

**`DayParsedSet` shape** (populated from upload response + local preference state):
```
{
  canonical_set_id: string,
  artist_name: string,
  stage_name: string,
  start_time_pt: string,
  end_time_pt: string,
  day_index: number,
  preference: 'must_see' | 'flexible'   // local state, default 'flexible'
}
```

**Upload endpoint response** (`POST /members/me/personal/upload`) extended to return parsed sets inline:
```json
{
  "ok": true,
  "parse_job_id": "...",
  "parsed_count": 17,
  "failed_count": 0,
  "sets": [
    {
      "canonical_set_id": "...",
      "artist_name": "...",
      "stage_name": "...",
      "start_time_pt": "...",
      "end_time_pt": "...",
      "day_index": 1
    }
  ]
}
```
This avoids a separate GET call after upload. Sets from the response are displayed with `preference: 'flexible'` default locally — existing backend preferences from prior sessions are not fetched during the per-day upload flow (acceptable for onboarding; full preferences are available post-onboarding via `GET /members/me/personal/review`).

**`GET /members/me/personal/review` is retained** for post-onboarding use (e.g. `EditMyScheduleScreen`). It is not removed.

**Screen layout (same component reused for each day):**

```
[Skip this day →]                       (top-right link, always visible)

Upload [Day Label] schedule
Day X of Y

[Choose Screenshot]                     (primary button; hidden after successful upload)

── while uploading ──
[spinner] Processing...

── after successful upload ──
✓ 17 artists found

[Artist Name]   Stage · 4:00–5:00PM    [Must See] [Maybe]
...

[Next Day →]  or  [Finish →]            (Finish only on last day)
```

**Day label in header:** truncated to 15 characters with `…` if longer, to prevent overflow.

**Preference persistence:** each Must See / Maybe toggle fires `PATCH /members/me/sets/{canonical_set_id}` immediately (existing endpoint). Optimistic UI — toggle updates locally, reverts on error.

**Error state:** show error message + "Try Again" button. Skip remains available. On retry after error, the upload accumulates (union-upsert) — prior failed attempts left nothing in the DB, so no deduplication is needed.

**Navigation and completion rules:**
- "Skip this day" → add day to `skippedDayIndices`, advance to next day (or finish if last)
- "Next Day →" / "Finish →" → advance after successful upload; increment `successfulUploadCount`
- **Finish is enabled only if `successfulUploadCount >= 1`** (at least one day must have a successful upload; skipping all days is not sufficient)
- Finish is available on the last day in both `done` state (just uploaded) and `idle`/`error` state (if `successfulUploadCount >= 1` from a prior day). This means on relaunch, if a prior day was uploaded successfully, the user can skip the remaining day(s) and finish.
- If user attempts to finish with zero successful uploads, show inline message: "Upload at least one day's schedule to continue"
- On Finish: call `POST /members/me/setup/complete` — the existing backend guard (`at_least_one_set_required`) remains as a reliable server-side enforcement. If this call fails with `at_least_one_set_required` despite `successfulUploadCount >= 1` (e.g. due to app-kill state mismatch), show the error message to the user
- "Finish →" button is **disabled** while `dayUploadStatus === 'uploading'`

**Sending `day_label` in the upload request:** when the client calls `POST /members/me/personal/upload`, it must include `day_label` as a form field alongside the image file. The value is the label string for `uploadDayIndex` (e.g. `"Friday"`), looked up from the `festivalDays` array. Example multipart body: `{ images: [file], day_label: "Friday" }`.

**Interrupted flow / app restart:**
- `uploadDayIndex`, `successfulUploadCount`, and `skippedDayIndices` (serialized as array) are persisted to AsyncStorage
- On relaunch, the flow resumes at the saved `uploadDayIndex`; current day starts in `idle` state
- Previously uploaded days' sets are already in the backend (union upsert) — re-uploading a day accumulates

**Applies to both founders and members.**

---

## 3. Replace Google Cloud Vision with Claude Vision

### Current state
Two-step pipeline per image:
1. `vision_client.py` → Google Cloud Vision REST API → raw OCR text
2. `llm_parser.py` → Claude Haiku text prompt → structured artist list

Loses visual highlight information; two external API calls; dependency on Google Cloud Vision.

### New pipeline

Single Claude vision call per image. Handles both screenshot types:

**List-view screenshots** (personal curated list): all visible artists are the user's picks — parse all.

**Grid screenshots** (full schedule with highlights): extract only artists in visually highlighted/darkened/contrasting cells — ignore un-highlighted entries.

**Function signature:**
```python
def parse_schedule_from_image(
    image_bytes: bytes,
    day_label: str,          # label of the day being uploaded, e.g. "Friday"
    festival_days: list[dict] # full day list for festival context
) -> list[dict]:             # [{artist_name, stage_name, start_time, end_time, day_index}]
```

`day_label` tells Claude which day this image covers. If `day_label` is absent from the request (backward-compat), default to `festival_days[0].label` — do not return 400.

`festival_days` provides festival context to help Claude resolve day references and assign `day_index` correctly.

**Prompt strategy:** single user message with base64 image block + text instructing Claude to:
1. Detect whether the screenshot is a personal curated list or a full grid with highlights
2. For curated list: extract all artists
3. For full grid: extract only highlighted/selected artists
4. Return JSON array: `[{artist_name, stage_name, start_time, end_time, day_index}]`
5. Use `day_index` from `festival_days` matching `day_label`; default to `festival_days[0].day_index` if unresolvable

**Logging:** preserve the existing `INFO` log line: `"parse_schedule_from_image returned N sets from image M"` so parse quality can be monitored in Render logs.

**Acceptance criteria before deploying to users:** manually test with at least one list-view screenshot and one grid screenshot from the actual festival app. Both must return a non-empty set list. Compare returned artists against what is visually selected in the screenshot — expect ≥80% match.

**Implementation changes:**
- `vision_client.py` → **deleted**
- `llm_parser.py` → **replaced** by `parse_schedule_from_image`
- `personal.py` upload endpoint: accept optional `day_label: str = Form(None)` alongside images; pass to `parse_schedule_from_image`; return `sets` array in response body
- `config.py`: remove `google_vision_api_key` setting
- `pyproject.toml`: no changes

**Claude model:** `claude-haiku-4-5-20251001` — verify this model ID is available in your Anthropic account before deploying; fall back to `claude-haiku-3-5-20241022` if not.

**Cost:** ~$0.002/image — same as current pipeline.

**Cleanup after successful deployment:**
- Remove `GOOGLE_VISION_API_KEY` from Render environment variables
- Delete key in Google Cloud Console

---

## 4. Additional Backend Changes Required

### `POST /groups` — founder initial setup_status

`POST /groups` currently inserts the founder with `setup_status = 'complete'`. This must be changed to `setup_status = 'incomplete'` so that founders go through the upload flow before the backend considers them set up. The existing backend guard in `complete_setup` (`at_least_one_set_required`) then applies correctly to founders too.

### `POST /members/me/personal/upload` — `sets` response field

Build the `sets` array from `all_parsed` + `canonical_id_map` (both already in scope at response time). No additional DB query needed:

```python
sets = [
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
```

### `parse_schedule_from_image` — function contract

This function **replaces** both `extract_text_from_image` (Google Vision) and `parse_schedule_with_llm` (Claude text). It is a vision call — it takes raw image bytes, not text.

```python
def parse_schedule_from_image(
    image_bytes: bytes,      # compressed JPEG from validate_and_compress
    day_label: str,          # e.g. "Friday" — which day this image covers
    festival_days: list[dict] # [{"day_index": 1, "label": "Friday"}, ...]
) -> list[dict]:             # [{"artist_name", "stage_name", "start_time", "end_time", "day_index"}]
```

Call site in `personal.py` upload endpoint (replaces the existing two-call block per image):
```python
parsed = parse_schedule_from_image(compressed, day_label or festival_days[0]["label"], festival_days)
```

### `festival_days` casing normalization for members

`GET /members/me/home` returns `festival_days` as `[{"day_index": 1, "label": "Friday"}]` (snake_case). The mobile `festivalDays` state uses camelCase `[{ dayIndex: 1, label: "Friday" }]`. When a member joins and `homeSnapshot.festival_days` is stored into `festivalDays` state, normalize at the assignment site:

```js
setFestivalDays(homeSnapshot.festival_days.map(d => ({ dayIndex: d.day_index, label: d.label })));
```

### `saveAppState` / `loadAppState` new fields

The following new fields must be added to both `saveAppState` and `loadAppState` in `App.js`:
- `uploadDayIndex` (number)
- `successfulUploadCount` (number, default 0)
- `skippedDayIndices` (array of numbers, serialized from Set; default `[]`)

---

## 5. Prod-Readiness Fixes (same implementation pass)

| Fix | File | Change |
|-----|------|--------|
| Remove demo data generators from prod API | `personal.py`, `canonical.py` | Remove `build_demo_*` fallback; require real uploads |
| Backend rename | `config.py` | App name `coachella-api` → `festival-together`; DB file renamed |
| Input max lengths | `SetupScreen.js` | `maxLength={60}` on display name, `maxLength={100}` on group name |
| Remove simulator demo flow | `App.js` | Delete `runSimulatorDemoFlow` and all references (~160 lines) |

---

## 6. Out of Scope

- Async upload processing (one image per request is within 30s limit)
- Rate limiting on image uploads
- API client response shape validation
- Request tracing / logging in backend

---

## Files Affected

**Mobile:**
- `apps/mobile/App.js` — remove `DEFAULT_FESTIVAL_DAYS`, add new upload state vars, replace `choose_library`/`review`/`confirm` steps with `upload_day` cycling, remove `runSimulatorDemoFlow`
- `apps/mobile/src/screens/SetupScreen.js` — dynamic day rows in `festival_setup`, new per-day upload screen

**Backend:**
- `services/api/app/core/vision_client.py` — delete
- `services/api/app/core/llm_parser.py` — replace with `parse_schedule_from_image`
- `services/api/app/api/personal.py` — update upload endpoint (add `day_label` param, return `sets`, remove demo fallback)
- `services/api/app/api/canonical.py` — remove demo fallback
- `services/api/app/core/config.py` — remove `google_vision_api_key`, rename app
