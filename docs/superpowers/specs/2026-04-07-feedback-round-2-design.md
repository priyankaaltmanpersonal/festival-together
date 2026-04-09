# Feedback Round 2 — Design Spec

Date: 2026-04-07

## Problems Being Solved

1. Friday/Saturday/Sunday day chips look flat and run together on the group grid
2. Individual schedules screen has no day segmentation
3. Upload failure state: no "Choose New Image" option; manually-added artists disappear
4. Minimum-artist gate should be removed so users can proceed to the grid with zero artists

---

## 1. Shared `DaySelector` Component

### Problem

Three screens need a day-selector control — group grid, user's schedule, individual schedules — but today two different implementations exist (an inline segmented pill in `GroupScheduleScreen`, and a tab bar in `DayTabReview`). They look different from each other, and the group grid version is unstyled (flat chips, no visible borders).

### Design

Extract a new component `src/components/DaySelector.js` that all three navigation screens share. `DayTabReview` (used in onboarding/editing) is different in purpose and keeps its own tab bar.

**Props:**
```js
DaySelector({ days, selectedDay, onSelect })
// days: [{ dayIndex: number, label: string }]
// selectedDay: number
// onSelect: (dayIndex) => void
```

**Visual design — segmented pill:**
- Outer container: rounded rect with a visible border (`C.inputBorder`) and a tinted background (`C.inputBg`)
- Active segment: filled background (`C.cardBg`), colored bottom accent or solid contrasting fill, font weight 700, `C.text` color
- Inactive segment: transparent background, `C.textMuted` color, font weight 600
- A small gap between segments so they don't bleed together
- Consistent padding (`paddingVertical: 7`, `paddingHorizontal: 12`)

This replaces the current `segmentedControl` / `segmentedOption` / `segmentedOptionActive` styles in `GroupScheduleScreen`.

**Usage:**
- `GroupScheduleScreen`: replace inline segmented control with `<DaySelector>`
- `EditMyScheduleScreen`: replace the tab row at the top of `DayTabReview` when used from this screen — actually `EditMyScheduleScreen` passes through to `DayTabReview` which has its own tab bar; replace that tab bar with `DaySelector` inside `DayTabReview` (since `DayTabReview` is the only caller in the navigation context)
- `IndividualSchedulesScreen`: use `DaySelector` for new day filtering (see §2)

**Note on `DayTabReview`:** The setup/review usage (`review_days` onboarding step) also renders `DayTabReview`, but the tab bar there carries badges (set counts, error marks, upload spinners) that `DaySelector` won't support. So `DayTabReview` keeps its own tab bar; only the `EditMyScheduleScreen` usage is affected if we update `DayTabReview`'s tab bar to use `DaySelector`.

Simpler approach: leave `DayTabReview`'s internal tab bar unchanged (it serves onboarding), and only use `DaySelector` in `GroupScheduleScreen` and `IndividualSchedulesScreen` directly. `EditMyScheduleScreen` renders `DayTabReview` which has its own tabs — update those styles to match `DaySelector` visually (same padding, same active/inactive treatment) without extracting the component. This keeps `DayTabReview`'s badge logic intact while making all three screens look the same.

**Chosen approach:** `DaySelector` component for `GroupScheduleScreen` and `IndividualSchedulesScreen`. Update `DayTabReview` tab styles to match visually.

---

## 2. Individual Schedules — Day Segmentation

### Problem

`IndividualSchedulesScreen` renders each member's sets as a flat list with no day grouping. All days are mixed together.

### Design

Add a `DaySelector` at the top of the screen (above the member cards). When a day is selected, filter each member's displayed sets to only show sets for that day.

- Default to the first day that has any sets across any member
- If a member has no sets for the selected day, show "No sets on [Day]" placeholder instead of their sets
- The selector only shows days that exist in `festivalDays` (same data passed in from App.js)

**Data flow:** `IndividualSchedulesScreen` already receives `individualSnapshot` which contains `members[].sets[]` each with `day_index`. Add local `selectedDay` state, filter each member's `sets` by `day_index === selectedDay` before rendering.

**No new props needed** beyond adding `festivalDays` to `IndividualSchedulesScreen`'s props (currently not passed — App.js will need to add `festivalDays={festivalDays}` to the `IndividualSchedulesScreen` render call).

---

## 3. Upload Failure — "Choose New Image" + Add Manually Fix

### 3a. "Choose New Image" button

**Problem:** When a day upload fails in `DayTabReview`, the only options are "Retry Upload" (retries the same image) and "+ Add Manually". There is no way to pick a different image.

**Design:** In `DayTabReview`'s failed state, add a "Choose New Image" button that calls `onReUpload(activeDay)`. This prop already exists in `DayTabReview`'s signature but was never wired up from `SetupScreen`. 

Changes:
- `App.js`: Add a new `rePickAndUploadDay(dayIndex)` function that picks a fresh image and re-uploads without calling `advancePickDay`. (`chooseAndUploadDayScreenshot` can't be reused here because it calls `advancePickDay`, which would push the user out of `review_days` back to `upload_all_days`.) `rePickAndUploadDay` is identical to `chooseAndUploadDayScreenshot` minus the `advancePickDay` call — it just resets the day state to `uploading`, picks images, and fires the upload.
- `SetupScreen.js`: Accept new prop `onChooseNewImage` and pass it to `DayTabReview` as `onReUpload`.
- `DayTabReview`: render the "Choose New Image" button in the failed state block, between Retry and Add Manually.

Button order in failed state: **Retry Upload** (same image) → **Choose New Image** (pick fresh) → **+ Add Manually**

### 3b. Manually-added artists disappear on failed day

**Problem:** `addDaySet` in App.js saves to the API and updates `dayStates[dayIndex].sets`, but leaves `status: 'failed'`. `DayTabReview`'s failed branch renders only the error text + action buttons — it never renders the sets list or the Confirm button. The artist was saved but is invisible.

**Fix:** In `addDaySet` (App.js), after successfully inserting the new set, also set `status: 'done'` if the day was previously `'failed'`:

```js
setDayStates((prev) => {
  const prevDay = prev[dayIndex] || {};
  return {
    ...prev,
    [dayIndex]: {
      ...prevDay,
      status: prevDay.status === 'failed' ? 'done' : prevDay.status,
      sets: [...(prevDay.sets || []), newSet],
    },
  };
});
```

This transitions the day out of failed state, making the sets list and Confirm button visible. The "failed" error text disappears, which is correct — the day now has sets.

---

## 4. Drop Minimum Artist Constraint

### Problem

`POST /v1/members/me/setup/complete` requires `member_set_preferences` count ≥ 1, blocking users with no artists from reaching the group grid. A zero-artist user still benefits from seeing the group view.

### Changes

**Server (`services/api/app/api/personal.py`):** Remove the `pref_count` check (lines 295–300):
```python
# Remove this block:
pref_count = conn.execute(
    "SELECT COUNT(*) AS cnt FROM member_set_preferences WHERE member_id = ?",
    (session["member_id"],),
).fetchone()
if pref_count is None or pref_count["cnt"] < 1:
    raise HTTPException(status_code=400, detail="at_least_one_set_required")
```

**Client (`apps/mobile/App.js`):** Remove `at_least_one_set_required` from the `friendlyError` map (line 39).

No other changes — `finishUploadFlow` on the client already handles the happy path without any artist-count check.

---

## Affected Files

| File | Change |
|------|--------|
| `apps/mobile/src/components/DaySelector.js` | New component |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Use `DaySelector`, remove inline segmented styles |
| `apps/mobile/src/screens/IndividualSchedulesScreen.js` | Add `DaySelector` + day filtering, add `festivalDays` prop |
| `apps/mobile/src/components/DayTabReview.js` | Update tab bar styles to match `DaySelector`; add "Choose New Image" button in failed state |
| `apps/mobile/App.js` | Add `rePickAndUploadDay`; pass `onChooseNewImage` to `SetupScreen`; fix `addDaySet` status transition; remove `at_least_one_set_required`; pass `festivalDays` to `IndividualSchedulesScreen` |
| `apps/mobile/src/screens/SetupScreen.js` | Accept + pass `onChooseNewImage` prop to `DayTabReview` |
| `services/api/app/api/personal.py` | Remove minimum-artist check from `complete_setup` |
