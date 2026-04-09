# TestFlight Feedback Fixes — 2026-04-06

## Overview

Eight issues from TestFlight testing, seven bug fixes and one new feature (day navigation for the group schedule).

---

## 1. Profile edits not reflected in grid

**Bug:** Changing chip color or display name via Edit Profile updates `homeSnapshot` but not `scheduleSnapshot`. The grid reads attendee colors/initials from `scheduleSnapshot.sets[].attendees[]`, so changes don't appear until the next manual refresh.

**Fix:** In `updateProfile` (App.js), after saving the profile and refreshing `homeSnapshot`, also call `fetchSchedule` to refresh `scheduleSnapshot`. Use the existing `refreshCoreSnapshots` helper which fetches both in parallel.

---

## 2. Keyboard covers display name input in Edit Profile

**Bug:** The MoreSheet is a bottom-sheet Modal. When the keyboard opens over the display name TextInput, it covers the input field with no scroll or push-up behavior.

**Fix:** Wrap the sheet's inner `Pressable` content in a `KeyboardAvoidingView` with `behavior="padding"` (iOS). This pushes the sheet content up when the keyboard appears.

---

## 3. Global error from background upload shows on wrong day

**Bug:** When a day's screenshot upload fails in `chooseAndUploadDayScreenshot`, `setError(friendlyError(msg))` is called globally. This error persists into the `review_days` step and shows under whichever tab is active (Friday), even though it was Saturday that failed. The per-day `status: 'failed'` in `dayStates` already shows the correct per-day error in DayTabReview.

**Fix:** Remove `setError(friendlyError(msg))` from the `.catch()` handler in `chooseAndUploadDayScreenshot` and `retryDayUpload`. The DayTabReview `failedBlock` handles the error display per-day.

---

## 4. Edit forms for parsed sets need time pickers

**Bug:** `EditableSetCard` uses plain `TextInput` for start/end times (HH:MM text entry). The `AddArtistForm` in `DayTabReview` was already updated to use `DateTimePicker`. The edit form was missed.

**Fix:** Add the same `DateTimePicker` time-picker pattern to `EditableSetCard`'s editing state: replace the two time TextInputs with pressable time buttons + inline `DateTimePicker` (same code pattern as `AddArtistForm` in `DayTabReview.js`). Store time as `Date` objects internally, serialize to `HH:MM` on save.

---

## 5. "Finish" in review_days skips unreviewed days without warning

**Bug:** In `review_days`, the Finish button is visible immediately on the first tab. Users can tap it before checking other tabs, jumping straight to the group schedule.

**Fix:** When the user taps Finish and any day has `status: 'failed'`, show an `Alert` confirmation: "One or more days failed to parse. You can still finish — those days just won't have any sets. Continue?" with Cancel and Continue buttons. Days with `status: 'idle'` were intentionally skipped and don't need a warning. If no days are `failed`, proceed immediately.

---

## 6. Grid doesn't refresh after "Add to my schedule"

**Bug:** `addSetFromGrid` adds to `personalSets` optimistically but doesn't update `scheduleSnapshot`. The grid card still shows the old attendee count (e.g. "0 Definitely, 0 Maybe") after the modal closes.

**Fix:** After `addSetFromGrid` succeeds, call `refreshCoreSnapshots()` to fetch fresh `homeSnapshot` and `scheduleSnapshot` from the server.

---

## 7. Refresh icon in group schedule header

**New:** Add a circular arrow refresh icon (↻) to the right side of the header when `activeView === 'group'`. Tapping it calls `refreshCoreSnapshots()`. Show a loading spinner in place of the icon while refreshing.

**Implementation:** Add a refresh `Pressable` to the right side of the header `View` in App.js, rendered only when `activeView === 'group'`. Reuse the existing `loading` state for the spinner.

---

## 8. Group schedule only shows one day — add day navigation

**New:** The group schedule currently shows all sets without day filtering, but `scheduleSnapshot.sets[]` includes a `day_index` field. Add a segmented control (Option C) to switch between days.

**Design:** iOS-style pill selector placed between the invite row and member chips in `GroupScheduleScreen`. Active day has a white raised pill on a warm beige background. All day labels visible simultaneously.

**Data:** Filter sets by `selectedDay` state (initialized to the first `day_index` present in the sets). The `festivalDays` array must be passed as a new prop so day labels (e.g. "Friday") are shown instead of raw indices.

**Implementation:**
- Add `selectedDay` state to `GroupScheduleScreen`, defaulting to the first day found in `sets`.
- Add `festivalDays` prop (array of `{ dayIndex, label }`).
- Render the segmented control above the member chips row.
- Filter `sets` and `stageColumns` by `selectedDay` before building the timeline and columns.
- Pass `festivalDays` from App.js.

---

## Out of scope

- No changes to the backend API.
- No changes to individual schedules screen or EditMyScheduleScreen.
