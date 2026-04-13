# Feedback Round 7 — Design Spec

## Overview

Six independent improvements:

1. **Festival Days helper text** — add example day names
2. **Founder onboarding: Upload Official Schedule step** — let founders import the full lineup during setup, instead of discovering the option only in Founder Tools post-onboarding
3. **Member onboarding: Official Lineup intro screen** — when the official schedule is already imported, show members a choice screen before personal screenshot uploads, defaulting to going straight to the grid
4. **Back navigation on every onboarding step** — every step after `welcome` has a back button with correct target
5. **Full reset on "Reset App"** — require online connection and delete backend data before clearing local state
6. **Fix skip-day spinner** — don't auto-fire `finishUploadFlow` when all days are idle (no personal screenshots were uploaded)

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
- Primary button: "Go to Group Schedule →" → `onFinishSetup` (calls `finishUploadFlow`, skips personal screenshot steps)
- No secondary option — members can add personal picks by double-tapping from the grid

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

## 3. Member Onboarding: Official Lineup Intro Screen

### Problem

When a member joins a group that already has an official schedule imported (the founder did it during onboarding), the member is immediately dropped into the per-day personal screenshot upload flow. There's no explanation that they can skip all that and just go to the grid to double-tap artists. The default action should be "go to the grid" — not "upload screenshots."

### Solution

Insert a new onboarding step, `member_lineup_intro`, between `upload_all_days`'s first-day display and the member's personal screenshot prompts. This step is shown **only when** `hasOfficialLineup` is true at the time the member enters `upload_all_days`.

#### When to show it

In `App.js`, when `onboardingStep` transitions to `'upload_all_days'` for a member (inside `beginProfile` for the join path, after fetching home data), check if `hasOfficialLineup` is already true. If so, set `onboardingStep = 'member_lineup_intro'` instead.

Specifically in the join path in `beginProfile`:
```js
const firstDay = (homePayload.festival_days || [{ day_index: 1 }])[0];
setUploadDayIndex(firstDay.day_index);
setDayStates({});
// Show intro screen if official lineup exists, else go straight to personal screenshots
if (homePayload.group?.has_official_lineup) {
  setOnboardingStep('member_lineup_intro');
} else {
  setOnboardingStep('upload_all_days');
}
```

#### Screen UI (`member_lineup_intro` step in SetupScreen.js)

- Title: "Schedule is Ready"
- Helper: "The official lineup has been imported — you can browse every artist and tap to add them to your picks right from the group grid."
- **Primary button (default path):** "Go to Group Schedule →" → `onFinishSetup` (calls `finishUploadFlow` directly)
- **Secondary button:** "Upload my own screenshots →" → `onSkipMemberLineupIntro` (sets `onboardingStep = 'upload_all_days'`)
- Small subtext below secondary: "You can always upload screenshots later from the My Schedule tab."

#### Props added to SetupScreen

```js
onSkipMemberLineupIntro,   // () => void — advances to upload_all_days
// onFinishSetup already defined above (reused)
```

#### New handler in App.js

```js
const skipMemberLineupIntro = () => {
  setOnboardingStep('upload_all_days');
};
```

---

## 5. Full Reset on "Reset App"

### Problem

`resetFlow` only clears local state and AsyncStorage. The backend group (with imported official lineup, member data, etc.) persists. On re-onboarding, the user may end up back in the old group with stale data. There is no way to queue the backend deletion to fire when service is restored, since the mutation queue only runs while the app is open.

### Solution

**Require an active internet connection to reset.** If offline, show an alert: "You're offline. Connect to the internet to fully reset the app." Do not proceed.

If online and a session exists, call `DELETE /v1/members/me` (same as "Delete My Data") before clearing local state. If the API call fails for any reason other than being offline (e.g. server error), proceed with local reset anyway — the user can re-attempt the delete via "Delete My Data" later.

### Updated `resetFlow`

```js
const resetFlow = async () => {
  if (memberSession) {
    if (!isOnline) {
      Alert.alert(
        'You\'re Offline',
        'Connect to the internet to fully reset the app. This ensures your data is deleted from the server.',
      );
      return; // do NOT proceed with reset while offline
    }
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me',
        method: 'DELETE',
        sessionToken: memberSession,
        body: { confirm: true },
      });
    } catch (_err) {
      // Backend deletion failed (server error) — proceed with local reset anyway.
      // User can clean up via "Delete My Data" if needed.
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

Note: If the user has no active session (already logged out / never onboarded), the reset proceeds immediately with no API call.

---

## 4. Back Navigation for Every Onboarding Step

### Current State

Steps `profile_create`, `profile_join`, and `festival_setup` already have back buttons. Every step from `upload_official_schedule` onward has none.

### Back Target Per Step

| Step | Back target | Handler |
|---|---|---|
| `upload_official_schedule` | `festival_setup` | `setOnboardingStep('festival_setup')` |
| `member_lineup_intro` | `profile_join` | `setOnboardingStep('profile_join')` (session stays alive; re-join attempt shows "already in group" if they retry) |
| `upload_all_days` day 1, founder | `upload_official_schedule` | `setOnboardingStep('upload_official_schedule')` |
| `upload_all_days` day 1, member w/ lineup | `member_lineup_intro` | `setOnboardingStep('member_lineup_intro')` |
| `upload_all_days` day 1, member w/o lineup | `profile_join` | `setOnboardingStep('profile_join')` |
| `upload_all_days` day N > 1 | previous day | `setUploadDayIndex(festivalDays[currentIdx - 1].dayIndex)` |
| `review_days` | last day of `upload_all_days` | `setUploadDayIndex(festivalDays[festivalDays.length - 1].dayIndex); setOnboardingStep('upload_all_days')` |

### Implementation

Add a single `onGoBack` prop to `SetupScreen`. App.js computes the correct back action and passes it. Each step renders `<ActionButton label="← Back" onPress={onGoBack} disabled={loading} />` as its first child.

The `onGoBack` computation in App.js (derived value, not state):

```js
const handleOnboardingBack = () => {
  if (onboardingStep === 'upload_official_schedule') {
    setOnboardingStep('festival_setup');
  } else if (onboardingStep === 'member_lineup_intro') {
    setOnboardingStep('profile_join');
  } else if (onboardingStep === 'upload_all_days') {
    const currentIdx = festivalDays.findIndex((d) => d.dayIndex === uploadDayIndex);
    if (currentIdx > 0) {
      setUploadDayIndex(festivalDays[currentIdx - 1].dayIndex);
    } else if (userRole === 'founder') {
      setOnboardingStep('upload_official_schedule');
    } else if (homeSnapshot?.group?.has_official_lineup) {
      setOnboardingStep('member_lineup_intro');
    } else {
      setOnboardingStep('profile_join');
    }
  } else if (onboardingStep === 'review_days') {
    setUploadDayIndex(festivalDays[festivalDays.length - 1]?.dayIndex ?? 1);
    setOnboardingStep('upload_all_days');
  }
};
```

Pass as `onGoBack={handleOnboardingBack}` to `SetupScreen`. The `welcome` step has no back button (it's the root).

### Tests

- `upload_official_schedule` renders a back button; pressing it calls `onGoBack`
- `member_lineup_intro` renders a back button; pressing it calls `onGoBack`
- `upload_all_days` renders a back button; pressing it calls `onGoBack`
- `review_days` renders a back button; pressing it calls `onGoBack`

---

## 6. Fix Skip-Day Spinner

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
                    ├─► [upload + "Go to Group Schedule →"] → group view
                    └─► [skip] upload_all_days
                              └─► review_days
                                    └─► [› button] → group view
```

### New Member Onboarding Flow (when official lineup exists)

```
welcome
  └─► profile_join
        └─► [beginProfile API, hasOfficialLineup=true] member_lineup_intro  ← NEW
              ├─► [primary: "Go to Group Schedule →"] → group view
              └─► [secondary: "Upload my own screenshots →"] upload_all_days
                        └─► review_days
                              └─► [› button] → group view
```

### Member Onboarding Flow (no official lineup — unchanged)

```
welcome
  └─► profile_join
        └─► [beginProfile API, hasOfficialLineup=false] upload_all_days
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
- Renders success text and "Go to Group Schedule →" button (no secondary) when `onboardingLineupState === 'done'`
- Calls `onImportOfficialSchedule` when "Upload Schedule Images" is pressed
- Calls `onSkipOfficialSchedule` when "Skip — I'll do this later" is pressed (idle state)
- Calls `onFinishSetup` when "Go to Group Schedule →" is pressed (done state)
- Renders error message and retry/skip buttons when `onboardingLineupState === 'error'`

### New tests (SetupScreen.test.js — `member_lineup_intro` describe block)

- Renders "Schedule is Ready" title
- Renders "Go to Group Schedule →" as primary button
- Renders "Upload my own screenshots →" as secondary button
- Calls `onFinishSetup` when primary button is pressed
- Calls `onSkipMemberLineupIntro` when secondary button is pressed

### Updated tests (SetupScreen.test.js — `festival_setup` describe block)

- Add assertion that helper text includes `(e.g. "Friday", "Saturday", "Sunday")`

### New tests (App.js integration — `resetFlow`)

- These are harder to unit test in Jest (due to API mocking complexity). Add a code comment noting the behavior and test manually.
