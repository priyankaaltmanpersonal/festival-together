# Quick-Add to Schedule from Group Grid
**Date:** 2026-04-03  
**Status:** Approved

## Goal

From the group schedule grid, a user taps any set to see the existing detail modal. If they don't have that set on their own schedule, a single "Add to My Schedule" button lets them add it as "maybe" without leaving the modal. If they're already attending, the modal shows their current preference instead.

## Data Model

The group schedule response already includes `day_index` on every set (confirmed in `services/api/app/api/schedule.py`). `homeSnapshot.me.id` identifies the current user. `expandedSet.attendees` is an array of `{ member_id, preference, display_name, chip_color }`.

**Is-attending check:** `expandedSet.attendees.some(a => a.member_id === homeSnapshot?.me?.id)`

## UI — Two Modal States

### State 1: Not on schedule
Below the "Maybe" attendee list, separated by a thin divider:
- Primary gradient button: **"+ Add to My Schedule"**
- Hint text below: *"Adds as 'maybe' — edit in your schedule to confirm"*

Button states:
- **Default:** orange→amber gradient, glow shadow
- **Loading:** dimmed (opacity 0.6), label "Adding…"
- **Success:** replaced by green pill "✓ Added as maybe!" for 1 second, then modal closes
- **Error:** inline error text below the button (e.g. "Already on your schedule")

### State 2: Already attending
Below the "Maybe" list, separated by a thin divider:
- Warm status pill (non-interactive): **"✓ On your schedule — Maybe"** or **"✓ On your schedule — Must See"**
- Hint text: *"Edit in your schedule to change preference"*

### "(you)" label
In the attendee lists, the current user's row gets a muted "(you)" suffix on their name so they can spot themselves.

## Architecture

### `App.js`
Add a new `addSetFromGrid` callback and pass it to `GroupScheduleScreen`:

```js
const addSetFromGrid = async (setItem) => {
  await addPersonalSet({
    artist_name: setItem.artist_name,
    stage_name: setItem.stage_name,
    start_time_pt: setItem.start_time_pt,
    end_time_pt: setItem.end_time_pt,
    day_index: setItem.day_index,
  });
};
```

`addPersonalSet` already exists, handles the POST, and appends to `personalSets` state with `preference: 'flexible'`. No new API endpoints needed.

### `GroupScheduleScreen.js`
Two new props:
- `myMemberId: string` — passed as `homeSnapshot?.me?.id` from App.js
- `onAddToMySchedule: (setItem) => Promise<void>` — calls `addSetFromGrid`

Inside the modal, after the Maybe section:
1. Compute `myAttendance = expandedSet.attendees.find(a => a.member_id === myMemberId)`
2. If `myAttendance` is undefined → render the Add button with local `adding` / `added` / `addError` state
3. If `myAttendance` exists → render the status pill with their preference label

Local state for the button (inside the modal render, not component-level):
```js
const [adding, setAdding] = useState(false);
const [added, setAdded] = useState(false);
const [addError, setAddError] = useState('');
```

On success: set `added = true`, wait 1000ms, then call `setExpandedSet(null)` to close.

### `AttendeeRow` (existing component)
Add optional `isSelf` prop. When true, append `" (you)"` in muted color to the name.

## Error Handling

- `already_in_schedule` from the API: show inline "Already on your schedule" (shouldn't occur since we check first, but handle defensively)
- Network errors: show the error message inline below the button; button returns to default state so user can retry
- No offline queueing — `addPersonalSet` is online-only; show an appropriate error if offline

## What Does NOT Change

- The modal open/close behavior
- The "Definitely" and "Maybe" section rendering
- The grid layout, filters, or any other screen
- The backend — no new endpoints needed
