# Feedback Round 7 — Design Spec

## Overview

Four independent improvements:

1. **Festival Days helper text** — add example day names
2. **Founder onboarding: Upload Official Schedule step** — let founders import the full lineup during setup, instead of discovering the option only in Founder Tools post-onboarding
3. **Full reset on "Reset App"** — delete backend data before clearing local state
4. **Fix skip-day spinner** — don't auto-fire `finishUploadFlow` when all days are idle (no personal screenshots were uploaded)

---

## 1. Festival Days Helper Text

**File:** `apps/mobile/src/screens/SetupScreen.js` line 123

Change:
```
Add each day of the festival you're attending.
```
To:
```
Add each day of the festival you're attending (e.g. "Friday", "Saturday", "Sunday").
```

---

## 2. Founder Onboarding: `upload_official_schedule` Step

### Problem

The founder currently has no in-onboarding path to import the official schedule. They must skip through all per-day personal-screenshot prompts (confusing), reach the main grid (empty), then find Founder Tools to do the import they should have been guided to first.

### Solution

Insert a new onboarding step, `upload_official_schedule`, between `festival_setup` (group created) and `upload_all_days` (personal screenshots). This step is **founder-only** — members never see it.

### State Changes (App.js)

Add:
```js
const [onboardingLineupState, setOnboardingLineupState] = useState('idle');
// 'idle' | 'uploading' | 'done' | 'error'
const [onboardingLineupResult, setOnboardingLineupResult] = useState(null);
// { sets_created, days_processed } — same shape as lineupImportResult
```

Persist `onboardingLineupState` and `onboardingLineupResult` in `saveAppState` / `loadAppState`.

### Step Transition

In `completeFestivalSetup`, after creating the group, change:
```js
setOnboardingStep('upload_all_days');
```
to:
```js
setOnboardingStep('upload_official_schedule');
```

### New Handler: `importOfficialScheduleDuringOnboarding`

```js
const importOfficialScheduleDuringOnboarding = async () => {
  try {
    const uris = await pickImages(3);
    if (!uris) return;
    setOnboardingLineupState('uploading');
    const result = await uploadImages(
      apiUrl,
      `/v1/groups/${groupId}/lineup/import`,
      memberSession,
      uris,
    );
    setOnboardingLineupResult(result);
    setOnboardingLineupState('done');
    // Refresh home snapshot so hasOfficialLineup becomes true
    const homePayload = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/home',
      method: 'GET',
      sessionToken: memberSession,
    });
    setHomeSnapshot(homePayload);
  } catch (err) {
    setOnboardingLineupState('error');
    setError(friendlyError(err instanceof Error ? err.message : String(err)));
  }
};
```

Note: this does NOT use `run()` so it manages its own loading state via `onboardingLineupState` rather than the global `loading` flag.

### New Handler: `proceedToPersonalSchedule`

```js
const proceedToPersonalSchedule = () => {
  setOnboardingLineupState('idle');
  setOnboardingStep('upload_all_days');
};
```

### Screen UI (`upload_official_schedule` step in SetupScreen.js)

**Idle state (before upload):**
- Title: "Import Official Schedule"
- Helper: "Upload the official day poster(s) so everyone in your group can browse and pick artists — no screenshots needed."
- Primary button: "Upload Schedule Images" → `onImportOfficialSchedule`
- Secondary button: "Skip — I'll do this later" → `onSkipOfficialSchedule` (advances to `upload_all_days`)

**Uploading state:**
- ActivityIndicator + "Importing lineup… this may take 1–2 minutes. Please keep the app open."
- No buttons (disabled)

**Done state:**
- Success text: "✓ {result.sets_created} sets imported across {result.days_processed.join(', ')}"
- Primary button: "Go to Group Schedule →" → `onFinishSetup` (calls `finishUploadFlow`)
- Secondary button: "Also mark my picks →" → `onSkipOfficialSchedule` (advances to `upload_all_days`, where `hasOfficialLineup` is now true so "Browse Full Lineup" is primary)

**Error state:**
- Error text in red
- Button: "Try Again" → `onImportOfficialSchedule`
- Button: "Skip" → `onSkipOfficialSchedule`

### Props Added to SetupScreen

```js
// upload_official_schedule step
onboardingLineupState,        // 'idle' | 'uploading' | 'done' | 'error'
onboardingLineupResult,       // { sets_created, days_processed } | null
onImportOfficialSchedule,     // () => void
onSkipOfficialSchedule,       // () => void — advances to upload_all_days
onFinishSetup,                // () => void — calls finishUploadFlow
```

---

## 3. Full Reset on "Reset App"

### Problem

`resetFlow` only clears local state and AsyncStorage. The backend group (with imported official lineup, member data, etc.) persists. On re-onboarding, the user may end up back in the old group with stale data.

### Solution

When `resetFlow` is called with an active session (`memberSession` is set) and the app is online, call `DELETE /v1/members/me` first (same endpoint as "Delete My Data"), which removes the member and — if no other members remain — the group. Then proceed with local reset regardless of API outcome.

### Updated `resetFlow`

```js
const resetFlow = async () => {
  // If we have a live session, delete backend data first
  if (memberSession && isOnline) {
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me',
        method: 'DELETE',
        sessionToken: memberSession,
        body: { confirm: true },
      });
    } catch (_err) {
      // best-effort — proceed with local reset regardless
    }
  }
  await clearSessionData(true);
  setUserRole('member');
  setDisplayName('');
  setGroupName('');
  setInviteCodeInput('');
  setScreenshotCount('3');
  setOnboardingStep('welcome');
  setActiveView('onboarding');
  setMoreSheetOpen(false);
  setSelectedChipColor(CHIP_COLOR_OPTIONS[0]);
  setAvailableJoinColors([]);
  setFestivalDays([{ dayIndex: 1, label: '' }]);
  setUploadDayIndex(1);
  setDayStates({});
  setOnboardingLineupState('idle');
  setOnboardingLineupResult(null);
  setError('');
  setLog(['Reset: onboarding restarted']);
};
```

This is best-effort: if offline or the DELETE fails, the local reset still happens. A warning comment explains why.

---

## 4. Fix Skip-Day Spinner

### Problem

When a founder skips all personal-screenshot days, the app reaches `review_days`. Because all days have `status: 'idle'`, `allDaysReady` is immediately `true`, which triggers the `useEffect` auto-firing `finishUploadFlow`. The user sees a spinner appear and disappear without explanation before landing on the grid.

### Root Cause

The `allDaysReady` memo includes `status === 'idle'` as a "ready" state:
```js
return state.status === 'idle' || (state.status === 'done' && state.confirmed);
```

This was intended so days with no screenshots are treated as ready, but the consequence is all-skipped sessions auto-advance silently.

### Fix

Only auto-advance when at least one day has actual content (`done` status). If all days are `idle` (nothing uploaded), don't auto-fire — let the user press the `›` header button (which calls `handleContinueFromReview`) to finish deliberately.

Change the `allDaysReady` memo condition:
```js
const allDaysReady = useMemo(
  () =>
    onboardingStep === 'review_days' &&
    festivalDays.length > 0 &&
    festivalDays.some((day) => (dayStates[day.dayIndex] || {}).status === 'done') &&
    festivalDays.every((day) => {
      const state = dayStates[day.dayIndex] || { status: 'idle' };
      return state.status === 'idle' || (state.status === 'done' && state.confirmed);
    }),
  [onboardingStep, festivalDays, dayStates]
);
```

The added `.some(...)` guard means auto-advance only fires when at least one day was successfully processed. All-skipped paths reach `review_days` and stay there until the user presses `›`.

> Note: With the new `upload_official_schedule` step, founders who upload the official schedule will hit "Go to Group Schedule →" directly from that step, bypassing `upload_all_days` and `review_days` entirely. This fix primarily helps edge cases (founders who skip official schedule AND all personal days) and non-founder members who skip all days.

---

## Data Flow Summary

### New Founder Onboarding Flow

```
welcome
  └─► profile_create
        └─► [beginProfile API] festival_setup
              └─► [completeFestivalSetup API] upload_official_schedule  ← NEW
                    ├─► [upload + finish] → group view
                    └─► [skip] upload_all_days
                              └─► review_days
                                    └─► [› button] → group view
```

### State Persistence

`onboardingLineupState` and `onboardingLineupResult` are persisted so an interrupted upload can show the done/error state on reopen.

---

## Testing

### New tests (SetupScreen.test.js — `upload_official_schedule` describe block)

- Renders "Import Official Schedule" title and "Upload Schedule Images" + "Skip" buttons when `onboardingLineupState === 'idle'`
- Renders spinner and help text when `onboardingLineupState === 'uploading'`
- Renders success text and "Go to Group Schedule →" + "Also mark my picks →" buttons when `onboardingLineupState === 'done'`
- Calls `onImportOfficialSchedule` when "Upload Schedule Images" is pressed
- Calls `onSkipOfficialSchedule` when "Skip" is pressed (idle state)
- Calls `onFinishSetup` when "Go to Group Schedule →" is pressed (done state)
- Calls `onSkipOfficialSchedule` when "Also mark my picks →" is pressed (done state)

### Updated tests (SetupScreen.test.js — `festival_setup` describe block)

- Existing `festival_setup` tests still pass with the updated helper text

### New tests (App.js integration — describe `resetFlow`)

- These are harder to unit test in Jest (due to API mocking complexity). Add a comment in the code noting the behavior and test manually.

### Updated tests (SetupScreen.test.js — `festival_setup`)

- `festival_setup` helper text now includes `(e.g. "Friday", "Saturday", "Sunday")` — update any snapshot or text assertions that checked the old string.
