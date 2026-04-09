# TestFlight Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 bugs and add day navigation (segmented control) to the group schedule, based on TestFlight feedback.

**Architecture:** All changes are in the React Native mobile app (`apps/mobile/`). Five files are touched: `App.js` (orchestration/state), `src/screens/GroupScheduleScreen.js` (day selector + grid), `src/components/MoreSheet.js` (keyboard fix), `src/components/EditableSetCard.js` (time pickers), and `src/screens/SetupScreen.js` (finish confirmation). No backend changes.

**Tech Stack:** React Native 0.81, Expo 54, `@react-native-community/datetimepicker` (already installed), no test runner (manual verification).

---

## File Map

| File | Changes |
|------|---------|
| `apps/mobile/App.js` | 1) `updateProfile` → call `refreshCoreSnapshots` after save. 2) `addSetFromGrid` → call `refreshCoreSnapshots` after add. 3) Remove `setError` from background upload `.catch`. 4) Add refresh button to header. 5) Pass `festivalDays` to `GroupScheduleScreen`. 6) Add failed-day confirmation in `finishUploadFlow`. |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Add `selectedDay` state, `festivalDays` prop, segmented control UI, filter sets by day. |
| `apps/mobile/src/components/MoreSheet.js` | Wrap sheet in `KeyboardAvoidingView`. |
| `apps/mobile/src/components/EditableSetCard.js` | Replace time TextInputs with DateTimePicker time buttons. |
| `apps/mobile/src/screens/SetupScreen.js` | No changes needed — finish confirmation is in App.js `finishUploadFlow`. |

---

## Task 1: Fix profile edits not reflecting in group schedule grid

**Files:**
- Modify: `apps/mobile/App.js` — `updateProfile` function (~line 1128)

The bug: `updateProfile` refreshes `homeSnapshot` but not `scheduleSnapshot`. The grid reads `attendee.chip_color` and `attendee.display_name` from `scheduleSnapshot`, so changes are invisible until the next manual refresh.

- [ ] **Step 1: Update `updateProfile` to call `refreshCoreSnapshots`**

Find the `updateProfile` function in `App.js` (around line 1128). Replace it:

```js
const updateProfile = async (newDisplayName, newChipColor) => {
  await apiRequest({
    baseUrl: apiUrl,
    path: '/v1/members/me',
    method: 'PATCH',
    sessionToken: memberSession,
    body: { display_name: newDisplayName, chip_color: newChipColor },
  });
  await refreshCoreSnapshots();
};
```

Note: `refreshCoreSnapshots` already fetches both `homeSnapshot` and `scheduleSnapshot` in parallel and updates both state values — it just needs `sessionRef.current` and `groupIdRef.current` to be set (they will be, since user is logged in).

- [ ] **Step 2: Verify manually**

Build and run. Open More sheet → Edit Profile → change chip color → Save. Confirm the chip color updates immediately in the group schedule grid (attendee bubbles on set cards) without requiring a manual refresh.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile
git add App.js
git commit -m "fix: refresh scheduleSnapshot after profile update so grid reflects new color/name"
```

---

## Task 2: Fix keyboard covering display name input in Edit Profile

**Files:**
- Modify: `apps/mobile/src/components/MoreSheet.js`

The bug: The bottom-sheet Modal has no keyboard avoidance. When the user taps the display name TextInput, the keyboard slides up and covers it.

- [ ] **Step 1: Add `KeyboardAvoidingView` import**

In `MoreSheet.js`, add `KeyboardAvoidingView` and `Platform` to the React Native import:

```js
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
```

- [ ] **Step 2: Wrap the sheet Pressable contents in KeyboardAvoidingView**

Find the inner `<Pressable style={styles.sheet} onPress={() => {}}>` in the `return` block. Wrap its children in a `KeyboardAvoidingView`:

```jsx
<Pressable style={styles.sheet} onPress={() => {}}>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={20}
  >
    <View style={styles.handle} />
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* ... existing content unchanged ... */}
    </ScrollView>
  </KeyboardAvoidingView>
</Pressable>
```

- [ ] **Step 3: Verify manually**

Build and run. Open More sheet → Edit Profile → tap display name field. Confirm the keyboard pushes the sheet up and the input is visible while typing.

- [ ] **Step 4: Commit**

```bash
git add src/components/MoreSheet.js
git commit -m "fix: keyboard avoidance in Edit Profile so display name input stays visible"
```

---

## Task 3: Fix global error showing on wrong day after failed upload

**Files:**
- Modify: `apps/mobile/App.js` — `chooseAndUploadDayScreenshot` and `retryDayUpload` functions

The bug: When a background day upload fails, `setError(friendlyError(msg))` is called globally. This error persists into `review_days` and shows under whichever tab is currently active (Friday), even though it was a different day (Saturday) that failed. The `DayTabReview` `failedBlock` already shows the correct per-day error via `dayStates[dayIndex].status === 'failed'`.

- [ ] **Step 1: Remove `setError` call from `chooseAndUploadDayScreenshot`**

Find the `.catch()` handler in `chooseAndUploadDayScreenshot` (around line 525). Remove the `setError(friendlyError(msg))` line:

```js
.catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  setDayStates((prev) => ({
    ...prev,
    [dayIndex]: {
      ...prev[dayIndex],
      status: 'failed',
      retryCount: (prev[dayIndex]?.retryCount || 0) + 1,
    },
  }));
  // DO NOT call setError here — DayTabReview shows per-day errors via dayStates
});
```

- [ ] **Step 2: Remove `setError` call from `retryDayUpload`**

Find the `.catch()` handler in `retryDayUpload` (around line 560). Same change — remove the `setError(friendlyError(msg))` line:

```js
.catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  setDayStates((prev) => ({
    ...prev,
    [dayIndex]: {
      ...prev[dayIndex],
      status: 'failed',
      retryCount: (prev[dayIndex]?.retryCount || 0) + 1,
    },
  }));
  // DO NOT call setError here
});
```

- [ ] **Step 3: Verify manually**

Build and run. Upload a good screenshot for Friday and a bad one for Saturday. Go to the review_days step. Confirm:
- Friday tab shows its parsed artists, no error banner at the bottom of the screen.
- Saturday tab shows "Could not parse this screenshot." error inside the DayTabReview content area only.

- [ ] **Step 4: Commit**

```bash
git add App.js
git commit -m "fix: remove global error from background upload failures; per-day errors shown in DayTabReview"
```

---

## Task 4: Add time pickers to EditableSetCard

**Files:**
- Modify: `apps/mobile/src/components/EditableSetCard.js`

The bug: The edit form for parsed sets uses plain `TextInput` for start/end times. The Add Artist form in `DayTabReview` already uses `DateTimePicker`. This brings EditableSetCard into parity.

Pattern to follow: `DayTabReview.js` `AddArtistForm` component — pressable buttons that show an inline `DateTimePicker` when tapped.

- [ ] **Step 1: Add DateTimePicker and Platform imports**

At the top of `EditableSetCard.js`, add:

```js
import DateTimePicker from '@react-native-community/datetimepicker';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
```

(Replace the existing React Native import line — add `Platform` and remove `TextInput` from the time fields, though `TextInput` is still used for artist name and stage.)

- [ ] **Step 2: Add helper functions at the top of the file**

After the existing `formatTime` function, add two helpers:

```js
function timeStringToDate(timeStr) {
  // Converts "21:00" or "02:00" (next-day) to a Date object for DateTimePicker
  if (!timeStr) return makeDefaultDate(20);
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (h >= 24) h -= 24; // normalize extended hours
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function makeDefaultDate(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

function formatHHMM(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDisplayTime(date) {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
```

- [ ] **Step 3: Update state in EditableSetCard to use Date objects for times**

In the `EditableSetCard` function body, change the time state from strings to Date objects:

```js
const [editStart, setEditStart] = useState(() => timeStringToDate(setItem.start_time_pt));
const [editEnd, setEditEnd] = useState(() => timeStringToDate(setItem.end_time_pt));
const [activeTimePicker, setActiveTimePicker] = useState(null); // 'start' | 'end' | null
```

Also update `handleStartEdit` to reset these as Date objects:

```js
const handleStartEdit = () => {
  setEditName(setItem.artist_name);
  setEditStage(setItem.stage_name);
  setEditStart(timeStringToDate(setItem.start_time_pt));
  setEditEnd(timeStringToDate(setItem.end_time_pt));
  setActiveTimePicker(null);
  setSaveError('');
  onStartEdit();
};
```

- [ ] **Step 4: Update `handleSave` to serialize Date objects back to HH:MM strings**

```js
const handleSave = async () => {
  setSaveError('');
  try {
    await onSave({
      artist_name: editName.trim(),
      stage_name: editStage.trim(),
      start_time_pt: formatHHMM(editStart),
      end_time_pt: formatHHMM(editEnd),
    });
    onCancelEdit();
  } catch (err) {
    setSaveError(err instanceof Error ? err.message : String(err));
  }
};
```

- [ ] **Step 5: Replace time TextInputs with time picker buttons in the editing JSX**

Find the `timeRow` section in the `isEditing` return block (the two `TextInput` fields with labels "Start (HH:MM)" and "End (HH:MM)"). Replace entirely:

```jsx
<View style={styles.timeRow}>
  <View style={[styles.fieldGroup, { flex: 1 }]}>
    <Text style={styles.fieldLabel}>Start time</Text>
    <Pressable
      onPress={() => setActiveTimePicker(activeTimePicker === 'start' ? null : 'start')}
      style={[styles.timePickerBtn, activeTimePicker === 'start' && styles.timePickerBtnActive]}
    >
      <Text style={styles.timePickerText}>{formatDisplayTime(editStart)}</Text>
    </Pressable>
  </View>
  <View style={[styles.fieldGroup, { flex: 1 }]}>
    <Text style={styles.fieldLabel}>End time</Text>
    <Pressable
      onPress={() => setActiveTimePicker(activeTimePicker === 'end' ? null : 'end')}
      style={[styles.timePickerBtn, activeTimePicker === 'end' && styles.timePickerBtnActive]}
    >
      <Text style={styles.timePickerText}>{formatDisplayTime(editEnd)}</Text>
    </Pressable>
  </View>
</View>

{activeTimePicker ? (
  <View style={styles.pickerContainer}>
    <DateTimePicker
      value={activeTimePicker === 'start' ? editStart : editEnd}
      mode="time"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      minuteInterval={5}
      onChange={(event, selectedDate) => {
        if (Platform.OS === 'android') {
          setActiveTimePicker(null);
        }
        if (selectedDate) {
          if (activeTimePicker === 'start') setEditStart(selectedDate);
          else setEditEnd(selectedDate);
        }
      }}
      style={styles.picker}
      textColor={C.text}
    />
    {Platform.OS === 'ios' ? (
      <Pressable onPress={() => setActiveTimePicker(null)} style={styles.pickerDoneBtn}>
        <Text style={styles.pickerDoneText}>Done</Text>
      </Pressable>
    ) : null}
  </View>
) : null}
```

Place this block between the stage field group and the `saveRow`.

- [ ] **Step 6: Add time picker styles to `makeStyles`**

Add these to the `StyleSheet.create({...})` in `makeStyles`:

```js
timePickerBtn: {
  borderWidth: 1,
  borderColor: C.inputBorder,
  borderRadius: 8,
  paddingHorizontal: 9,
  paddingVertical: 10,
  backgroundColor: C.inputBg,
  alignItems: 'center',
},
timePickerBtnActive: {
  borderColor: C.primary,
  backgroundColor: C.primaryBg,
},
timePickerText: { fontSize: 14, fontWeight: '600', color: C.text },
pickerContainer: {
  backgroundColor: C.inputBg,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: C.inputBorder,
  overflow: 'hidden',
},
picker: { width: '100%' },
pickerDoneBtn: {
  alignItems: 'flex-end',
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderTopWidth: 1,
  borderTopColor: C.inputBorder,
},
pickerDoneText: { color: C.primary, fontWeight: '700', fontSize: 14 },
```

- [ ] **Step 7: Verify manually**

Build and run. Go to Edit My Schedule → tap Edit on any set. Confirm start/end show as time buttons (e.g. "9:00 PM"), tapping shows the spinner picker, selecting a time updates the button label, tapping Done hides the picker, and saving stores the correct time.

- [ ] **Step 8: Commit**

```bash
git add src/components/EditableSetCard.js
git commit -m "feat: replace time text inputs with native time pickers in EditableSetCard"
```

---

## Task 5: Warn before finishing setup when days have failed

**Files:**
- Modify: `apps/mobile/App.js` — `finishUploadFlow` function (~line 578)

The bug: The Finish button in `review_days` proceeds immediately even when some days have `status: 'failed'`. Users may not notice the failure indicator in the tab bar.

- [ ] **Step 1: Add a guard at the start of `finishUploadFlow`**

Find `finishUploadFlow` in `App.js`. Before the `run(...)` call, add a failed-day check using `Alert`:

```js
const finishUploadFlow = () => {
  const failedDays = Object.entries(dayStates)
    .filter(([, d]) => d.status === 'failed')
    .map(([idx]) => {
      const day = festivalDays.find((d) => String(d.dayIndex) === String(idx));
      return day?.label || `Day ${idx}`;
    });

  if (failedDays.length > 0) {
    Alert.alert(
      'Some days failed to parse',
      `${failedDays.join(', ')} couldn't be read. Those days won't have any sets. Continue anyway?`,
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Continue', onPress: () => _doFinishUploadFlow() },
      ]
    );
    return;
  }

  _doFinishUploadFlow();
};

const _doFinishUploadFlow = () => {
  run('finish setup', async () => {
    if (Object.values(dayStates).some((d) => d.status === 'uploading')) {
      throw new Error('Uploads are still in progress — please wait before finishing.');
    }
    if (!isOnline) throw new Error('Finish setup requires a connection');
    await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/setup/complete',
      method: 'POST',
      sessionToken: memberSession,
      body: { confirm: true },
    });
    const homePayload = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/home',
      method: 'GET',
      sessionToken: memberSession,
    });
    const nextGroupId = homePayload.group.id;
    setHomeSnapshot(homePayload);
    setGroupId(nextGroupId);
    const schedulePayload = await fetchSchedule(memberSession, nextGroupId, { memberIds: [] });
    setSelectedMemberIds([]);
    setScheduleSnapshot(schedulePayload);
    setLastSyncAt(new Date().toISOString());
    setOnboardingStep('complete');
    setActiveView('group');
    setMoreSheetOpen(false);
  });
};
```

This replaces the old `finishUploadFlow` function entirely.

- [ ] **Step 2: Verify manually**

Build and run. Upload a bad screenshot for one day so it fails. Tap Finish. Confirm an alert appears naming the failed day with "Go Back" and "Continue" options. Tapping Go Back dismisses the alert. Tapping Continue proceeds to the group schedule.

With no failed days, confirm Finish proceeds without any alert.

- [ ] **Step 3: Commit**

```bash
git add App.js
git commit -m "fix: warn before finishing setup when day uploads have failed"
```

---

## Task 6: Refresh grid after adding set from group schedule

**Files:**
- Modify: `apps/mobile/App.js` — `addSetFromGrid` function (~line 953)

The bug: After tapping "+ Add to My Schedule" from the group schedule grid modal, `addPersonalSet` is called but `scheduleSnapshot` is not updated. The grid card still shows the old attendee count ("0 Definitely, 0 Maybe").

- [ ] **Step 1: Update `addSetFromGrid` to refresh snapshots after adding**

Find `addSetFromGrid` in `App.js`. Replace it:

```js
const addSetFromGrid = async (setItem) => {
  await addPersonalSet({
    artist_name: setItem.artist_name,
    stage_name: setItem.stage_name,
    start_time_pt: setItem.start_time_pt,
    end_time_pt: setItem.end_time_pt,
    day_index: setItem.day_index,
  });
  await refreshCoreSnapshots();
};
```

- [ ] **Step 2: Verify manually**

Build and run. From the group schedule, tap a set you're not attending → tap "+ Add to My Schedule". After the modal closes, verify the grid card now shows your attendee bubble and updated count.

- [ ] **Step 3: Commit**

```bash
git add App.js
git commit -m "fix: refresh schedule snapshot after adding set from grid so counts update immediately"
```

---

## Task 7: Add refresh icon to group schedule header

**Files:**
- Modify: `apps/mobile/App.js` — header JSX (~line 1159) and `makeStyles`

- [ ] **Step 1: Add a `refreshing` state**

Near the top of the `App` function body, add:

```js
const [refreshing, setRefreshing] = useState(false);
```

- [ ] **Step 2: Add `handleRefreshGroup` function**

Add this near the other action handlers:

```js
const handleRefreshGroup = async () => {
  if (!memberSession || !groupId || refreshing) return;
  setRefreshing(true);
  try {
    await refreshCoreSnapshots();
  } catch (err) {
    setError(friendlyError(err instanceof Error ? err.message : String(err)));
  } finally {
    setRefreshing(false);
  }
};
```

- [ ] **Step 3: Add the refresh button to the header JSX**

Find the header `<LinearGradient ...>` block in the `return` statement. It currently has a single `<View>` with the title and status dots. Add a refresh button on the right when on the group view:

```jsx
<LinearGradient colors={C.gradientHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <Text style={styles.title}>{title}</Text>
    {!isOnline ? (
      <View style={styles.offlineDot} />
    ) : pendingMutations.length > 0 ? (
      <View style={styles.pendingDot} />
    ) : null}
  </View>
  {activeView === 'group' ? (
    <Pressable onPress={handleRefreshGroup} disabled={refreshing} style={styles.refreshBtn}>
      {refreshing ? (
        <ActivityIndicator size="small" color={C.headerText} />
      ) : (
        <Text style={styles.refreshIcon}>↻</Text>
      )}
    </Pressable>
  ) : null}
</LinearGradient>
```

- [ ] **Step 4: Add missing imports**

Ensure `ActivityIndicator` is imported from `react-native` at the top of `App.js`. Check the existing import line and add it if missing.

- [ ] **Step 5: Add styles**

In `makeStyles` at the bottom of `App.js`, add:

```js
refreshBtn: {
  padding: 6,
  borderRadius: 20,
},
refreshIcon: {
  fontSize: 20,
  color: C.headerText,
  fontWeight: '300',
},
```

- [ ] **Step 6: Verify manually**

Build and run. Navigate to group schedule. Confirm a ↻ icon appears top-right of the header. Tapping it shows a brief spinner while fetching, then the grid updates.

- [ ] **Step 7: Commit**

```bash
git add App.js
git commit -m "feat: add refresh button to group schedule header"
```

---

## Task 8: Add day navigation segmented control to group schedule

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`
- Modify: `apps/mobile/App.js` — pass `festivalDays` prop

This is the largest change. The segmented control (Option C: iOS-style pill selector) is placed between the invite row and the member chips. Sets are filtered by the selected day.

- [ ] **Step 1: Add `festivalDays` prop to `GroupScheduleScreen` and `selectedDay` state**

Find the `GroupScheduleScreen` function signature. Add `festivalDays` to the props:

```js
export function GroupScheduleScreen({
  homeSnapshot,
  scheduleSnapshot,
  selectedMemberIds,
  loading,
  onToggleMember,
  onResetFilters,
  inviteCode,
  onCopyInvite,
  inviteCopied,
  myMemberId,
  onAddToMySchedule,
  festivalDays,
}) {
```

Then inside the function body, after the existing state declarations, add:

```js
const sets = scheduleSnapshot?.sets || [];
const stages = scheduleSnapshot?.stages || [];

// Derive sorted list of unique day indices that have sets
const availableDays = useMemo(() => {
  const indices = [...new Set(sets.map((s) => s.day_index).filter(Boolean))].sort((a, b) => a - b);
  return indices;
}, [sets]);

const [selectedDay, setSelectedDay] = useState(null);

// When availableDays first loads (or changes), default to the first available day
const effectiveDay = selectedDay !== null && availableDays.includes(selectedDay)
  ? selectedDay
  : (availableDays[0] ?? null);
```

Remove the existing `const sets = ...` and `const stages = ...` lines since they're now declared above (they were previously at lines 35–36).

- [ ] **Step 2: Filter sets and stages by `effectiveDay`**

Replace the existing `sets` and `stageColumns` derivations. After the `effectiveDay` computation, add:

```js
const filteredSets = effectiveDay !== null
  ? sets.filter((s) => s.day_index === effectiveDay)
  : sets;

const stageColumns = stages
  .filter((stage) => filteredSets.some((s) => s.stage_name === stage))
  .map((stage) => ({
    stage,
    sets: filteredSets
      .filter((item) => item.stage_name === stage)
      .sort((a, b) => timeToMinutes(a.start_time_pt) - timeToMinutes(b.start_time_pt))
  }));
```

Also update the `timeline` line to use `filteredSets`:

```js
const timeline = buildTimeline(filteredSets, gridBodyHeight || 0);
```

- [ ] **Step 3: Add the segmented control JSX**

Find the `filterSection` / `filterBar` View in the JSX. Insert the segmented control between the `topRow` (invite/clear-filters) and the `peopleRow` (member chips). Only render it when there are multiple days:

```jsx
{availableDays.length > 1 ? (
  <View style={styles.segmentedControl}>
    {availableDays.map((dayIdx) => {
      const dayLabel = (festivalDays || []).find((d) => d.dayIndex === dayIdx)?.label || `Day ${dayIdx}`;
      const isActive = dayIdx === effectiveDay;
      return (
        <Pressable
          key={dayIdx}
          onPress={() => setSelectedDay(dayIdx)}
          style={[styles.segmentedOption, isActive && styles.segmentedOptionActive]}
        >
          <Text style={[styles.segmentedText, isActive && styles.segmentedTextActive]}>
            {dayLabel}
          </Text>
        </Pressable>
      );
    })}
  </View>
) : null}
```

Place this between the `topRow` close tag and the `ScrollView` for `peopleRow`.

- [ ] **Step 4: Add segmented control styles**

In `makeStyles`, add:

```js
segmentedControl: {
  flexDirection: 'row',
  backgroundColor: C.segmentedBg || C.inputBg,
  borderRadius: 8,
  padding: 2,
  gap: 2,
},
segmentedOption: {
  flex: 1,
  alignItems: 'center',
  paddingVertical: 6,
  borderRadius: 6,
},
segmentedOptionActive: {
  backgroundColor: C.cardBg,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.12,
  shadowRadius: 2,
  elevation: 2,
},
segmentedText: {
  fontSize: 12,
  fontWeight: '600',
  color: C.textMuted,
},
segmentedTextActive: {
  color: C.text,
  fontWeight: '700',
},
```

- [ ] **Step 5: Pass `festivalDays` from App.js to GroupScheduleScreen**

In `App.js`, find the `<GroupScheduleScreen ...>` usage (~line 1216). Add the `festivalDays` prop:

```jsx
<GroupScheduleScreen
  homeSnapshot={homeSnapshot}
  scheduleSnapshot={scheduleSnapshot}
  selectedMemberIds={selectedMemberIds}
  loading={loading}
  onToggleMember={(memberId) => {
    const nextMemberIds = selectedMemberIds.includes(memberId)
      ? selectedMemberIds.filter((id) => id !== memberId)
      : [...selectedMemberIds, memberId];
    applyScheduleFilters(nextMemberIds, { debounceMs: 300 });
  }}
  onResetFilters={() => applyScheduleFilters([], { debounceMs: 300 })}
  inviteCode={inviteCode}
  onCopyInvite={copyInviteCode}
  inviteCopied={inviteCopied}
  myMemberId={homeSnapshot?.me?.id}
  onAddToMySchedule={addSetFromGrid}
  festivalDays={festivalDays}
/>
```

- [ ] **Step 6: Verify manually**

Build and run with a multi-day group schedule. Confirm:
- Segmented control shows day labels (e.g. "Friday | Saturday | Sunday").
- Active day has white raised pill, inactive days show muted text.
- Tapping a day tab switches the grid to that day's sets only.
- The timeline adjusts to the selected day's time range.
- Single-day groups show no segmented control.

- [ ] **Step 7: Commit**

```bash
git add src/screens/GroupScheduleScreen.js App.js
git commit -m "feat: add day navigation segmented control to group schedule"
```

---

## Task 9: Push all commits

Per project convention, push to remote after committing so Render auto-deploys from main.

- [ ] **Step 1: Push**

```bash
git push
```

---

## Self-Review Checklist

- [x] Spec item 1 (profile not reflecting in grid) → Task 1
- [x] Spec item 2 (keyboard covers input) → Task 2
- [x] Spec item 3 (error on wrong day) → Task 3
- [x] Spec item 4 (time pickers on edit forms) → Task 4
- [x] Spec item 5 (Finish skips days) → Task 5
- [x] Spec item 6 (grid not refreshing after add) → Task 6
- [x] Spec item 7 (refresh icon) → Task 7
- [x] Spec item 8 (day navigation) → Task 8
- [x] No placeholders — all steps have concrete code
- [x] `refreshCoreSnapshots` used consistently (Tasks 1, 6, 7)
- [x] `filteredSets` used in `buildTimeline` and `stageColumns` (Task 8)
- [x] `effectiveDay` derived consistently, `selectedDay` state managed correctly
