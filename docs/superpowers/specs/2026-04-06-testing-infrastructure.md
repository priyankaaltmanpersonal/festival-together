# Testing Infrastructure — Follow-Up

## Problem

The project has no automated test suite. `CLAUDE.md` requires running tests before every commit, but `package.json` has no test runner — the lint script is `echo 'ESLint not configured yet'`. All verification is manual (TestFlight). Regressions can and do slip through between sessions.

## Recommended Stack

### Phase 1: Unit + Component Tests (Jest + RNTL)

**Install:**
```bash
cd apps/mobile
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native babel-jest
```

**Configure `package.json`:**
```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
},
"jest": {
  "preset": "react-native",
  "setupFilesAfterFramework": ["@testing-library/jest-native/extend-expect"],
  "transformIgnorePatterns": [
    "node_modules/(?!(react-native|expo.*|@react-native|@expo|@testing-library)/)"
  ]
}
```

### Phase 2: E2E Tests (Maestro — recommended over Detox for Expo)

Maestro uses YAML flow files and runs against a simulator build. Good fit for testing:
- Full onboarding flow (create group → upload → review → finish)
- Adding/editing sets
- Day navigation in group schedule

---

## What to Test First (Priority Order)

### 1. Pure logic functions (zero setup cost, high value)

File: `apps/mobile/src/__tests__/utils.test.js`

Functions to cover:
- `timeToMinutes(timePt)` — handles extended hours (24–29 = next-day)
- `buildTimeline(sets, minBodyHeight)` — correct start/end/labels given various set times
- `initials(name)` — handles single word, two words, empty string
- `formatTime(totalMinutes)` — AM/PM, midnight, noon edge cases
- `minuteToY(minute, startMinute)` — basic math

These functions are pure — no mocking needed.

### 2. `EditableSetCard` time serialization

- `timeStringToDate("21:00")` → correct Date
- `timeStringToDate("25:30")` → normalizes extended hours
- `formatHHMM(date)` → "21:00"

### 3. `DayTabReview` — add artist on failed day

- Render `DayTabReview` with a day in `status: 'failed'`
- Click "+ Add Manually", fill in artist name + stage + times, submit
- Assert the artist appears in the sets list (status transitions from `'failed'` to `'done'`)
- Assert the "Confirm Day" button is now visible

This test was identified from a 2026-04-07 bug: `addDaySet` succeeded and saved to the API, but the day status stayed `'failed'`, so the sets list and confirm button (both in the non-failed branch) never rendered — the artist appeared to vanish.

### 5. `GroupScheduleScreen` day filtering

- Given sets with multiple `day_index` values, only the selected day's sets appear in the grid
- `availableDays` derives correct sorted unique indices

### 6. `updateProfile` triggers snapshot refresh (mock `apiRequest`)

### 7. `finishUploadFlow` alert logic (mock `Alert.alert`, check it fires for failed days)

---

## Why This Matters

Every TestFlight bug in the 2026-04-06 session was a regression that a test would have caught:
- Chip color not updating → covered by mocking `updateProfile` + checking `scheduleSnapshot` refresh
- Grid count not updating after add → covered by `addSetFromGrid` test
- Error showing on wrong day → covered by upload failure test checking `error` state

---

## Effort Estimate

- Phase 1 setup + pure function tests: ~2 hours
- Component tests for key screens: ~4 hours
- Phase 2 Maestro E2E for onboarding: ~3 hours

Start with Phase 1. The pure function tests alone would have caught 3 of the 8 bugs in this session.

## Reference

- Implementation plan for bug fixes: `docs/superpowers/plans/2026-04-06-testflight-fixes.md`
- This file: `docs/superpowers/specs/2026-04-06-testing-infrastructure.md`
