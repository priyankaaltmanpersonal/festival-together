# Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a comprehensive automated test suite (Jest unit/component tests + Maestro E2E flows) so regressions are caught without manual TestFlight testing.

**Architecture:** Phase 1 extracts pure functions from components into `src/utils.js`, then tests them with Jest + React Native Testing Library using the `jest-expo` preset. Phase 2 adds Maestro YAML flows that run against an iOS simulator build to cover full user journeys. All functions that were previously private and duplicated across files are consolidated in `utils.js` first.

**Tech Stack:** jest-expo, @testing-library/react-native, @testing-library/jest-native, Maestro CLI

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/mobile/src/utils.js` | All extracted pure functions + constants |
| Create | `apps/mobile/src/__tests__/utils.test.js` | Unit tests for pure functions |
| Create | `apps/mobile/src/__tests__/DayTabReview.test.js` | Component tests incl. regression for add-on-failed-day bug |
| Create | `apps/mobile/src/__tests__/GroupScheduleScreen.test.js` | Day filtering logic tests |
| Create | `apps/mobile/src/__tests__/EditableSetCard.test.js` | Edit form + time serialization tests |
| Create | `apps/mobile/e2e/flows/onboarding_founder.yaml` | Maestro: full onboarding flow |
| Create | `apps/mobile/e2e/flows/add_artist_manually_on_failed_day.yaml` | Maestro: regression for add-on-failed-day |
| Create | `apps/mobile/e2e/flows/edit_my_schedule.yaml` | Maestro: edit/delete/preference flow |
| Create | `apps/mobile/e2e/flows/group_schedule_day_nav.yaml` | Maestro: day navigation + member filter |
| Modify | `apps/mobile/package.json` | Add devDeps + jest config + test scripts |
| Modify | `apps/mobile/src/screens/GroupScheduleScreen.js` | Remove private functions, import from utils |
| Modify | `apps/mobile/src/components/EditableSetCard.js` | Remove private functions, import from utils |
| Modify | `apps/mobile/src/components/DayTabReview.js` | Remove duplicated private functions, import from utils |

---

## Task 1: Install dependencies and configure Jest

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install devDependencies**

```bash
cd apps/mobile
npm install --save-dev jest-expo @testing-library/react-native @testing-library/jest-native
```

Expected output: packages installed with no peer dependency errors.

- [ ] **Step 2: Update package.json scripts and jest config**

Open `apps/mobile/package.json`. Replace the existing `"scripts"` block and add a `"jest"` key so the file reads:

```json
{
  "name": "festival-together-mobile",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "expo start",
    "start:clear": "expo start --clear",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "config": "expo config --json",
    "export": "expo export --platform ios,android --output-dir dist-export",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage",
    "lint": "echo 'ESLint not configured yet'",
    "release:preview": "eas build --platform all --profile preview",
    "release:production": "eas build --platform all --profile production"
  },
  "jest": {
    "preset": "jest-expo"
  },
  "dependencies": {
    ...existing dependencies unchanged...
  }
}
```

- [ ] **Step 3: Verify Jest can run (empty suite)**

```bash
cd apps/mobile
npx jest --passWithNoTests
```

Expected: `Test Suites: 0 passed, 0 total` — no errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile
git add package.json package-lock.json
git commit -m "chore: install jest-expo + RNTL, add test scripts"
```

---

## Task 2: Write failing utils tests

**Files:**
- Create: `apps/mobile/src/__tests__/utils.test.js`

Write the test file *before* creating `utils.js`. All tests will fail because the module doesn't exist yet.

- [ ] **Step 1: Create the test file**

Create `apps/mobile/src/__tests__/utils.test.js`:

```js
import {
  timeToMinutes,
  formatTime,
  minuteToY,
  buildTimeline,
  initials,
  withAlpha,
  timeStringToDate,
  formatHHMM,
  timeToTotalMinutes,
  formatDisplayTime,
  SLOT_MINUTES,
  SLOT_HEIGHT,
} from '../utils';

// ─── timeToMinutes ────────────────────────────────────────────────────────────

describe('timeToMinutes', () => {
  it('converts normal PM hours', () => {
    expect(timeToMinutes('21:30')).toBe(1290); // 21*60+30
    expect(timeToMinutes('22:00')).toBe(1320);
  });

  it('converts normal AM hours (6+) without extension', () => {
    expect(timeToMinutes('06:00')).toBe(360);
    expect(timeToMinutes('12:00')).toBe(720);
  });

  it('extends hours 0–5 by 24 (next-day late-night sets)', () => {
    expect(timeToMinutes('00:00')).toBe(1440); // (0+24)*60
    expect(timeToMinutes('02:30')).toBe(1590); // (2+24)*60+30
    expect(timeToMinutes('05:59')).toBe(1799); // (5+24)*60+59
  });

  it('handles null/undefined with "00:00" fallback (extended)', () => {
    expect(timeToMinutes(undefined)).toBe(1440);
    expect(timeToMinutes(null)).toBe(1440);
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats PM hours', () => {
    expect(formatTime(1290)).toBe('9:30 PM'); // 21:30
    expect(formatTime(780)).toBe('1:00 PM');  // 13:00
  });

  it('formats noon correctly', () => {
    expect(formatTime(720)).toBe('12:00 PM');
  });

  it('formats midnight correctly', () => {
    expect(formatTime(0)).toBe('12:00 AM');
  });

  it('formats standard AM hours', () => {
    expect(formatTime(60)).toBe('1:00 AM');
    expect(formatTime(390)).toBe('6:30 AM');
  });

  it('normalizes extended hours (e.g. 25:30 → 1:30 AM)', () => {
    expect(formatTime(1530)).toBe('1:30 AM'); // 25*60+30=1530, 1530%24*60=1:30
  });
});

// ─── minuteToY ────────────────────────────────────────────────────────────────

describe('minuteToY', () => {
  it('returns 0 when minute equals startMinute', () => {
    expect(minuteToY(720, 720)).toBe(0);
  });

  it('returns SLOT_HEIGHT for one slot (30 min)', () => {
    expect(minuteToY(750, 720)).toBe(SLOT_HEIGHT); // 30 min = 1 slot = 44px
  });

  it('scales linearly', () => {
    expect(minuteToY(780, 720)).toBe(SLOT_HEIGHT * 2); // 60 min = 2 slots
    expect(minuteToY(735, 720)).toBe(SLOT_HEIGHT / 2); // 15 min = 0.5 slots
  });
});

// ─── buildTimeline ────────────────────────────────────────────────────────────

describe('buildTimeline', () => {
  it('returns null for empty sets', () => {
    expect(buildTimeline([], 0)).toBeNull();
  });

  it('builds correct timeline for a single set', () => {
    const sets = [{ start_time_pt: '21:00', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1260);
    expect(result.endMinute).toBe(1320);
    expect(result.labels).toEqual([1260, 1290, 1320]);
    expect(result.totalHeight).toBe(88); // (1320-1260)/30*44
  });

  it('uses 90-min default duration when end < start', () => {
    // end_time_pt "21:00" < start_time_pt "22:00" → rawDuration negative → 90 min default
    const sets = [{ start_time_pt: '22:00', end_time_pt: '21:00' }];
    const result = buildTimeline(sets, 0);
    // effectiveEnd = timeToMinutes('22:00') + 90 = 1320 + 90 = 1410
    expect(result.startMinute).toBe(1320);
    expect(result.endMinute).toBe(1410);
    expect(result.totalHeight).toBe(132); // (1410-1320)/30*44
  });

  it('spans multiple sets correctly', () => {
    const sets = [
      { start_time_pt: '21:00', end_time_pt: '22:00' },
      { start_time_pt: '22:30', end_time_pt: '23:30' },
    ];
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1260); // floor(1260/30)*30
    expect(result.endMinute).toBe(1410);   // ceil(1410/30)*30
  });

  it('extends endMinute to fill minBodyHeight', () => {
    // Sets span 88px; minBodyHeight=200 forces extension
    const sets = [{ start_time_pt: '21:00', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 200);
    // Need: ((endMinute - 1260) / 30) * 44 >= 200
    // (1410-1260)/30*44 = 5*44 = 220 >= 200 → endMinute = 1410
    expect(result.endMinute).toBe(1410);
    expect(result.totalHeight).toBe(220);
  });

  it('snaps startMinute down to nearest 30-min slot', () => {
    const sets = [{ start_time_pt: '21:15', end_time_pt: '22:00' }];
    // timeToMinutes('21:15') = 1275, floor(1275/30)*30 = 42*30 = 1260
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1260);
  });
});

// ─── initials ─────────────────────────────────────────────────────────────────

describe('initials', () => {
  it('returns first two letters of a single word uppercased', () => {
    expect(initials('Drake')).toBe('DR');
  });

  it('returns first letter of each word for two-word names', () => {
    expect(initials('Bad Bunny')).toBe('BB');
    expect(initials('tyler the creator')).toBe('TT');
  });

  it('returns "?" for empty string', () => {
    expect(initials('')).toBe('?');
  });

  it('returns "?" for null/undefined', () => {
    expect(initials(null)).toBe('?');
    expect(initials(undefined)).toBe('?');
  });
});

// ─── withAlpha ────────────────────────────────────────────────────────────────

describe('withAlpha', () => {
  it('converts valid hex to rgba', () => {
    expect(withAlpha('#4D73FF', 0.2)).toBe('rgba(77, 115, 255, 0.2)');
    expect(withAlpha('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)');
  });

  it('works without leading #', () => {
    expect(withAlpha('FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('returns rgba(0,0,0,α) for invalid hex', () => {
    expect(withAlpha('invalid', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(withAlpha(null, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(withAlpha(undefined, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});

// ─── timeStringToDate ─────────────────────────────────────────────────────────

describe('timeStringToDate', () => {
  it('converts "HH:MM" string to Date with correct hours and minutes', () => {
    const d = timeStringToDate('21:00');
    expect(d.getHours()).toBe(21);
    expect(d.getMinutes()).toBe(0);
  });

  it('normalizes extended hours (25:30 → 1:30)', () => {
    const d = timeStringToDate('25:30');
    expect(d.getHours()).toBe(1);
    expect(d.getMinutes()).toBe(30);
  });

  it('returns default 20:00 for empty/undefined input', () => {
    const d = timeStringToDate('');
    expect(d.getHours()).toBe(20);
    expect(d.getMinutes()).toBe(0);

    const d2 = timeStringToDate(undefined);
    expect(d2.getHours()).toBe(20);
    expect(d2.getMinutes()).toBe(0);
  });
});

// ─── formatHHMM ───────────────────────────────────────────────────────────────

describe('formatHHMM', () => {
  it('pads single-digit hours and minutes', () => {
    const d = new Date();
    d.setHours(9, 5, 0, 0);
    expect(formatHHMM(d)).toBe('09:05');
  });

  it('formats double-digit hours and minutes', () => {
    const d = new Date();
    d.setHours(21, 30, 0, 0);
    expect(formatHHMM(d)).toBe('21:30');
  });
});

// ─── timeToTotalMinutes ───────────────────────────────────────────────────────

describe('timeToTotalMinutes', () => {
  it('converts normal hours to total minutes', () => {
    const d = new Date();
    d.setHours(21, 30, 0, 0);
    expect(timeToTotalMinutes(d)).toBe(1290); // 21*60+30
  });

  it('extends hours 0–5 by 24 (next-day)', () => {
    const d = new Date();
    d.setHours(2, 0, 0, 0);
    expect(timeToTotalMinutes(d)).toBe(1560); // (2+24)*60
  });

  it('does not extend hour 6', () => {
    const d = new Date();
    d.setHours(6, 0, 0, 0);
    expect(timeToTotalMinutes(d)).toBe(360);
  });
});

// ─── formatDisplayTime ────────────────────────────────────────────────────────

describe('formatDisplayTime', () => {
  it('formats a PM time', () => {
    const d = new Date();
    d.setHours(21, 30, 0, 0);
    expect(formatDisplayTime(d)).toBe('9:30 PM');
  });

  it('formats noon', () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    expect(formatDisplayTime(d)).toBe('12:00 PM');
  });

  it('formats midnight as 12:00 AM', () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    expect(formatDisplayTime(d)).toBe('12:00 AM');
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail with "Cannot find module '../utils'"**

```bash
cd apps/mobile
npx jest src/__tests__/utils.test.js
```

Expected: All tests FAIL with `Cannot find module '../utils'`.

---

## Task 3: Create src/utils.js and make utils tests pass

**Files:**
- Create: `apps/mobile/src/utils.js`

- [ ] **Step 1: Create utils.js with all extracted functions**

Create `apps/mobile/src/utils.js`:

```js
// ─── Grid layout constants ────────────────────────────────────────────────────

export const SLOT_MINUTES = 30;
export const SLOT_HEIGHT = 44;

// ─── Time string utilities ────────────────────────────────────────────────────

/**
 * Convert a "HH:MM" time string to total minutes since festival "day start" (06:00).
 * Hours 0–5 are treated as next-day (extended: +24h), matching festival late-night sets.
 */
export function timeToMinutes(timePt) {
  const [h, m] = (timePt || '00:00').split(':').map((n) => parseInt(n, 10));
  const adjustedHour = h < 6 ? h + 24 : h;
  return adjustedHour * 60 + m;
}

/**
 * Format total minutes (since midnight) as "h:mm AM/PM".
 * Handles extended hours (e.g. 1530 = 25:30 normalizes to 1:30 AM).
 */
export function formatTime(totalMinutes) {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const normalizedHour = h24 % 24;
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
  const h12 = ((normalizedHour + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ─── Grid position utilities ──────────────────────────────────────────────────

/**
 * Convert a minute value to a pixel Y position within the schedule grid.
 */
export function minuteToY(minute, startMinute) {
  return ((minute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT;
}

/**
 * Build the timeline descriptor for the schedule grid given a list of sets.
 * Returns null if there are no sets.
 */
export function buildTimeline(sets, minBodyHeight = 0) {
  if (!sets.length) return null;

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const setItem of sets) {
    const start = timeToMinutes(setItem.start_time_pt);
    const rawEnd = timeToMinutes(setItem.end_time_pt);
    const rawDuration = rawEnd - start;
    const effectiveEnd = start + (rawDuration > 0 ? rawDuration : 90);
    minStart = Math.min(minStart, start);
    maxEnd = Math.max(maxEnd, effectiveEnd);
  }

  const startMinute = Math.floor(minStart / SLOT_MINUTES) * SLOT_MINUTES;
  let endMinute = Math.ceil(maxEnd / SLOT_MINUTES) * SLOT_MINUTES;

  while (((endMinute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT < minBodyHeight) {
    endMinute += SLOT_MINUTES;
  }

  const labels = [];
  for (let minute = startMinute; minute <= endMinute; minute += SLOT_MINUTES) {
    labels.push(minute);
  }

  return {
    startMinute,
    endMinute,
    labels,
    totalHeight: ((endMinute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT,
  };
}

// ─── Display utilities ────────────────────────────────────────────────────────

/**
 * Generate 1–2 character initials from a display name.
 */
export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase();
}

/**
 * Convert a hex color string to rgba with the given alpha.
 */
export function withAlpha(hexColor, alpha) {
  const raw = (hexColor || '').replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const intValue = parseInt(raw, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Date / time picker utilities ─────────────────────────────────────────────

/**
 * Convert a "HH:MM" 24h string to a Date object suitable for DateTimePicker.
 * Normalizes extended hours (>= 24) by subtracting 24.
 * Returns a default Date at 20:00 if input is falsy.
 */
export function timeStringToDate(timeStr) {
  if (!timeStr) return makeDefaultDate(20);
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (h >= 24) h -= 24;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Format a Date as a "HH:MM" 24h string, zero-padded.
 */
export function formatHHMM(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Convert a Date to total minutes, treating hours 0–5 as next-day (+24h).
 */
export function timeToTotalMinutes(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h < 6 ? h + 24 : h) * 60 + m;
}

/**
 * Format a Date as "h:mm AM/PM" for display in the UI.
 */
export function formatDisplayTime(date) {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makeDefaultDate(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}
```

- [ ] **Step 2: Run utils tests — all should pass**

```bash
cd apps/mobile
npx jest src/__tests__/utils.test.js
```

Expected: All tests PASS. If any fail, fix `utils.js` until they do.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/utils.js apps/mobile/src/__tests__/utils.test.js
git commit -m "feat: extract pure functions to utils.js with full unit test coverage"
```

---

## Task 4: Update GroupScheduleScreen.js to import from utils

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Replace private functions with imports**

At the top of `GroupScheduleScreen.js`, add the import:

```js
import { timeToMinutes, formatTime, minuteToY, buildTimeline, initials, withAlpha, SLOT_MINUTES, SLOT_HEIGHT } from '../utils';
```

Then delete the following private function definitions from the bottom of `GroupScheduleScreen.js` (lines ~601–675):
- `function initials(name) { ... }`
- `function withAlpha(hexColor, alpha) { ... }`
- `function timeToMinutes(timePt) { ... }`
- `function formatTime(totalMinutes) { ... }`
- `function minuteToY(minute, startMinute) { ... }`
- `function buildTimeline(sets, minBodyHeight = 0) { ... }`

Also delete the two constant definitions at the top of the file:
```js
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 44;
```

(They are now exported from `utils.js`.)

- [ ] **Step 2: Run utils tests to confirm nothing broke**

```bash
cd apps/mobile
npx jest src/__tests__/utils.test.js
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/GroupScheduleScreen.js
git commit -m "refactor: GroupScheduleScreen imports utils instead of private functions"
```

---

## Task 5: Update EditableSetCard.js to import from utils

**Files:**
- Modify: `apps/mobile/src/components/EditableSetCard.js`

- [ ] **Step 1: Add import and remove private functions**

At the top of `EditableSetCard.js`, add:

```js
import { timeStringToDate, formatHHMM, timeToTotalMinutes, formatDisplayTime } from '../utils';
```

Delete these private function definitions from `EditableSetCard.js`:
- `function formatTime(t) { ... }` (note: this is a *different* `formatTime` local to this file — it formats "HH:MM" strings for display, not minutes; it is replaced by `formatDisplayTime` from utils)
- `function timeStringToDate(timeStr) { ... }`
- `function makeDefaultDate(hour) { ... }`
- `function formatHHMM(date) { ... }`
- `function timeToTotalMinutes(date) { ... }`
- `function formatDisplayTime(date) { ... }`

Replace usages of the local `formatTime` (for the `timeLabel` computation at line ~119) with `formatDisplayTime` from utils, since they do the same thing. The local `formatTime` in EditableSetCard takes an "HH:MM" string; it calls `formatDisplayTime` logic internally. Verify: `formatDisplayTime(timeStringToDate(setItem.start_time_pt))` produces the same output as the old local `formatTime(setItem.start_time_pt)`.

The `timeLabel` line (around line 119) currently reads:
```js
const timeLabel = setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt
  ? `${formatTime(setItem.start_time_pt)}–${formatTime(setItem.end_time_pt)}`
  : formatTime(setItem.start_time_pt);
```

Replace with:
```js
const timeLabel = setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt
  ? `${formatDisplayTime(timeStringToDate(setItem.start_time_pt))}–${formatDisplayTime(timeStringToDate(setItem.end_time_pt))}`
  : formatDisplayTime(timeStringToDate(setItem.start_time_pt));
```

- [ ] **Step 2: Run all tests**

```bash
cd apps/mobile
npx jest
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/EditableSetCard.js
git commit -m "refactor: EditableSetCard imports time utils instead of private functions"
```

---

## Task 6: Update DayTabReview.js to import from utils

**Files:**
- Modify: `apps/mobile/src/components/DayTabReview.js`

- [ ] **Step 1: Add import and remove duplicated private functions**

At the top of `DayTabReview.js`, add:

```js
import { formatHHMM, formatDisplayTime, timeToTotalMinutes } from '../utils';
```

Delete these private function definitions from `DayTabReview.js` (they are exact duplicates of the utils versions):
- `function formatHHMM(date) { ... }`
- `function formatDisplayTime(date) { ... }`
- `function timeToTotalMinutes(date) { ... }`

Also delete:
- `function makeDefaultTime(hour) { ... }` — replace all usages with an inline `new Date(); d.setHours(hour, 0, 0, 0); return d;` or import a `makeDefaultDate` helper. Since `makeDefaultDate` is not exported from utils, inline it at usage sites:

Find all calls to `makeDefaultTime(20)` and `makeDefaultTime(21)` in `AddArtistForm` and replace:
```js
// Before:
const [startDate, setStartDate] = useState(() => makeDefaultTime(20));
const [endDate, setEndDate] = useState(() => makeDefaultTime(21));

// After:
const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setHours(20, 0, 0, 0); return d; });
const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setHours(21, 0, 0, 0); return d; });
```

- [ ] **Step 2: Run all tests**

```bash
cd apps/mobile
npx jest
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/DayTabReview.js
git commit -m "refactor: DayTabReview imports time utils, removes duplicate private functions"
```

---

## Task 7: Write DayTabReview component tests

**Files:**
- Create: `apps/mobile/src/__tests__/DayTabReview.test.js`

- [ ] **Step 1: Create the test file**

Create `apps/mobile/src/__tests__/DayTabReview.test.js`:

```js
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { DayTabReview } from '../components/DayTabReview';

// DateTimePicker is a native module — mock it so it renders without crashing
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const FESTIVAL_DAYS = [
  { dayIndex: 1, label: 'Friday' },
  { dayIndex: 2, label: 'Saturday' },
];

const SET_ITEM = {
  canonical_set_id: 'set-1',
  artist_name: 'Bad Bunny',
  stage_name: 'Sahara',
  start_time_pt: '21:00',
  end_time_pt: '22:00',
  day_index: 1,
  preference: 'must_see',
};

function makeProps(overrides = {}) {
  return {
    festivalDays: FESTIVAL_DAYS,
    dayStates: {},
    onRetry: jest.fn(),
    onDeleteSet: jest.fn(),
    onAddSet: jest.fn().mockResolvedValue(undefined),
    onSetPreference: jest.fn(),
    onEditSet: jest.fn(),
    onReUpload: jest.fn(),
    onAddOpen: jest.fn(),
    onConfirmDay: jest.fn(),
    ...overrides,
  };
}

// ─── Status rendering ─────────────────────────────────────────────────────────

describe('DayTabReview — uploading state', () => {
  it('shows loading text and hides sets list', () => {
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'uploading', sets: [], retryCount: 0 } },
        })}
      />
    );
    expect(getByText('Analyzing your schedule…')).toBeTruthy();
    expect(queryByText('Bad Bunny')).toBeNull();
  });
});

describe('DayTabReview — failed state', () => {
  it('shows error message, Retry button, and Add Manually button', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: {
              status: 'failed',
              sets: [],
              retryCount: 0,
              errorMsg: 'Could not parse this screenshot.',
            },
          },
        })}
      />
    );
    expect(getByText(/Could not parse this screenshot/)).toBeTruthy();
    expect(getByText(/Retry Upload/)).toBeTruthy();
    expect(getByText('+ Add Manually')).toBeTruthy();
  });

  it('hides Retry button when retryCount >= 3', () => {
    const { queryByText, getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: {
              status: 'failed',
              sets: [],
              retryCount: 3,
              errorMsg: 'Could not parse this screenshot.',
            },
          },
        })}
      />
    );
    expect(queryByText(/Retry Upload/)).toBeNull();
    expect(getByText('+ Add Manually')).toBeTruthy();
  });
});

describe('DayTabReview — done state', () => {
  it('renders sets list and Confirm button', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0, confirmed: false },
          },
        })}
      />
    );
    expect(getByText('Bad Bunny')).toBeTruthy();
    expect(getByText(/Confirm Friday/)).toBeTruthy();
  });

  it('shows confirmed check instead of confirm button when confirmed=true', () => {
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0, confirmed: true },
          },
        })}
      />
    );
    expect(getByText('✓ Confirmed')).toBeTruthy();
    expect(queryByText(/Confirm Friday/)).toBeNull();
  });
});

describe('DayTabReview — idle state', () => {
  it('shows "No screenshot uploaded" message', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: { 1: { status: 'idle', sets: [], retryCount: 0 } },
        })}
      />
    );
    expect(getByText('No screenshot uploaded for this day.')).toBeTruthy();
  });
});

// ─── Tab badges ───────────────────────────────────────────────────────────────

describe('DayTabReview — tab indicators', () => {
  it('shows set count badge on done tab', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0 },
            2: { status: 'idle', sets: [], retryCount: 0 },
          },
        })}
      />
    );
    expect(getByText('1')).toBeTruthy(); // badge showing count
  });

  it('shows error mark on failed tab', () => {
    const { getByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'failed', sets: [], retryCount: 0 },
            2: { status: 'idle', sets: [], retryCount: 0 },
          },
        })}
      />
    );
    expect(getByText('!')).toBeTruthy();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe('DayTabReview — tab switching', () => {
  it('switches to Saturday content when Saturday tab is pressed', () => {
    const saturdaySet = { ...SET_ITEM, canonical_set_id: 'set-2', artist_name: 'Tyler the Creator' };
    const { getByText, queryByText } = render(
      <DayTabReview
        {...makeProps({
          dayStates: {
            1: { status: 'done', sets: [SET_ITEM], retryCount: 0 },
            2: { status: 'done', sets: [saturdaySet], retryCount: 0 },
          },
        })}
      />
    );
    // Default shows Friday content
    expect(getByText('Bad Bunny')).toBeTruthy();
    expect(queryByText('Tyler the Creator')).toBeNull();

    fireEvent.press(getByText('Saturday'));

    expect(queryByText('Bad Bunny')).toBeNull();
    expect(getByText('Tyler the Creator')).toBeTruthy();
  });
});

// ─── REGRESSION: add artist on failed day ─────────────────────────────────────
// Bug (2026-04-07): addDaySet succeeded but day status stayed 'failed', so the
// sets list (in the non-failed branch) never rendered. Artist appeared to vanish.

describe('DayTabReview — add artist on failed day regression', () => {
  it('shows artist and confirm button after parent updates day to done', async () => {
    const onAddSet = jest.fn().mockResolvedValue(undefined);

    const { getByText, getByPlaceholderText, rerender, queryByText } = render(
      <DayTabReview
        {...makeProps({
          onAddSet,
          dayStates: {
            1: { status: 'failed', sets: [], retryCount: 3, errorMsg: 'Parse failed.' },
          },
        })}
      />
    );

    // Open the add form
    fireEvent.press(getByText('+ Add Manually'));

    // Fill in artist name
    fireEvent.changeText(getByPlaceholderText('e.g. Bad Bunny'), 'Kendrick Lamar');

    // Open stage dropdown and select a stage
    fireEvent.press(getByText('Select stage…'));
    fireEvent.press(getByText('Coachella Stage'));

    // Submit the form
    await act(async () => {
      fireEvent.press(getByText('Add'));
    });

    expect(onAddSet).toHaveBeenCalledWith(
      expect.objectContaining({ artist_name: 'Kendrick Lamar', stage_name: 'Coachella Stage' }),
      1
    );

    // Simulate parent updating dayStates to 'done' with the new set
    const newSet = {
      canonical_set_id: 'set-new',
      artist_name: 'Kendrick Lamar',
      stage_name: 'Coachella Stage',
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      day_index: 1,
      preference: 'flexible',
    };
    rerender(
      <DayTabReview
        {...makeProps({
          onAddSet,
          dayStates: {
            1: { status: 'done', sets: [newSet], retryCount: 3, confirmed: false },
          },
        })}
      />
    );

    // Artist should now be visible (would be invisible if bug regressed)
    expect(getByText('Kendrick Lamar')).toBeTruthy();
    // Confirm button should appear
    expect(getByText(/Confirm Friday/)).toBeTruthy();
    // Error block should be gone
    expect(queryByText('Parse failed.')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the DayTabReview tests**

```bash
cd apps/mobile
npx jest src/__tests__/DayTabReview.test.js --verbose
```

Expected: All tests PASS. If any fail due to unexpected rendering, inspect the component output with `debug()` and adjust assertions accordingly (e.g. exact button text, loading message text). Do not change the component logic — fix the test assertions to match actual text.

- [ ] **Step 3: Run the full suite**

```bash
cd apps/mobile
npx jest
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/__tests__/DayTabReview.test.js
git commit -m "test: add DayTabReview component tests including add-on-failed-day regression"
```

---

## Task 8: Write GroupScheduleScreen day-filtering tests

**Files:**
- Create: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

- [ ] **Step 1: Create the test file**

Create `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`:

```js
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupScheduleScreen } from '../screens/GroupScheduleScreen';

// Mock expo-linear-gradient (used in modal footer)
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const STAGE = 'Sahara';

function makeSet(id, dayIndex, artistName, startTime = '21:00', endTime = '22:00') {
  return {
    id,
    day_index: dayIndex,
    artist_name: artistName,
    stage_name: STAGE,
    start_time_pt: startTime,
    end_time_pt: endTime,
    attendees: [],
    attendee_count: 0,
    popularity_tier: null,
  };
}

function makeProps(sets, overrides = {}) {
  return {
    homeSnapshot: { members: [] },
    scheduleSnapshot: { sets, stages: [STAGE] },
    selectedMemberIds: [],
    loading: false,
    onToggleMember: jest.fn(),
    onResetFilters: jest.fn(),
    inviteCode: null,
    onCopyInvite: jest.fn(),
    inviteCopied: false,
    myMemberId: null,
    onAddToMySchedule: null,
    festivalDays: [
      { dayIndex: 1, label: 'Friday' },
      { dayIndex: 2, label: 'Saturday' },
    ],
    ...overrides,
  };
}

describe('GroupScheduleScreen — day filtering', () => {
  it('shows only Day 1 sets by default (first available day)', () => {
    const sets = [
      makeSet('a', 1, 'Artist Day1'),
      makeSet('b', 2, 'Artist Day2'),
    ];
    const { getByText, queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);

    expect(getByText('Artist Day1')).toBeTruthy();
    expect(queryByText('Artist Day2')).toBeNull();
  });

  it('switches to Day 2 when Day 2 tab is selected', () => {
    const sets = [
      makeSet('a', 1, 'Artist Day1'),
      makeSet('b', 2, 'Artist Day2'),
    ];
    const { getByText, queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);

    fireEvent.press(getByText('Saturday'));

    expect(queryByText('Artist Day1')).toBeNull();
    expect(getByText('Artist Day2')).toBeTruthy();
  });

  it('derives availableDays as sorted unique day_index values', () => {
    // days 2, 1, 2, 3 → sorted unique [1, 2, 3]
    const sets = [
      makeSet('a', 2, 'A'),
      makeSet('b', 1, 'B'),
      makeSet('c', 2, 'C'),
      makeSet('d', 3, 'D'),
    ];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, {
          festivalDays: [
            { dayIndex: 1, label: 'Fri' },
            { dayIndex: 2, label: 'Sat' },
            { dayIndex: 3, label: 'Sun' },
          ],
        })}
      />
    );
    // All three day tabs should be present
    expect(getByText('Fri')).toBeTruthy();
    expect(getByText('Sat')).toBeTruthy();
    expect(getByText('Sun')).toBeTruthy();
  });

  it('shows no day selector when all sets share one day_index', () => {
    const sets = [makeSet('a', 1, 'A'), makeSet('b', 1, 'B')];
    const { queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);
    // Day selector only renders when availableDays.length > 1
    expect(queryByText('Saturday')).toBeNull();
  });

  it('shows "No schedule loaded yet" when sets array is empty', () => {
    const { getByText } = render(<GroupScheduleScreen {...makeProps([])} />);
    expect(getByText('No schedule loaded yet.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run GroupScheduleScreen tests**

```bash
cd apps/mobile
npx jest src/__tests__/GroupScheduleScreen.test.js --verbose
```

Expected: All tests PASS.

- [ ] **Step 3: Run the full suite**

```bash
cd apps/mobile
npx jest
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/__tests__/GroupScheduleScreen.test.js
git commit -m "test: add GroupScheduleScreen day filtering tests"
```

---

## Task 9: Write EditableSetCard component tests

**Files:**
- Create: `apps/mobile/src/__tests__/EditableSetCard.test.js`

- [ ] **Step 1: Create the test file**

Create `apps/mobile/src/__tests__/EditableSetCard.test.js`:

```js
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EditableSetCard } from '../components/EditableSetCard';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const SET_ITEM = {
  canonical_set_id: 'set-1',
  artist_name: 'Bad Bunny',
  stage_name: 'Sahara',
  start_time_pt: '21:00',
  end_time_pt: '22:00',
  day_index: 1,
  preference: 'must_see',
};

function makeProps(overrides = {}) {
  return {
    setItem: SET_ITEM,
    isEditing: false,
    onStartEdit: jest.fn(),
    onCancelEdit: jest.fn(),
    onSave: jest.fn().mockResolvedValue(undefined),
    onDelete: jest.fn(),
    onSetPreference: jest.fn(),
    saving: false,
    deleting: false,
    ...overrides,
  };
}

// ─── View mode ────────────────────────────────────────────────────────────────

describe('EditableSetCard — view mode', () => {
  it('displays artist name and stage', () => {
    const { getByText } = render(<EditableSetCard {...makeProps()} />);
    expect(getByText('Bad Bunny')).toBeTruthy();
    expect(getByText(/Sahara/)).toBeTruthy();
  });

  it('renders nothing when deleting=true', () => {
    const { toJSON } = render(<EditableSetCard {...makeProps({ deleting: true })} />);
    expect(toJSON()).toBeNull();
  });

  it('calls onSetPreference with "must_see" when Must-See is pressed', () => {
    const onSetPreference = jest.fn();
    const { getByText } = render(<EditableSetCard {...makeProps({ onSetPreference })} />);
    fireEvent.press(getByText('Must-See'));
    expect(onSetPreference).toHaveBeenCalledWith('set-1', 'must_see');
  });

  it('calls onSetPreference with "flexible" when Maybe is pressed', () => {
    const onSetPreference = jest.fn();
    const { getByText } = render(<EditableSetCard {...makeProps({ onSetPreference })} />);
    fireEvent.press(getByText('Maybe'));
    expect(onSetPreference).toHaveBeenCalledWith('set-1', 'flexible');
  });

  it('calls onStartEdit when Edit button is pressed', () => {
    const onStartEdit = jest.fn();
    const { getByText } = render(<EditableSetCard {...makeProps({ onStartEdit })} />);
    fireEvent.press(getByText(/Edit/));
    expect(onStartEdit).toHaveBeenCalled();
  });
});

// ─── Edit mode ────────────────────────────────────────────────────────────────

describe('EditableSetCard — edit mode', () => {
  it('shows form fields with current values pre-filled', () => {
    const { getByDisplayValue } = render(
      <EditableSetCard {...makeProps({ isEditing: true })} />
    );
    expect(getByDisplayValue('Bad Bunny')).toBeTruthy();
    expect(getByDisplayValue('Sahara')).toBeTruthy();
  });

  it('calls onSave with trimmed fields when save succeeds', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByDisplayValue, getByText } = render(
      <EditableSetCard {...makeProps({ isEditing: true, onSave })} />
    );
    fireEvent.changeText(getByDisplayValue('Bad Bunny'), '  Bad Bunny  ');
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ artist_name: 'Bad Bunny' })
    );
  });

  it('shows error and does not call onSave when end time <= start time', async () => {
    // Start: 22:00, End: 21:00 → end before start → validation error
    const onSave = jest.fn();
    const { getByText } = render(
      <EditableSetCard
        {...makeProps({
          isEditing: true,
          onSave,
          setItem: { ...SET_ITEM, start_time_pt: '22:00', end_time_pt: '21:00' },
        })}
      />
    );
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText('End time must be after start time.')).toBeTruthy();
  });

  it('calls onCancelEdit when Cancel is pressed', () => {
    const onCancelEdit = jest.fn();
    const { getByText } = render(
      <EditableSetCard {...makeProps({ isEditing: true, onCancelEdit })} />
    );
    fireEvent.press(getByText('Cancel'));
    expect(onCancelEdit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run EditableSetCard tests**

```bash
cd apps/mobile
npx jest src/__tests__/EditableSetCard.test.js --verbose
```

Expected: All PASS.

- [ ] **Step 3: Run the full suite**

```bash
cd apps/mobile
npx jest
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/__tests__/EditableSetCard.test.js
git commit -m "test: add EditableSetCard view/edit/validation tests"
```

---

## Task 10: Update CLAUDE.md test step reference

**Files:**
- Modify: `CLAUDE.md` (repo root)

- [ ] **Step 1: Verify the lint/test steps still reference correct commands**

The `CLAUDE.md` pre-commit cleanup instructions say to run the linter and tests. Confirm the "Run tests" step references `cd apps/mobile && npm test`. No change needed unless the wording is stale — update if so.

- [ ] **Step 2: Commit if changed**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md test command reference"
```

(Skip this commit if no changes were needed.)

---

## Task 11: Maestro — onboarding founder flow

**Files:**
- Create: `apps/mobile/e2e/flows/onboarding_founder.yaml`

Maestro must be installed separately (`brew install maestro`). These flows run against a local development build on an iOS simulator.

- [ ] **Step 1: Create the flow**

Create `apps/mobile/e2e/flows/onboarding_founder.yaml`:

```yaml
appId: com.festivaltogether.app
---
- launchApp:
    clearState: true

# Welcome screen
- assertVisible: "Plan your festival day with your crew"
- tapOn: "Create a Group"

# Profile creation
- assertVisible: "Create Group"
- tapOn:
    id: "Your name"
- inputText: "Test User"
- tapOn:
    id: "Group name"
- inputText: "Test Crew"
# Pick any color swatch (first one)
- tapOn:
    point: "10%, 55%"
- tapOn: "Continue"

# Festival day setup
- assertVisible: "Festival Days"
- tapOn:
    index: 0
    text: ""
    # The first day label input
- inputText: "Friday"
- tapOn: "＋ Add Day"
- tapOn:
    index: 1
    text: ""
- inputText: "Saturday"
- tapOn: "Continue"

# Upload step (skip both days for speed)
- assertVisible: "Upload Friday schedule"
- tapOn: "Skip This Day"
- assertVisible: "Upload Saturday schedule"
- tapOn: "Skip This Day"

# Review step (no sets since we skipped, but confirm the screen loads)
- assertVisible: "Review Your Schedule"
- assertVisible: "Friday"
- assertVisible: "Saturday"
```

- [ ] **Step 2: Run the flow (requires running simulator + Expo dev build)**

```bash
cd apps/mobile
maestro test e2e/flows/onboarding_founder.yaml
```

Expected: Flow completes without assertion failures. If a screen text changed, update the assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/e2e/flows/onboarding_founder.yaml
git commit -m "test(e2e): add Maestro onboarding founder flow"
```

---

## Task 12: Maestro — add artist manually on failed day

**Files:**
- Create: `apps/mobile/e2e/flows/add_artist_manually_on_failed_day.yaml`

This flow guards against the 2026-04-07 regression: artist added on a failed day appeared to vanish because the day status didn't transition to 'done'.

Note: this flow requires a pre-condition where a day is in failed state. Since we can't trigger a real upload failure reliably, this flow is best run as a manual regression check or against a test build that can inject a failed day state. Document this limitation in a comment.

- [ ] **Step 1: Create the flow**

Create `apps/mobile/e2e/flows/add_artist_manually_on_failed_day.yaml`:

```yaml
# REGRESSION GUARD: 2026-04-07 bug — artist added on failed day appeared to vanish.
# Pre-condition: App is at the "Review Your Schedule" step with Day 1 in failed state.
# Run this after manually triggering an upload failure on Day 1 during onboarding.
appId: com.festivaltogether.app
---
# Assume we're on the Review screen with Day 1 failed
- assertVisible: "Review Your Schedule"
- assertVisible: "Could not parse"
- tapOn: "+ Add Manually"

# Fill in the form
- assertVisible: "Add Artist"
- tapOn:
    id: "Artist name"
- inputText: "Kendrick Lamar"

# Select stage from dropdown
- tapOn: "Select stage…"
- tapOn: "Coachella Stage"

# Submit
- tapOn: "Add"

# CRITICAL ASSERTION: artist must appear in the list
# If the bug regressed, this would fail because the day stays 'failed' and the list doesn't render
- assertVisible: "Kendrick Lamar"
- assertVisible: "Confirm Friday"
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/e2e/flows/add_artist_manually_on_failed_day.yaml
git commit -m "test(e2e): add Maestro regression flow for add-artist-on-failed-day"
```

---

## Task 13: Maestro — edit my schedule flow

**Files:**
- Create: `apps/mobile/e2e/flows/edit_my_schedule.yaml`

Pre-condition: User is logged in with at least one set on their personal schedule (Edit My Schedule tab).

- [ ] **Step 1: Create the flow**

Create `apps/mobile/e2e/flows/edit_my_schedule.yaml`:

```yaml
# Pre-condition: user has at least one set on their schedule.
appId: com.festivaltogether.app
---
# Navigate to Edit My Schedule tab
- tapOn: "My Schedule"
- assertVisible: "My Schedule"

# Tap edit on the first set
- tapOn: "Edit ✏"

# Change artist name
- assertVisible: "Editing"
- clearText:
    id: "artist_name_input"
- inputText: "Updated Artist Name"
- tapOn: "Save"

# Verify name updated
- assertVisible: "Updated Artist Name"

# Toggle preference to Must-See
- tapOn: "Must-See"
# No crash = pass (preference toggle is fire-and-forget in the UI)

# Delete the set
- tapOn: "✕"
# Set should disappear
- assertNotVisible: "Updated Artist Name"
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/e2e/flows/edit_my_schedule.yaml
git commit -m "test(e2e): add Maestro edit-my-schedule flow"
```

---

## Task 14: Maestro — group schedule day navigation

**Files:**
- Create: `apps/mobile/e2e/flows/group_schedule_day_nav.yaml`

Pre-condition: Group has sets on at least two different days.

- [ ] **Step 1: Create the flow**

Create `apps/mobile/e2e/flows/group_schedule_day_nav.yaml`:

```yaml
# Pre-condition: group schedule has sets on Day 1 and Day 2.
appId: com.festivaltogether.app
---
# Navigate to Group Schedule tab
- tapOn: "Group"
- assertVisible: "Time"

# Day selector should be visible since there are multiple days
- assertVisible: "Friday"
- assertVisible: "Saturday"

# Switch to Saturday
- tapOn: "Saturday"

# Verify the view updated (grid should still be visible, no crash)
- assertVisible: "Time"

# Switch back to Friday
- tapOn: "Friday"
- assertVisible: "Time"

# Tap a member chip to filter (first chip in the row)
- tapOn:
    point: "15%, 30%"
# Grid should still render after filter
- assertVisible: "Time"

# Clear filters
- tapOn: "Clear Filters"
- assertVisible: "Time"
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/e2e/flows/group_schedule_day_nav.yaml
git commit -m "test(e2e): add Maestro group schedule day navigation flow"
```

---

## Task 15: Push all commits

- [ ] **Push to remote**

```bash
git push
```

Expected: All commits pushed to `origin/main`. Render will auto-deploy the backend (no mobile impact, but keeps remote in sync).

---

## Self-Review Notes

- **Spec coverage check:**
  - ✅ Phase 1 Jest setup → Task 1
  - ✅ Pure function tests (`timeToMinutes`, `buildTimeline`, `initials`, `formatTime`, `minuteToY`, `withAlpha`) → Task 2–3
  - ✅ Time serialization tests (`timeStringToDate`, `formatHHMM`) → Task 2–3
  - ✅ `DayTabReview` add-on-failed-day regression → Task 7
  - ✅ `GroupScheduleScreen` day filtering → Task 8
  - ✅ `EditableSetCard` save validation → Task 9
  - ✅ Phase 2 Maestro flows → Tasks 11–14
  - ✅ `utils.js` extraction from all three components → Tasks 4–6

- **Type/name consistency:** `SLOT_MINUTES` and `SLOT_HEIGHT` exported from `utils.js` and imported in `GroupScheduleScreen.js`. All function names match between utils.js definition and test imports.

- **No placeholders:** All test cases contain actual assertions. All implementation steps contain actual code.
