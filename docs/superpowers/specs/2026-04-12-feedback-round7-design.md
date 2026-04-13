# Feedback Round 7 — Design Spec

## Overview

Seven independent improvements:

1. **Festival Days helper text** — add example day names
2. **Founder onboarding: Upload Official Schedule step** — let founders import the full lineup during setup, instead of discovering the option only in Founder Tools post-onboarding
3. **Member onboarding: Official Lineup intro screen** — when the official schedule is already imported, show members a choice screen before personal screenshot uploads, defaulting to going straight to the grid
4. **Back navigation on every onboarding step** — every step after `welcome` has a back button with correct target
5. **Full reset on "Reset App"** — require online connection and delete backend data before clearing local state
6. **Fix skip-day spinner** — don't auto-fire `finishUploadFlow` when all days are idle (no personal screenshots were uploaded)
7. **Founder Tools: partial upload failure display** — show which days succeeded and which failed so founders don't re-upload everything

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

If the response has `sets_created === 0` and `days_processed` is empty or missing, treat it as an error (set `onboardingLineupState = 'error'`) rather than a misleading "done" with nothing imported. Otherwise set `done` — partial success is a valid done state and the UI handles the warning display.

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

**Done state (full success — all festival days appear in `days_processed`):**
- Success text: "✓ {sets_created} sets imported across {days_processed.join(', ')}"
- Primary button: "Go to Group Schedule →" → `onFinishSetup`

**Done state (partial success — some festival days missing from `days_processed`):**
- Success text: "✓ {sets_created} sets imported across {days_processed.join(', ')}"
- Warning text (amber/yellow): "Couldn't read: {missingDays.join(', ')}. Re-upload those days from Founder Tools after setup."
- Primary button: "Go to Group Schedule →" → `onFinishSetup` (still allow proceed — some sets are better than none)

`missingDays` is computed client-side: `festivalDays.map(d => d.label).filter(label => !days_processed.includes(label))`. If `days_processed` is empty or missing, fall through to the error state instead.

The partial-success case is still `onboardingLineupState = 'done'` — not `error`. `error` is only set when the API throws (i.e. `all_images_failed` or a network/server failure).

No secondary option in either done variant — members can add personal picks by double-tapping from the grid.

**Error state:**
- Error text in red
- Helper text: "You can retry this after setup from Founder Tools → Official Lineup."
- Button: "Try Again" → `onImportOfficialSchedule`
- Button: "Skip for Now" → `onSkipOfficialSchedule` (proceeds to personal screenshot uploads)

**Idle state "skip" copy update:**

Change "Skip — I'll do this later" to "Skip for Now — upload from Founder Tools after setup" so the path is clear even from the idle state.

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

### Key constraint: session boundary

Once a session is created on the backend (`completeFestivalSetup` for founders, `beginProfile` join path for members), going back to pre-session steps (`festival_setup`, `profile_create`, `profile_join`) creates a trap: the Reset App button doesn't appear until post-onboarding, quitting and reopening just restores the session from AsyncStorage, and re-submitting the form returns "already in group." The user would be stuck.

**Rule:** Back navigation navigates freely *within* the upload flow. At the first upload step (no prior upload step exists), the back button is replaced by a small **"Start over"** destructive link that triggers a confirmation + `resetFlow`.

### Back target per step

| Step | Back button shows | Back target |
|---|---|---|
| `upload_official_schedule` | "Start over" (destructive link) | `resetFlow` with confirmation |
| `member_lineup_intro` | "Start over" (destructive link) | `resetFlow` with confirmation |
| `upload_all_days` day 1, founder | `← Back` | `upload_official_schedule` |
| `upload_all_days` day 1, member w/ lineup | `← Back` | `member_lineup_intro` |
| `upload_all_days` day 1, member w/o lineup | "Start over" (destructive link) | `resetFlow` with confirmation |
| `upload_all_days` day N > 1 | `← Back` | previous day |
| `review_days` | `← Back` | last day of `upload_all_days` |

### "Start over" behavior

A small text-style link at the bottom of the step (not a full button) reading **"Start over"**. On press, shows an Alert:

```
"Start Over?"
"This will delete your group and restart onboarding. You need an internet connection to do this."
[Cancel]  [Start Over]
```

On confirm → calls `resetFlow` (which already handles offline blocking and backend DELETE).

### Implementation

`SetupScreen` receives two props:

```js
onGoBack,      // () => void  — used when ← Back is shown (upload flow navigation)
onStartOver,   // () => void  — used when "Start over" link is shown (triggers resetFlow alert)
```

Each upload step renders either `<ActionButton label="← Back" onPress={onGoBack} />` or a small `<StartOverLink onPress={onStartOver} />` as appropriate.

`StartOverLink` is a minimal inline component — just a `<Pressable>` with small muted text style, not an `ActionButton`.

`handleOnboardingBack` in App.js (for `← Back` cases only):

```js
const handleOnboardingBack = () => {
  if (onboardingStep === 'upload_all_days') {
    const currentIdx = festivalDays.findIndex((d) => d.dayIndex === uploadDayIndex);
    if (currentIdx > 0) {
      setUploadDayIndex(festivalDays[currentIdx - 1].dayIndex);
    } else if (userRole === 'founder') {
      setOnboardingStep('upload_official_schedule');
    } else {
      // member with lineup — day 1 back goes to member_lineup_intro
      setOnboardingStep('member_lineup_intro');
    }
  } else if (onboardingStep === 'review_days') {
    setUploadDayIndex(festivalDays[festivalDays.length - 1]?.dayIndex ?? 1);
    setOnboardingStep('upload_all_days');
  }
};
```

`handleStartOver` in App.js:

```js
const handleStartOver = () => {
  Alert.alert(
    'Start Over?',
    'This will delete your group and restart onboarding. You need an internet connection to do this.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start Over', style: 'destructive', onPress: resetFlow },
    ],
  );
};
```

### Tests

- `upload_official_schedule` renders "Start over" link (not ← Back); pressing it calls `onStartOver`
- `member_lineup_intro` renders "Start over" link; pressing it calls `onStartOver`
- `upload_all_days` day 1 (founder) renders `← Back`; pressing calls `onGoBack`
- `upload_all_days` day 1 (member, no lineup) renders "Start over" link; pressing calls `onStartOver`
- `upload_all_days` day N > 1 renders `← Back`; pressing calls `onGoBack`
- `review_days` renders `← Back`; pressing calls `onGoBack`

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

- Renders "Import Official Schedule" title and "Upload Schedule Images" + skip button when `onboardingLineupState === 'idle'`
- Renders "Start over" link (not `← Back`); pressing calls `onStartOver`
- Renders spinner and help text when `onboardingLineupState === 'uploading'`
- Renders success text and "Go to Group Schedule →" button (no secondary) when `onboardingLineupState === 'done'` and all festival days are in `days_processed`
- Renders success text + amber warning listing missing days when `onboardingLineupState === 'done'` and some festival days are absent from `days_processed`
- Calls `onImportOfficialSchedule` when "Upload Schedule Images" is pressed
- Calls `onSkipOfficialSchedule` when skip button is pressed (idle state)
- Calls `onFinishSetup` when "Go to Group Schedule →" is pressed (done state)
- Renders error message with retry/skip buttons AND "You can retry from Founder Tools after setup" helper text when `onboardingLineupState === 'error'`

### New tests (SetupScreen.test.js — `member_lineup_intro` describe block)

- Renders "Schedule is Ready" title
- Renders "Go to Group Schedule →" as primary button
- Renders "Upload my own screenshots →" as secondary button
- Calls `onFinishSetup` when primary button is pressed
- Calls `onSkipMemberLineupIntro` when secondary button is pressed
- Renders "Start over" link (not `← Back`); pressing calls `onStartOver`

### Updated tests (SetupScreen.test.js — `festival_setup` describe block)

- Add assertion that helper text includes `(e.g. "Friday", "Saturday", "Sunday")`

### New tests (App.js integration — `resetFlow`)

- These are harder to unit test in Jest (due to API mocking complexity). Add a code comment noting the behavior and test manually.

### New tests (FounderToolsScreen.test.js — partial failure)

- Renders success text with no warning when all festival days are in `lineupImportResult.days_processed`
- Renders amber warning listing missing days when some festival days are absent from `days_processed`
- Does not render a warning when `lineupImportResult` is null

---

## 7. Founder Tools: Partial Upload Failure Display

### Problem

`FounderToolsScreen` currently shows `lineupImportResult.sets_created` and `lineupImportResult.days_processed` in a success box after upload. It has no concept of partial failure — if Saturday failed to parse but Friday and Sunday succeeded, the founder only sees "✓ N sets imported across Friday, Sunday" with no indication that Saturday is missing. They'd have to remember which days they uploaded and notice the gap themselves.

### Solution

Apply the same partial failure logic as the onboarding `upload_official_schedule` step:

1. Pass `festivalDays` as a new prop to `FounderToolsScreen`
2. After a `done` upload, compute `missingDays = festivalDays.map(d => d.label).filter(label => !(days_processed || []).includes(label))`
3. If `missingDays.length > 0`, render an amber warning below the success box: "Couldn't read: {missingDays.join(', ')}. Re-upload just those images to add the missing days."

### Changes

**`FounderToolsScreen.js`** — add `festivalDays` prop and partial-failure warning:

```jsx
// New prop: festivalDays = [{ dayIndex, label }]
// Compute inside the component:
const missingDays = useMemo(() => {
  if (!lineupImportResult?.days_processed) return [];
  return (festivalDays || [])
    .map((d) => d.label)
    .filter((label) => !lineupImportResult.days_processed.includes(label));
}, [festivalDays, lineupImportResult]);
```

In the `done` block, after the existing `successBox`, add:

```jsx
{missingDays.length > 0 ? (
  <View style={styles.warningBox}>
    <Text style={styles.warningText}>
      Couldn't read: {missingDays.join(', ')}. Re-upload just those images to add the missing days.
    </Text>
  </View>
) : null}
```

New styles:
```js
warningBox: {
  backgroundColor: C.warningBg || '#fffbeb',
  borderRadius: 8,
  padding: 10,
  borderWidth: 1,
  borderColor: C.warningBorder || '#fcd34d',
},
warningText: { color: C.warning || '#92400e', fontWeight: '600', fontSize: 13 },
```

**`App.js`** — pass `festivalDays` to `FounderToolsScreen`:

```jsx
<FounderToolsScreen
  ...
  festivalDays={festivalDays}
/>
```

### Existing stats box (idle state with lineup already imported)

The `officialLineupStats` box also shows `days` — e.g. "✓ 163 sets across Friday, Saturday, Sunday". No change needed here since it reflects what's actually in the database, not the result of a specific upload attempt. If a day was never imported, it simply won't appear.
