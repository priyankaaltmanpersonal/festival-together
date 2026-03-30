# Async Upload + Tabbed Day Review — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Problem

The current setup flow uploads and parses one day at a time, blocking the user for 10–15 seconds per day. For a 3-day festival, this means 30–45 seconds of idle waiting spread across the setup flow.

## Goal

Overlap the upload/parse time across days so the user experiences minimal idle waiting. Also unify the day-by-day schedule view between setup and the post-onboarding edit screen.

## Approach

Pure client-side: no backend changes. The existing `POST /v1/members/me/personal/upload` endpoint is called concurrently for each day — the mobile fires each upload immediately after the user picks a screenshot, without waiting for the previous day's result.

---

## New Component: `DayTabReview`

A shared component used in both the setup review step and `EditMyScheduleScreen`.

**Props:**
- `festivalDays` — `[{ dayIndex, label }]`
- `dayStates` — `{ [dayIndex]: { status, sets, retryCount, imageUri } }`
- `onRetry(dayIndex)`
- `onDeleteSet(canonicalSetId)`
- `onAddSet(fields)`
- `onSetPreference(canonicalSetId, preference)`

**Per-tab states:**
- `loading` — spinner + "Analyzing your schedule…"
- `done` — list of `EditableSetCard` + "+ Add Artist"
- `failed`, retryCount < 3 — error + "Retry Upload" + "Add Manually"
- `failed`, retryCount ≥ 3 — error + "Add Manually" only

---

## Setup Flow Changes

### Replaced: `upload_day` step → `upload_all_days` + `review_days`

**`upload_all_days`:**
- Shows one day at a time: "Upload Friday", "Upload Saturday", "Upload Sunday"
- User picks a screenshot → upload fires immediately (non-blocking) → app immediately shows next day's pick screen
- Each day can also be skipped
- After the last day is picked or skipped, transition to `review_days`

**`review_days`:**
- Renders `DayTabReview`
- Days whose uploads are still in flight show a spinner
- Days that finish while the user is reviewing update reactively (no polling)
- "Finish →" button is enabled once no day has `status === 'loading'` (all are done, failed, or skipped)

### State changes in `App.js`

Replace:
```
uploadDayIndex, dayUploadStatus, dayParsedSets
```
With:
```js
dayStates: { [dayIndex]: { status: 'idle'|'uploading'|'done'|'failed', sets: [], retryCount: 0, imageUri: null } }
```

Retry: re-fires upload using stored `imageUri` for that day; increments `retryCount` on failure.

---

## `EditMyScheduleScreen` Changes

Replace the flat `personalSets` list with `DayTabReview`. Sets are grouped by `day_index` client-side. All days start in `done` state (no loading states needed). Existing "Upload + Re-Parse" and manual add functionality remain.

---

## Error Handling

- Per-day failures do not affect other days
- Retry up to 3 times per day; manual entry available from the first failure
- App-backgrounding during upload: existing behavior (error state shown on resume, user retries)

## Testing

- Upload 3 days quickly; verify all 3 fire concurrently and results appear as each resolves
- Background the app mid-upload; verify error state on resume and retry works
- Simulate a parse failure; verify retry counter increments and manual entry appears
- Verify `EditMyScheduleScreen` tab bar groups sets correctly by day
