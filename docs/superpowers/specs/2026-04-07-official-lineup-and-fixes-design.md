# Official Lineup Import + UX Fixes — Design Spec

Date: 2026-04-07

---

## Problems Being Solved

### Simple Fixes

1. No visual confirmation indicator on day tabs after a day is confirmed
2. After confirming all days, user must still manually press the "›" button to continue
3. Grid starts at the earliest set with no breathing room; first set card jams against stage headers
4. Stage column header height is not fixed, causing vertical misalignment with the "Time" panel
5. "Time" label in top-left of grid is redundant
6. Stage columns appear in alphabetical order rather than canonical Coachella stage order
7. Stage order in "Add Artist" form dropdown doesn't match canonical order; wrong Do Lab spelling; missing Yuma
8. Deleting an artist from personal schedule doesn't immediately update the group grid (optimistic update checks wrong field name)
9. Opening Individual Schedules has a 2–3 second lag before navigating

### Big Feature

10. No way for the group creator to seed the app with the full official Coachella lineup
11. Individual members must upload a personal screenshot to get any schedule — no browse-and-tap alternative
12. Personal screenshot parsing has no knowledge of the official lineup to cross-reference against
13. No way to hide sets that no one in the group is attending

---

## Simple Fixes

### 1. Green Checkmark on Confirmed Day Tab

**File:** `apps/mobile/src/components/DayTabReview.js`

In the tab bar, the badge logic currently shows: a count badge when `status === 'done'`, an `!` when `status === 'failed'`, a spinner when `status === 'uploading'`. When `state.confirmed === true`, replace the count badge with a `✓` mark styled in `C.success`. This makes it immediately visible which days are fully locked in.

```js
state.confirmed ? (
  <Text style={styles.tabConfirmedMark}>✓</Text>
) : state.status === 'done' && (state.sets || []).length > 0 ? (
  <View style={styles.badge}>...</View>
) : ...
```

Add `tabConfirmedMark` style: `{ color: C.success, fontWeight: '800', fontSize: 13 }`.

**Test:** `DayTabReview.test.js` — add case: when `confirmed: true`, tab shows `✓` not a count badge.

---

### 2. Auto-Advance When All Days Confirmed

**File:** `apps/mobile/App.js`

`confirmDay(dayIndex)` sets `confirmed: true` in `dayStates`. Add a `useEffect` that watches `allDaysReady` (already computed as a memo) and calls `finishUploadFlow()` when it becomes `true`. Guard with a ref to prevent double-firing:

```js
const autoAdvancedRef = useRef(false);
useEffect(() => {
  if (allDaysReady && !autoAdvancedRef.current) {
    autoAdvancedRef.current = true;
    finishUploadFlow();
  }
}, [allDaysReady]);
```

Reset `autoAdvancedRef.current = false` whenever `onboardingStep` leaves `'review_days'`.

No test needed — this is a side-effect trigger on existing computed state.

---

### 3. Grid: 30-Minute Buffer Before Earliest Set

**File:** `apps/mobile/src/utils.js` — `buildTimeline()`

After computing `startMinute = Math.floor(minStart / SLOT_MINUTES) * SLOT_MINUTES`, subtract one additional `SLOT_MINUTES`:

```js
const startMinute = Math.floor(minStart / SLOT_MINUTES) * SLOT_MINUTES - SLOT_MINUTES;
```

This ensures the grid always opens with a half-hour of empty space above the first set, preventing it from jamming against the stage headers.

**Test:** `utils.test.js` — add case: `buildTimeline` with earliest set at 17:30 → `startMinute` is 17:00 (not 17:30).

---

### 4. Grid Header Height Alignment + Remove "Time" Label

**File:** `apps/mobile/src/screens/GroupScheduleScreen.js`

**Alignment fix:** `gridHeader` currently has no explicit height — it sizes to content. If the rendered height differs from `GRID_HEADER_HEIGHT` (33px), the two vertical scroll areas (time panel left, stages right) start at different y-offsets, misaligning time labels with row grid lines. Fix by adding `height: GRID_HEADER_HEIGHT` and `alignItems: 'center'` to `gridHeader`:

```js
gridHeader: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  borderColor: C.gridBorder,
  height: GRID_HEADER_HEIGHT,
  alignItems: 'center',
},
```

**Remove "Time" label:** The `timePanelHeader` renders `<Text style={styles.headerText}>Time</Text>`. Remove this Text element — the time labels below make the column's purpose obvious. The `timePanelHeader` becomes an empty styled box, maintaining the border and background that keeps it visually aligned with the stage header row.

No test needed — these are pure layout changes.

---

### 5. Canonical Stage Column Order

**File:** `services/api/app/api/schedule.py`

Replace the alphabetical sort with a ranked sort using the canonical Coachella stage order:

```python
_STAGE_ORDER = [
    'Coachella Stage', 'Outdoor Theatre', 'Sonora', 'Gobi',
    'Mojave', 'Sahara', 'Yuma', 'Quasar', 'Do Lab',
]

def _stage_sort_key(name: str) -> tuple[int, str]:
    try:
        return (_STAGE_ORDER.index(name), '')
    except ValueError:
        return (len(_STAGE_ORDER), name)

stages = sorted(
    {item["stage_name"] for item in schedule_sets if item["stage_name"]},
    key=_stage_sort_key,
)
```

Any stage not in the list sorts alphabetically after the canonical ones.

---

### 6. Stage Order in "Add Artist" Form

**File:** `apps/mobile/src/components/DayTabReview.js`

Update `STAGE_OPTIONS` to match the canonical order, correct spelling, and add Yuma:

```js
const STAGE_OPTIONS = [
  'Coachella Stage', 'Outdoor Theatre', 'Sonora', 'Gobi',
  'Mojave', 'Sahara', 'Yuma', 'Quasar', 'Do Lab',
];
```

Note: The "Add Artist" form's long-term role should be revisited after the official lineup import ships — see follow-up note in memory.

---

### 7. Delete Optimistic Update Bug Fix

**File:** `apps/mobile/App.js` — `deletePersonalSet()`

The optimistic update on `scheduleSnapshot` checks `setItem.canonical_set_id !== canonicalSetId`. But `scheduleSnapshot.sets` (from the group schedule API) uses `id`, not `canonical_set_id`. The condition never matches, so the member is never removed from the set's attendees in local state.

Fix:
```js
// Before:
if (setItem.canonical_set_id !== canonicalSetId) return setItem;
// After:
if (setItem.id !== canonicalSetId) return setItem;
```

**Test:** `GroupScheduleScreen.test.js` (or a unit test for the transform) — regression test: after calling the optimistic update with a matching `canonicalSetId`, the member is removed from `attendees` on that set.

---

### 8. Individual Schedules Lag Fix

**File:** `apps/mobile/App.js` — `loadIndividual()`

Currently: navigates to `'individual'` view only after `await apiRequest(...)` completes (2–3 second wait).

Fix: navigate immediately, fetch in background. If `individualSnapshot` is already cached, the screen shows it instantly while fresh data loads.

```js
const loadIndividual = () => {
  setActiveView('individual');
  setMoreSheetOpen(false);
  run('load individual schedules', async () => {
    if (!memberSession || !groupId) throw new Error('Need group and member session first');
    if (!isOnline) {
      if (individualSnapshot) {
        appendLog('OFFLINE: using cached individual schedules');
        return;
      }
      throw new Error('No cached individual schedules available offline');
    }
    const payload = await apiRequest({
      baseUrl: apiUrl,
      path: `/v1/groups/${groupId}/individual-schedules`,
      method: 'GET',
      sessionToken: memberSession,
    });
    setIndividualSnapshot(payload);
    setLastSyncAt(new Date().toISOString());
  });
};
```

No test needed — this is a sequencing change to an async side-effect.

---

## Big Feature: Official Lineup Import

### Overview

The group founder uploads all 3 official Coachella day graphics (Friday, Saturday, Sunday) in one action. The server parses each image using a specialized full-grid Claude Vision prompt, extracting every artist at every stage and seeding `canonical_sets` for the group. Individual members can then either upload their personal screenshot as before (now smarter, cross-referenced against canonical sets) or skip screenshots entirely and browse the full group grid to add artists. A new grid toggle hides sets no one in the group is attending.

---

### 9. Data Model: `source` Column on `canonical_sets`

**File:** `services/api/app/core/db.py`

Add `source TEXT NOT NULL DEFAULT 'member'` to `canonical_sets`. Apply via `ALTER TABLE` on startup for both SQLite and Postgres:

```python
_MIGRATIONS = [
    "ALTER TABLE canonical_sets ADD COLUMN source TEXT NOT NULL DEFAULT 'member'",
]
```

Run migrations after `init_db()`, catching errors for columns that already exist (idempotent).

Values:
- `'official'` — seeded from the founder's official lineup import
- `'member'` — created from individual member screenshot parsing or manual entry

The `source` field is included in the group schedule API response so the client can distinguish official sets from member-created ones (used for the hide toggle and browse flow).

---

### 10. Server: Official Lineup Import Endpoint

**File:** `services/api/app/api/groups.py` (or a new `lineup.py` router)

`POST /v1/groups/{group_id}/lineup/import`

- Auth: requires `session["member_id"] == group.founder_member_id`
- Body: multipart form with up to 3 image files (`image_0`, `image_1`, `image_2`)
- For each image:
  1. Validate and compress via existing `validate_and_compress`
  2. Call `parse_official_lineup_from_image(image_bytes, festival_days)` (new function in `llm_parser.py`)
  3. For each extracted set, check for an existing `canonical_set` with matching `artist_name` (case-insensitive, stripped) + `stage_name` + `day_index` in this group. If found, skip. If not found, insert with `source = 'official'`, `source_confidence = 1.0`, `status = 'confirmed'`.
- Returns `{ sets_created: int, days_processed: [str] }`

**New function: `parse_official_lineup_from_image()`** in `llm_parser.py`

Uses a new `_OFFICIAL_LINEUP_PROMPT` that differs from `_VISION_PROMPT` in two ways:
1. Instructs the model to extract **all** artists (not just highlighted/selected ones)
2. Tells the model to read the day from the image text (e.g., "WEEKEND 1 FRIDAY" → `day_index` 1) using the provided `festival_days` list

```python
_OFFICIAL_LINEUP_PROMPT = """\
You are extracting the complete festival schedule from an official festival lineup graphic.

This image shows a full grid of ALL performers across all stages for one day.
Extract every performer shown — do not filter by highlighting or selection.

Read the day name from the image (e.g. "FRIDAY", "SATURDAY", "SUNDAY") and match it
to the festival_days list provided to determine day_index.

Festival days: {festival_days_json}

For each performer, extract:
- artist_name: performer name (string)
- stage_name: stage column header (string)
- start_time: 24-hour "HH:MM". Times from 12:00AM–5:59AM use "24:MM"–"29:MM" format.
- end_time: same format, or null if not shown
- day_index: integer from the festival_days list matching the day shown in the image

Rules:
- Extract ALL performers shown, not just some
- If a time range is shown (e.g. "9:05–10:35"), use 9:05 as start and 10:35 as end
- Ignore decorative elements, logos, and footer text
- Return ONLY a valid JSON array, no markdown fences, no explanation
"""
```

---

### 11. Server: Smarter Personal Screenshot Parsing

**File:** `services/api/app/api/personal.py` — wherever `parse_schedule_from_image` is called for member uploads

When processing a member's screenshot for a given `day_index`, fetch all `canonical_sets` with `source = 'official'` for that group and day. If any exist, inject them into the `_VISION_PROMPT` as an additional section:

```
Known official sets for this day (use these as reference):
- Artist Name | Stage | HH:MM–HH:MM
...
Cross-reference these against what's visually selected in the screenshot.
Prefer matching a known set over re-reading small text.
```

The parser output format is unchanged. Post-extraction, the matching logic in `personal.py` already deduplicates by `artist_name` + `stage_name` + `day_index` — official sets will be matched rather than duplicated.

---

### 12. Mobile: Founder Tools — Upload Official Lineup

**File:** `apps/mobile/src/screens/FounderToolsScreen.js`

Add an "Official Lineup" section. UI states:

- **Idle:** "Upload Official Lineup" button + hint text "Upload the 3 official day graphics to seed the full schedule for your group."
- **Picking:** Opens `expo-image-picker` with `allowsMultipleSelection: true`, `mediaTypes: 'Images'`, `selectionLimit: 3`.
- **Uploading:** Spinner + "Parsing lineup… this may take 15–30 seconds."
- **Done:** "✓ N sets imported across X days" in success style. Button changes to "Re-upload to add missing sets."
- **Error:** Error text + retry button.

`App.js` gets a new `importOfficialLineup(imageAssets)` function:
1. Constructs multipart form from selected image assets
2. Posts to `/v1/groups/{group_id}/lineup/import`
3. On success, refreshes `scheduleSnapshot` (calls `loadSchedule()`) so the grid immediately shows all sets
4. Sets `homeSnapshot.has_official_lineup = true` locally

---

### 13. Server: `has_official_lineup` on Home Snapshot

**File:** `services/api/app/api/groups.py` — home endpoint

Add `has_official_lineup: bool` to the home response:

```python
has_official_lineup = conn.execute(
    "SELECT 1 FROM canonical_sets WHERE group_id = ? AND source = 'official' LIMIT 1",
    (group_id,),
).fetchone() is not None
```

Include in response: `"has_official_lineup": has_official_lineup`.

---

### 14. Mobile: Individual Onboarding — "Browse Full Lineup" Path

**Files:** `apps/mobile/App.js`, `apps/mobile/src/screens/SetupScreen.js`

When `homeSnapshot.has_official_lineup === true`, `SetupScreen` shows a secondary option below the screenshot upload button on the `upload_all_days` step:

```
── or ──
[Browse Full Lineup →]
"Skip photos — add artists directly from the full schedule"
```

Tapping this calls `finishUploadFlow()` (the minimum-artist constraint is removed per the previous spec; no uploads will be in progress so the in-progress guard passes). The member's `setup_status` becomes `'complete'` and `activeView` navigates to `'group'`. From the group grid, they use the existing "Add to My Schedule" modal to add sets to their personal schedule — no new grid UI needed.

`SetupScreen` receives `hasOfficialLineup: bool` prop from `App.js`.

---

### 15. Mobile: Grid — "Hide Unattended Sets" Toggle

**File:** `apps/mobile/src/screens/GroupScheduleScreen.js`

Add local state `hideUnattended` (default `false`). Apply as an additional filter on `filteredSets`:

```js
const visibleSets = hideUnattended
  ? filteredSets.filter((s) => s.attendee_count > 0)
  : filteredSets;
```

Use `visibleSets` everywhere `filteredSets` was used for rendering set cards and building `stageColumns`.

Show the toggle only when `scheduleSnapshot` contains any set with `attendee_count === 0` (i.e., official lineup has been seeded and there are unattended sets worth hiding). Render as a small pill button in the filter bar:

```
[Group only]  (filled when active, outlined when inactive)
```

Place it on the same row as the day selector, right-aligned.

**Test:** `GroupScheduleScreen.test.js` — toggle on hides sets with `attendee_count === 0`; toggle off shows all sets.

---

## Affected Files

| File | Change |
|------|--------|
| `apps/mobile/src/components/DayTabReview.js` | Confirmed ✓ tab mark; canonical `STAGE_OPTIONS` |
| `apps/mobile/App.js` | Auto-advance effect; delete bug fix (`id` not `canonical_set_id`); instant Individual nav; `importOfficialLineup`; `hasOfficialLineup` prop; `finishUploadFlow` skip path |
| `apps/mobile/src/utils.js` | 30-min buffer in `buildTimeline` |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Header alignment fix; remove "Time" label; stage order (via API); hide-unattended toggle |
| `apps/mobile/src/screens/SetupScreen.js` | Accept `hasOfficialLineup` prop; render "Browse Full Lineup" button |
| `apps/mobile/src/screens/FounderToolsScreen.js` | Upload Official Lineup section |
| `services/api/app/core/db.py` | `source` column migration on `canonical_sets` |
| `services/api/app/core/llm_parser.py` | `_OFFICIAL_LINEUP_PROMPT` + `parse_official_lineup_from_image()` |
| `services/api/app/api/groups.py` | `POST /lineup/import` endpoint; `has_official_lineup` in home response |
| `services/api/app/api/personal.py` | Inject canonical sets into member screenshot parse prompt |
| `services/api/app/api/schedule.py` | Canonical stage sort order; include `source` field in set response |
