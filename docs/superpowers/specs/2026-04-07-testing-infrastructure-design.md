# Testing Infrastructure Design

## Stack

- **Phase 1:** Jest via `jest-expo` preset + React Native Testing Library (RNTL) + `@testing-library/jest-native`
- **Phase 2:** Maestro E2E (YAML flows run against iOS simulator build)

`jest-expo` is used instead of the raw `react-native` preset because it automatically handles `transformIgnorePatterns` for all Expo packages, eliminating the most common source of Jest config breakage in Expo projects.

---

## Phase 1: Unit + Component Tests

### New file: `src/utils.js`

Extract all pure functions from their current home into a shared module so they can be imported and tested independently:

- From `GroupScheduleScreen.js`: `timeToMinutes`, `buildTimeline`, `formatTime`, `minuteToY`, `initials`, `withAlpha`
- From `EditableSetCard.js`: `timeStringToDate`, `formatHHMM`, `timeToTotalMinutes`, `formatDisplayTime`

Both source files then import from `src/utils.js`. No behavior changes.

### `package.json` changes

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:ci": "jest --ci --coverage"
},
"jest": {
  "preset": "jest-expo"
}
```

### Test files

**`src/__tests__/utils.test.js`** — pure function unit tests, no mocking needed:

| Function | Cases |
|---|---|
| `timeToMinutes` | Normal hours (e.g. `"21:30"` → 1290), extended hours `"00:00"` → 1440, `"05:59"` → 1799, `"06:00"` → 360 (not extended), malformed input |
| `formatTime` | AM, PM, midnight (`0` → `"12:00 AM"`), noon (`720` → `"12:00 PM"`), extended (`1530` = 25:30 → `"1:30 AM"`) |
| `minuteToY` | Basic math: `(minute - startMinute) / 30 * 44` |
| `buildTimeline` | Empty sets → `null`, single set with no end time (90 min default), multiple sets across stages, `minBodyHeight` forces endMinute extension, correct `startMinute` snap to 30-min slot |
| `initials` | Single word (`"Drake"` → `"DR"`), two words (`"Bad Bunny"` → `"BB"`), empty string → `"?"`, `undefined` → `"?"` |
| `withAlpha` | Valid hex, invalid hex → `rgba(0,0,0,α)`, hex without `#` |
| `timeStringToDate` | `"21:00"` → Date with hours=21, `"25:30"` → normalizes to hours=1 min=30, empty → default 20:00 |
| `formatHHMM` | Pads hours and minutes, `"09:05"` |
| `timeToTotalMinutes` | Hours 0–5 treated as next-day (adds 24), hours ≥ 6 normal |

**`src/__tests__/DayTabReview.test.js`** — component rendering and regression:

| Test | What it verifies |
|---|---|
| `status: 'uploading'` | Shows loading spinner, not sets list |
| `status: 'failed'` with retries left | Shows error text + Retry button + Add Manually button |
| `status: 'failed'` retries exhausted | Retry button hidden, still shows Add Manually |
| `status: 'done'` with sets | Sets list rendered, Confirm button visible |
| `status: 'idle'` | "No screenshot uploaded" message |
| **Regression: add artist on failed day** | `onAddSet` called → parent updates dayStates to `{ status: 'done', sets: [...] }` → sets list renders, confirm button appears (this is the 2026-04-07 bug) |
| Tab switching | Clicking a different day tab shows that day's content |
| Badge on done tab | Set count badge shown |
| Error mark on failed tab | `!` indicator shown |

**`src/__tests__/GroupScheduleScreen.test.js`** — data-layer logic:

| Test | What it verifies |
|---|---|
| `availableDays` derivation | Given sets with `day_index` values `[2, 1, 2, 3]` → sorted unique `[1, 2, 3]` |
| Day filtering | Only sets matching `effectiveDay` included in `filteredSets` |
| Default day | When `selectedDay` is null, defaults to first available day |
| Selected day persistence | If `selectedDay` is still in `availableDays`, keeps it |
| Selected day fallback | If `selectedDay` no longer in `availableDays`, falls back to first |
| Empty sets | `availableDays` is `[]`, `effectiveDay` is `null`, `filteredSets` is all sets |

**`src/__tests__/EditableSetCard.test.js`** — edit form behavior:

| Test | What it verifies |
|---|---|
| View mode renders | Artist name, stage, time label visible |
| Preference toggle | Pressing Must-See calls `onSetPreference` with `'must_see'` |
| Edit mode opens | Press Edit → form fields visible with current values |
| Save validation | End ≤ start → error message shown, `onSave` not called |
| Save success | Valid fields → `onSave` called with correct `{ artist_name, stage_name, start_time_pt, end_time_pt }` |
| `deleting=true` | Renders nothing |

---

## Phase 2: Maestro E2E

Flows live in `apps/mobile/e2e/flows/`. Run against a local Expo dev build on iOS simulator.

**`onboarding_founder.yaml`**
- App cold start → "Create a Group" → enter name + group name → pick color → continue → add 2 festival days → continue → choose screenshot (inject fixture) → review → confirm day → see group schedule grid

**`add_artist_manually_on_failed_day.yaml`**
- Simulate failed upload state → tap "+ Add Manually" → enter artist name + stage + times → tap Add → artist card appears in sets list → Confirm button visible
- Regression guard for the 2026-04-07 bug where artist appeared to vanish after add

**`edit_my_schedule.yaml`**
- From EditMySchedule tab → tap Edit on a set → change artist name → Save → updated name appears → tap Must-See toggle → preference updates → tap ✕ → set removed

**`group_schedule_day_nav.yaml`**
- Group schedule with multi-day data → day selector tabs visible → tap Day 2 → only Day 2 sets shown → tap member chip to filter → only that member's sets highlighted

---

## Mocking Strategy

- `apiRequest` — `jest.mock('../api/client')` for component tests that trigger API calls
- `Alert.alert` — `jest.spyOn(Alert, 'alert')` for upload failure alert tests
- Native modules (`DateTimePicker`, `expo-linear-gradient`) — auto-mocked by `jest-expo`
- `useTheme` — returns a minimal theme object in a `__mocks__/theme.js` file

---

## File Structure After Implementation

```
apps/mobile/
  src/
    utils.js                          ← new: extracted pure functions
    __tests__/
      utils.test.js
      DayTabReview.test.js
      GroupScheduleScreen.test.js
      EditableSetCard.test.js
    __mocks__/
      theme.js                        ← minimal theme mock
  e2e/
    flows/
      onboarding_founder.yaml
      add_artist_manually_on_failed_day.yaml
      edit_my_schedule.yaml
      group_schedule_day_nav.yaml
```
