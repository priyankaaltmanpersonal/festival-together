# Feedback Round 3 Design Spec

Date: 2026-04-08

## Overview

Seven fixes from the second TestFlight round. Items 1–3 are UI polish on `FounderToolsScreen`. Items 4–7 address upload reliability, deduplication correctness, time-parsing accuracy, and a founder escape hatch for bad imports.

---

## 1. Add Top Padding to Founder Tools Screen

**Problem:** Content renders flush against the gradient header bar with no breathing room.

**Fix:** Add `paddingTop: 12` to the `wrap` contentContainerStyle in `FounderToolsScreen.js`. The other screens use a similar gap — this was just missed.

---

## 2. Remove "Back to Group Schedule" Card

**Problem:** The "Back to Group View / Open Group Schedule" card is redundant — the bottom-left tab in `BottomTabBar` already navigates there.

**Fix:** Delete the entire third card (`<View style={styles.card}>` containing "Back to Group View") from `FounderToolsScreen`. No prop or navigation changes needed since `onOpenSchedule` is still called by the tab bar.

---

## 3. Copy Invite Code in Founder Controls Card

**Problem:** The invite code shown in the Founder Controls card is plain text only. MoreSheet and GroupScheduleScreen both have tap-to-copy with a "📋 Copy / ✓ Copied!" indicator.

**Fix:**
- Add `onCopyInvite` and `inviteCopied` props to `FounderToolsScreen`.
- Replace the plain `<Text>Invite code: {inviteCode}</Text>` with a `<Pressable>` row showing the code + copy icon, matching the pattern already in `MoreSheet`.
- App.js already wires `copyInviteCode` and `inviteCopied` state — just pass them through to `FounderToolsScreen`.
- Update `FounderToolsScreen.test.js` to cover the copy interaction.

---

## 4. Upload Warning Text + Backend Parallelization

### Warning text

Both upload paths need "please don't leave the app" since backgrounding the app can stall the JS fetch callback.

- **Official lineup** (`FounderToolsScreen`): Change loading text from  
  `"Parsing lineup… this may take 15–30 seconds."`  
  to  
  `"Parsing lineup… this may take 1–2 minutes. Please keep the app open."`

- **Individual schedule** (`SetupScreen` + `DayTabReview`): Change hint text from  
  `"This usually takes 5–10 seconds. Hang tight!"`  
  to  
  `"This usually takes 15–30 seconds. Please keep the app open!"`  
  (The 5–10s estimate was optimistic; real times are closer to 15–30s.)

### Backend parallelization

The `import_official_lineup` endpoint currently calls `parse_official_lineup_from_image` sequentially for each of the 3 day images. With 3 images at ~40s each, total latency is ~2 minutes.

Fix: run the per-image parse calls concurrently using `asyncio.gather` with a thread executor (the Anthropic client is synchronous):

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=3)

async def _parse_one(image_bytes, festival_days):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        executor,
        parse_official_lineup_from_image,
        image_bytes,
        festival_days,
    )

results = await asyncio.gather(*[_parse_one(img, festival_days) for img in compressed_images])
```

Expected improvement: 3 sequential ~40s calls → ~40s total (3× speedup). The model and prompt stay unchanged.

Note: image validation (`validate_and_compress`) remains sequential before the gather since it's cheap and CPU-bound.

---

## 5. Individual Upload Deduplication

**Question:** When a user uploads a Coachella app screenshot (e.g., to add Heineken House sets), does the backend correctly deduplicate artists already in the official lineup?

**Answer:** Yes — the existing code in `upload_personal_images` (personal.py lines 411–452) looks up each parsed artist by `(artist_name, stage_name, start_time_pt, day_index)`. If a canonical_set already exists (from the official import), it reuses its ID and only creates a new `member_set_preference` pointing to it. No duplicate canonical_set is created.

The LLM is given canonical hints for the day (official lineup's artist/stage/time data), and told to "Prefer matching a known set name over re-reading small text" — this ensures the model returns the exact stage name and time from the official data, making the dedup lookup accurate.

**What's missing:** Test coverage for this scenario.

**New test** (`test_personal_upload.py` or added to existing `test_personal.py`):
- Seed a group with an official canonical_set (e.g., artist="Test Artist", stage="Sahara", start_time="21:00", day_index=1, source='official')
- Mock `parse_schedule_from_image` to return `[{artist_name: "Test Artist", stage_name: "Sahara", start_time: "21:00", day_index: 1}]`
- Call `POST /members/me/personal/upload`
- Assert: canonical_sets count for the group is still 1 (no duplicate created)
- Assert: a `member_set_preference` was created pointing to the original official canonical_set ID

---

## 6. Fix Official Lineup Time Parsing (AM/PM)

**Problem:** The model outputs times like 5:30 AM for sets that should be 5:30 PM. The official Coachella lineup graphic shows times in 12-hour format without explicit AM/PM labels, and the model defaults to AM when ambiguous.

**Root cause:** The current prompt only says "Times from 12:00AM–5:59AM use '24:MM'–'29:MM'" but gives no domain context about when Coachella actually operates.

**Fix:** Add Coachella-specific time context to `_OFFICIAL_LINEUP_PROMPT`:

```
Time reading rules for Coachella:
- The festival runs approximately 12:30 PM to 1:00 AM each day
- The grid layout: early afternoon (1 PM) is near the bottom, late night (1 AM) is near the top
- A time label "1:00" near the bottom of a stage column means 13:00 (1:00 PM), NOT 1:00 AM
- A time label "1:00" near the top of a stage column means 25:00 (1:00 AM next day)
- Times between roughly 12:30 and 11:59 are always PM (output as 12:30–23:59)
- Times between 12:00 AM and 1:30 AM are the late-night end-of-day slots (output as 24:00–25:30)
- When in doubt, prefer PM over AM — nearly all sets start in the PM window
```

This gives the model the positional and domain context it needs to correctly interpret unlabeled times.

---

## 7. Delete All Official Lineup Sets

**Use case:** After importing, the founder sees that time parsing failed badly and wants to clear the slate and re-import.

### Backend

New endpoint: `DELETE /groups/{group_id}/lineup`

- Founder-only (403 if not founder or wrong group)
- Deletes all `canonical_sets` WHERE `group_id = ? AND source = 'official'`
- Also deletes `member_set_preferences` for those set IDs (orphaned preferences are meaningless)
- Returns `{"ok": True, "sets_deleted": N}`

```python
@router.delete("/groups/{group_id}/lineup")
def delete_official_lineup(group_id: str, session=Depends(require_session)) -> dict:
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")
    with get_conn() as conn:
        official_ids = [
            row["id"] for row in conn.execute(
                "SELECT id FROM canonical_sets WHERE group_id = ? AND source = 'official'",
                (group_id,),
            ).fetchall()
        ]
        if official_ids:
            placeholders = ",".join("?" * len(official_ids))
            conn.execute(
                f"DELETE FROM member_set_preferences WHERE canonical_set_id IN ({placeholders})",
                official_ids,
            )
            conn.execute(
                "DELETE FROM canonical_sets WHERE group_id = ? AND source = 'official'",
                (group_id,),
            )
    return {"ok": True, "sets_deleted": len(official_ids)}
```

### Frontend

- Add `onDeleteLineup` prop to `FounderToolsScreen`
- Show "Delete All Imported Sets" button (destructive style) only when `lineupImportState === 'done'`
- On press: show `Alert.alert` confirmation ("This will delete all X imported sets and everyone's selections of them. Are you sure?")
- On confirm: call `onDeleteLineup`, which calls the API and resets `lineupImportState` to `'idle'` and `lineupImportResult` to `null`
- App.js wires the new API call and state reset

### Tests

- Backend: test 200 success, 403 for non-founder, verify preferences are also deleted
- Frontend: test the button renders when done, shows confirmation, calls `onDeleteLineup` on confirm

---

---

## 8. Display Set Times in 12-Hour Format

**Problem:** The group schedule grid cards and individual schedule list render the raw `start_time_pt`/`end_time_pt` strings directly (e.g. `"21:30"`). US users expect 12-hour format ("9:30 PM").

**What already works:** The time axis ticks in the grid use `formatTime(totalMinutes)` which already outputs 12-hour format. `EditableSetCard` also already converts strings via `timeStringToDate` + `formatDisplayTime`. Only the raw string render sites need fixing.

**Affected sites:**
- `GroupScheduleScreen.js` line 224: grid card time range display
- `GroupScheduleScreen.js` line 271: expanded set modal subtitle
- `IndividualSchedulesScreen.js` line 52: individual schedule set row

**Fix:** Add a `formatTimeStr(timeStr)` utility function to `src/utils.js` that converts `"HH:MM"` or extended `"25:MM"` strings to 12-hour format:
- `"21:30"` → `"9:30 PM"`
- `"00:30"` → `"12:30 AM"`
- `"25:00"` (1 AM next day) → `"1:00 AM"`
- `"12:00"` → `"12:00 PM"`
- `"13:00"` → `"1:00 PM"`

Implementation: parse `HH:MM`, if `H >= 24` subtract 24 and treat as AM; otherwise apply standard 12-hour conversion. Returns `"?"` for null/invalid input so the UI never crashes on missing data.

Replace the three raw string render sites with `formatTimeStr(start_time_pt)` / `formatTimeStr(end_time_pt)`.

Add `formatTimeStr` unit tests in `utils.test.js` covering: PM, noon, midnight, 1 AM (extended format), and null input.

---

## Files Changed

### Frontend
- `apps/mobile/src/screens/FounderToolsScreen.js` — padding, remove back card, copy invite, loading text, delete button
- `apps/mobile/App.js` — pass `onCopyInvite`/`inviteCopied` to FounderToolsScreen, wire `onDeleteLineup`
- `apps/mobile/src/components/DayTabReview.js` — update loading hint text
- `apps/mobile/src/screens/SetupScreen.js` — update loading hint text
- `apps/mobile/src/__tests__/FounderToolsScreen.test.js` — copy interaction, delete button tests
- `apps/mobile/src/utils.js` — add `formatTimeStr` string-to-12h utility
- `apps/mobile/src/__tests__/utils.test.js` — add `formatTimeStr` unit tests

### Backend
- `services/api/app/api/groups.py` — `import_official_lineup` parallelization, new `delete_official_lineup` endpoint
- `services/api/app/core/llm_parser.py` — update `_OFFICIAL_LINEUP_PROMPT` with time context
- `services/api/tests/test_groups.py` (or new `test_lineup.py`) — delete endpoint tests
- `services/api/tests/test_personal.py` — dedup test
