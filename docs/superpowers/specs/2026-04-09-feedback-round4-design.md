# Feedback Round 4 Design Spec
Date: 2026-04-09

## Overview
Five changes spanning a bug fix, new interaction pattern, navigation improvement, visual polish, and API enhancement.

---

## 1. Double-Tap to Cycle Attendance on Grid Cards

### Problem
The yellow ✓ overlay icon (14×14px) for upgrading maybe→definitely is too small and undiscoverable. Users don't know it's tappable.

### Solution
Replace the overlay icon buttons (+ and ✓) with double-tap gesture detection on the entire card. Single tap continues to open the expand modal.

### Interaction Model
- **Single tap**: opens expand modal (with 250ms debounce to allow double-tap detection)
- **Double tap** (two taps within 250ms): cycles attendance state, cancels the pending expand

### State Cycle
| Current State | After Double-Tap | Implementation |
|---|---|---|
| Not attending | Maybe | `onAddToMySchedule(setItem)` |
| Maybe | Definitely | `onSetPreferenceFromGrid(setItem.id, 'must_see')` |
| Definitely | Not attending | `onRemoveFromGrid(setItem.id)` |

### Implementation Details
- `GroupScheduleScreen`: add `onRemoveFromGrid` prop (maps to `deletePersonalSet` in App.js)
- Add `lastTapRef = useRef(new Map())` tracking `{ time, timeout }` per set ID
- On press: check if last tap was within 250ms → double-tap (clear timeout, cycle preference) or single-tap (schedule expand after 250ms)
- Remove existing `quickActionBtn`, `quickAddBtn`, `quickMaybeBtn` styles and `handleQuickAdd`/`handleQuickUpgrade` handlers and `pendingSetId` state
- The `pendingSetId` state was solely used by quick-action buttons — remove it

### One-Time Hint Banner
- Shown below the filter bar, above the grid
- Text: "Double-tap any set to change your attendance"
- Auto-dismisses after 4 seconds
- Stored in AsyncStorage key `hint_grid_doubletap_seen` — only shown once ever, checked on mount
- Styled as a small amber/warm pill

### Props Added to GroupScheduleScreen
```js
onRemoveFromGrid: (canonicalSetId) => Promise<void>
onNavigateToEditSet: (dayIndex: number) => void   // also used by item 3
```

### App.js Changes
- Pass `onRemoveFromGrid={deletePersonalSet}` to `<GroupScheduleScreen>`
- `deletePersonalSet` is async — the double-tap handler must await it and surface errors via the existing `setError` path

### Double-Tap Implementation Details
- `lastTapRef = useRef(new Map())` stores `{ time, timeout }` per set ID
- On press: if second tap within 250ms → it's a double-tap: `clearTimeout(entry.timeout)`, call the correct cycle action, return
- Otherwise: schedule expand via `setTimeout(..., 250)` and store the handle in the map
- **Cleanup**: `useEffect(() => () => { lastTapRef.current.forEach(e => clearTimeout(e.timeout)); }, [])` to prevent leaks on unmount
- **In-flight guard**: replace `pendingSetId` with `inFlightRef = useRef(new Set())`. Before firing a cycle action, check `inFlightRef.current.has(setId)`; add on start, delete in finally.

### Tests
- Unit tests in `GroupScheduleScreen.test.js` using `jest.useFakeTimers()`:
  - `makeProps` factory must include `onSetPreferenceFromGrid: jest.fn()`, `onRemoveFromGrid: jest.fn()`, `onNavigateToEditSet: jest.fn()`
  - Double-tap within 250ms cycles not-attending → maybe (calls `onAddToMySchedule`)
  - Double-tap within 250ms cycles maybe → definitely (calls `onSetPreferenceFromGrid`)
  - Double-tap within 250ms cycles definitely → not-attending (calls `onRemoveFromGrid`)
  - Single tap after 250ms opens expand modal (advance fake timers)
  - Quick-action overlay buttons no longer rendered
  - Hint banner renders when AsyncStorage returns null for the key
  - Hint banner absent when AsyncStorage returns `'true'`

---

## 2. Bug Fix: `applyPreferenceLocally` Updates All Cards

### Problem
In `App.js`, `applyPreferenceLocally` (lines 295–308) maps over ALL sets in `scheduleSnapshot` and changes the user's attendee `preference` field in every set, not just the one matching `canonicalSetId`. Result: tapping ✓ on one maybe card visually marks every maybe card as definitely.

### Root Cause
```js
// BUGGY — no filter by canonicalSetId on the outer map:
sets: (prev.sets || []).map((setItem) => ({
  ...setItem,
  attendees: (setItem.attendees || []).map((attendee) =>
    attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
  ),
  ...
}))
```

### Fix
Add early return for non-matching sets:
```js
sets: (prev.sets || []).map((setItem) => {
  if (setItem.id !== canonicalSetId) return setItem;
  return {
    ...setItem,
    attendees: (setItem.attendees || []).map((attendee) =>
      attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
    ),
    must_see_count: ...
  };
})
```

Note: `setItem.id` in `scheduleSnapshot.sets` equals the `canonicalSetId` — the field naming differs from `personalSets` (`canonical_set_id`) but the values are the same.

### Tests
- `GroupScheduleScreen.test.js`: regression test that after calling `onSetPreferenceFromGrid` for one set, other sets in the snapshot retain their original attendee preferences. Since `applyPreferenceLocally` lives in App.js (not extractable as a pure util without a refactor), test the behavior indirectly through the rendered component state post-action using a spy on `setScheduleSnapshot`.

---

## 3. "Edit in Your Schedule" — Tappable Navigation

### Problem
The expanded set modal shows static text "Edit in your schedule to change preference" with no tap action.

### Solution
Replace the static text with a tappable `Pressable` styled as a primary-color underlined link. Tapping it:
1. Closes the modal (`setExpandedSet(null)`)
2. Calls `onNavigateToEditSet(dayIndex)` prop on `GroupScheduleScreen`

### App.js Changes
- Add `editInitialDay` state (`useState(null)`)
- Implement `onNavigateToEditSet(dayIndex)`: calls `openEditSchedule()` and sets `editInitialDay(dayIndex)`
- Pass `initialDayIndex={editInitialDay}` to `<EditMyScheduleScreen>`
- Clear `editInitialDay` when leaving edit view: add `useEffect(() => { if (activeView !== 'edit') setEditInitialDay(null); }, [activeView])`

### EditMyScheduleScreen Changes
- Add `initialDayIndex` prop
- Pass as `initialSelectedDay` to `DayTabReview`

### DayTabReview Changes
- Add `initialSelectedDay` prop; use it as the initial value of the `selectedDay` state (currently defaults to `festivalDays[0]?.dayIndex`)

### Props Added to GroupScheduleScreen
```js
onNavigateToEditSet: (dayIndex: number) => void
```

### Styling
The link text: `color: C.primary`, `textDecorationLine: 'underline'`, `fontSize: 12`, `textAlign: 'center'`

### Tests
- `GroupScheduleScreen.test.js`: tapping the "Edit in your schedule" link calls `onNavigateToEditSet` with the correct dayIndex
- `DayTabReview.test.js`: when `initialSelectedDay` is provided, that day's tab is selected on first render

---

## 4. Maybe/Definitely Visual Distinction in Individual Schedules

### Problem
In `IndividualSchedulesScreen`, both "Maybe" and "Definitely" display as identical muted helper text — no visual differentiation.

### Solution
Replace inline `• Definitely` / `• Maybe` text within the helper string with a standalone small colored badge pill on a new line below the stage/time info.

### Badge Styles
| Preference | Background | Text Color | Label |
|---|---|---|---|
| `must_see` | `rgba(22,163,74,0.15)` (green tint) | `#16a34a` | Definitely |
| other (maybe) | `rgba(245,158,11,0.15)` (amber tint) | `#B45309` | Maybe |

### Component Change
In `IndividualSchedulesScreen`, the `setRow` `View` contains:
1. `<Text style={styles.setTitle}>{setItem.artist_name}</Text>`
2. `<Text style={styles.helper}>{stage} • {time range}</Text>` — **remove the preference from this line**
3. New: `<PreferenceBadge preference={setItem.preference} />` — file-local component in `IndividualSchedulesScreen.js`, not a separate file. Must handle `preference === null` or `undefined` gracefully (renders nothing or defaults to "Maybe" badge).

### Styles Added
```js
badgePill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
badgeText: { fontSize: 11, fontWeight: '700' },
```

### Tests
- `IndividualSchedulesScreen.test.js`: must_see sets render green badge text "Definitely"; non-must_see sets render amber badge text "Maybe"

---

## 5. Founder Tools: Official Lineup Persistence Info

### Problem
`lineupImportState` is React state — lost on new session. Even when the lineup is already imported, the founder tools show no info about it.

### Solution (two-part)

#### 5a. API: Add stats to `/v1/members/me/home`
When `has_official_lineup` is true, also return:
```json
{
  "group": {
    "has_official_lineup": true,
    "official_set_count": 312,
    "official_days": ["Friday", "Saturday", "Sunday"]
  }
}
```

SQL: One additional query in the home endpoint, run **inside the existing `with get_conn() as conn:` block** (not a second connection). Reuse the `festival_days` JSON already fetched from the member JOIN.

```sql
SELECT cs.day_index, COUNT(*) as cnt
FROM canonical_sets cs
WHERE cs.group_id = ? AND cs.source = 'official'
GROUP BY cs.day_index
```

Then map `day_index` → label using `festival_days`. If `festival_days` is null or malformed JSON, use `[]` as fallback (same guard pattern already used in the home endpoint). When `has_official_lineup` is false, skip this query entirely; return `official_set_count` = 0, `official_days` = [].

#### 5b. Frontend: Show persistent stats in FounderToolsScreen
- Add `officialLineupStats` prop: `{ set_count: number, days: string[] } | null`
- In `App.js`: derive from `homeSnapshot.group` and pass to `<FounderToolsScreen>`
- In FounderToolsScreen, when `lineupImportState === 'idle'` and `officialLineupStats?.set_count > 0`:
  - Show a grey info block: `"✓ Official lineup already imported — {N} sets across {Day1}, {Day2}, {Day3}"`
  - Style: similar to `successBox` but with muted colors (`C.cardBorder` border, `C.cardBg` background, `C.textMuted` text)
- When `lineupImportState === 'done'` (just imported this session): show existing success box with fresh `lineupImportResult` counts (unchanged behavior)
- **Delete button visibility**: Show the delete button when `lineupImportState === 'done' || (officialLineupStats?.set_count > 0)`. This ensures the delete button is accessible on a fresh session when lineup is already imported.

### Tests
**Backend** (`test_groups.py`):
- `test_home_includes_official_set_count_and_days_when_lineup_exists`: after import, home response has correct `official_set_count` and `official_days`
- `test_home_official_set_count_zero_when_no_lineup`: count=0, days=[] when no official sets
- `test_home_official_days_handles_null_festival_days`: when group has official sets but `festival_days` is null, response still returns valid data without crashing

**Frontend** (`FounderToolsScreen.test.js`):
- Renders persistent stats block when `officialLineupStats.set_count > 0` and state is idle
- Does not render stats block when `set_count === 0`
- Shows fresh import success box when `lineupImportState === 'done'`

---

## Files Changed

### Frontend
- `apps/mobile/App.js` — applyPreferenceLocally bug fix; new props/state for double-tap removal, edit navigation, founder stats
- `apps/mobile/src/screens/GroupScheduleScreen.js` — double-tap logic, hint banner, remove overlay buttons, add `onNavigateToEditSet` link
- `apps/mobile/src/screens/IndividualSchedulesScreen.js` — preference badge
- `apps/mobile/src/screens/EditMyScheduleScreen.js` — `initialDayIndex` prop
- `apps/mobile/src/screens/FounderToolsScreen.js` — persistent lineup stats display
- `apps/mobile/src/components/DayTabReview.js` — `initialSelectedDay` prop

### Backend
- `services/api/app/api/groups.py` — add `official_set_count` + `official_days` to home response

### Tests
- `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`
- `apps/mobile/src/__tests__/IndividualSchedulesScreen.test.js`
- `apps/mobile/src/__tests__/FounderToolsScreen.test.js`
- `apps/mobile/src/__tests__/DayTabReview.test.js`
- `services/api/tests/test_groups.py`
