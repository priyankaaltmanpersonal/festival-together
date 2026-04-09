# Feedback Round 2 Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UX issues: flat/unstyled day chips across screens, missing day segmentation on individual schedules, broken upload-failure flow (no new-image option + manually-added artists disappearing), and the unnecessary minimum-artist gate.

**Architecture:** New shared `DaySelector` component replaces the inline segmented control in `GroupScheduleScreen` and is used in the revamped `IndividualSchedulesScreen`. `DayTabReview`'s tab bar styles are updated to match visually. The upload-failure fix is a one-line state transition in `addDaySet` plus a new `rePickAndUploadDay` function wired through `SetupScreen`. The artist gate is removed from both the server and client.

**Tech Stack:** React Native (Expo), JavaScript, Python/FastAPI, SQLite, pytest

---

## File Map

| File | Role |
|------|------|
| `apps/mobile/src/components/DaySelector.js` | **New.** Shared pill-style day picker used by GroupScheduleScreen and IndividualSchedulesScreen |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Replace inline segmented control with `<DaySelector>` |
| `apps/mobile/src/screens/IndividualSchedulesScreen.js` | Add `festivalDays` prop, `DaySelector`, local `selectedDay` state, per-member set filtering |
| `apps/mobile/src/components/DayTabReview.js` | Update tab bar styles to match DaySelector; add "Choose New Image" button in failed state; accept `onReUpload` prop (already in signature, now rendered) |
| `apps/mobile/App.js` | Add `rePickAndUploadDay`; pass `onChooseNewImage` to `SetupScreen`; fix `addDaySet` status transition; remove `at_least_one_set_required`; pass `festivalDays` to `IndividualSchedulesScreen` |
| `apps/mobile/src/screens/SetupScreen.js` | Accept + forward `onChooseNewImage` prop to `DayTabReview` as `onReUpload` |
| `services/api/app/api/personal.py` | Remove minimum-artist check from `complete_setup` |
| `services/api/tests/test_personal.py` | Update `test_setup_complete_requires_at_least_one_set` to assert the new behavior (200, not 400) |

---

## Task 1: Create `DaySelector` component

**Files:**
- Create: `apps/mobile/src/components/DaySelector.js`

- [ ] **Step 1: Create the file**

```js
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function DaySelector({ days, selectedDay, onSelect }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!days || days.length <= 1) return null;

  return (
    <View style={styles.container}>
      {days.map((day) => {
        const isActive = day.dayIndex === selectedDay;
        return (
          <Pressable
            key={day.dayIndex}
            onPress={() => onSelect(day.dayIndex)}
            style={[styles.option, isActive && styles.optionActive]}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>
              {day.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.inputBorder,
    padding: 3,
    gap: 2,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionActive: {
    backgroundColor: C.primaryBg,
    borderColor: C.primary,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  textActive: {
    color: C.text,
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/DaySelector.js
git commit -m "feat: add shared DaySelector pill component"
```

---

## Task 2: Use `DaySelector` in `GroupScheduleScreen`

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add the import at the top of the file (after existing imports)**

```js
import { DaySelector } from '../components/DaySelector';
```

- [ ] **Step 2: Replace the inline segmented control JSX**

Find this block (around line 88):
```js
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

Replace with:
```js
{availableDays.length > 1 ? (
  <DaySelector
    days={availableDays.map((dayIdx) => ({
      dayIndex: dayIdx,
      label: (festivalDays || []).find((d) => d.dayIndex === dayIdx)?.label || `Day ${dayIdx}`,
    }))}
    selectedDay={effectiveDay}
    onSelect={setSelectedDay}
  />
) : null}
```

- [ ] **Step 3: Remove the now-unused segmented styles from `makeStyles`**

Remove these entries from the `makeStyles` return object (around lines 594–623):
```js
segmentedControl: { ... },
segmentedOption: { ... },
segmentedOptionActive: { ... },
segmentedText: { ... },
segmentedTextActive: { ... },
```

- [ ] **Step 4: Verify the app renders the group grid with the new pill-style day selector. Confirm the active day is visually distinct (warm tinted background + orange border).**

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/GroupScheduleScreen.js
git commit -m "feat: use DaySelector in GroupScheduleScreen"
```

---

## Task 3: `IndividualSchedulesScreen` — day segmentation

**Files:**
- Modify: `apps/mobile/src/screens/IndividualSchedulesScreen.js`
- Modify: `apps/mobile/App.js` (add `festivalDays` prop)

- [ ] **Step 1: Update `IndividualSchedulesScreen` to accept `festivalDays` and add day filtering**

Replace the entire file content with:

```js
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DaySelector } from '../components/DaySelector';
import { useTheme } from '../theme';

export function IndividualSchedulesScreen({ individualSnapshot, festivalDays, onLoadIndividual, onBack }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const members = individualSnapshot?.members || [];

  const availableDays = festivalDays || [];
  const [selectedDay, setSelectedDay] = useState(availableDays[0]?.dayIndex ?? null);
  const effectiveDay = selectedDay !== null ? selectedDay : (availableDays[0]?.dayIndex ?? null);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
          ) : null}
          <Text style={styles.label}>Individual Schedules</Text>
        </View>
        {availableDays.length > 1 ? (
          <DaySelector
            days={availableDays}
            selectedDay={effectiveDay}
            onSelect={setSelectedDay}
          />
        ) : null}
        <Pressable onPress={onLoadIndividual} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>Refresh Individual Schedules</Text>
        </Pressable>
        {!members.length ? <Text style={styles.helper}>No data yet. Run member setup and refresh.</Text> : null}
      </View>

      {members.map((member) => {
        const daySets = effectiveDay !== null
          ? (member.sets || []).filter((s) => s.day_index === effectiveDay)
          : (member.sets || []);
        const dayLabel = availableDays.find((d) => d.dayIndex === effectiveDay)?.label || '';
        return (
          <View key={member.member_id} style={styles.card}>
            <Text style={styles.memberName}>{member.display_name}</Text>
            <Text style={styles.helper}>Setup: {member.setup_status}</Text>
            {daySets.length ? (
              daySets.map((setItem) => (
                <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
                  <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                  <Text style={styles.helper}>
                    {setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} PT • {setItem.preference}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.helper}>
                {(member.sets || []).length > 0
                  ? `No sets on ${dayLabel}.`
                  : 'No mapped sets yet for this member.'}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 22 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8
  },
  headerRow: { gap: 4 },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { color: C.primary, fontWeight: '700', fontSize: 13 },
  label: { fontWeight: '700', color: C.text },
  memberName: { fontWeight: '700', fontSize: 16, color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  buttonSecondary: {
    backgroundColor: C.btnSecondaryBg,
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: C.btnSecondaryText, fontWeight: '700' },
  setRow: {
    borderWidth: 1,
    borderColor: C.setRowBorder,
    borderRadius: 10,
    padding: 8,
    backgroundColor: C.setRowBg
  },
  setTitle: { color: C.setRowTitle, fontWeight: '600' }
});
```

- [ ] **Step 2: Pass `festivalDays` to `IndividualSchedulesScreen` in `App.js`**

Find this block in `App.js` (around line 1368):
```js
{activeView === 'individual' ? (
  <IndividualSchedulesScreen
    individualSnapshot={individualSnapshot}
    onLoadIndividual={loadIndividual}
    onBack={() => setActiveView('group')}
  />
) : null}
```

Replace with:
```js
{activeView === 'individual' ? (
  <IndividualSchedulesScreen
    individualSnapshot={individualSnapshot}
    festivalDays={festivalDays}
    onLoadIndividual={loadIndividual}
    onBack={() => setActiveView('group')}
  />
) : null}
```

- [ ] **Step 3: Verify the individual schedules screen shows the day selector and filters sets by day.**

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/IndividualSchedulesScreen.js apps/mobile/App.js
git commit -m "feat: add day segmentation to IndividualSchedulesScreen"
```

---

## Task 4: Update `DayTabReview` tab styles to match `DaySelector`

**Files:**
- Modify: `apps/mobile/src/components/DayTabReview.js`

- [ ] **Step 1: Update the tab bar styles in `makeStyles` at the bottom of `DayTabReview.js`**

Find and replace the `tabBar`, `tab`, `tabActive`, `tabText`, and `tabActiveText` style entries:

```js
// Replace:
tabBar: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  borderBottomColor: C.tabBorder,
  backgroundColor: C.tabBg,
  marginBottom: 8,
},
tab: {
  flex: 1,
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  paddingVertical: 10,
  gap: 4,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
},
tabActive: {
  borderBottomColor: C.tabActiveBorder,
  backgroundColor: C.tabActiveBg,
},
tabText: { color: C.tabText, fontWeight: '600', fontSize: 13 },
tabActiveText: { color: C.tabActiveText },

// With:
tabBar: {
  flexDirection: 'row',
  backgroundColor: C.inputBg,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: C.inputBorder,
  padding: 3,
  gap: 2,
  marginBottom: 8,
},
tab: {
  flex: 1,
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  paddingVertical: 7,
  gap: 4,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'transparent',
},
tabActive: {
  backgroundColor: C.primaryBg,
  borderColor: C.primary,
},
tabText: { color: C.textMuted, fontWeight: '600', fontSize: 12 },
tabActiveText: { color: C.text, fontWeight: '700' },
```

- [ ] **Step 2: Verify the setup review screen and the Edit My Schedule screen both show the updated tab style. Confirm badges (set count, error mark `!`, spinner) still render correctly on top of the new backgrounds.**

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/DayTabReview.js
git commit -m "style: update DayTabReview tabs to match DaySelector pill style"
```

---

## Task 5: Fix `addDaySet` — transition failed day to done on manual add

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Update the `setDayStates` call inside `addDaySet`**

Find this block inside `addDaySet` (around line 655):
```js
setDayStates((prev) => ({
  ...prev,
  [dayIndex]: {
    ...prev[dayIndex],
    sets: [...(prev[dayIndex]?.sets || []), newSet],
  },
}));
```

Replace with:
```js
setDayStates((prev) => {
  const prevDay = prev[dayIndex] || {};
  return {
    ...prev,
    [dayIndex]: {
      ...prevDay,
      status: prevDay.status === 'failed' ? 'done' : prevDay.status,
      sets: [...(prevDay.sets || []), newSet],
    },
  };
});
```

- [ ] **Step 2: Verify manually: on a failed upload day in the review screen, click "+ Add Manually", fill in artist name + stage + any times, submit. The form should close, the artist should appear in the sets list, and the "Confirm Day" button should be visible.**

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.js
git commit -m "fix: transition failed day to done when artist added manually"
```

---

## Task 6: Add "Choose New Image" to the failed state

**Files:**
- Modify: `apps/mobile/App.js`
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/src/components/DayTabReview.js`

- [ ] **Step 1: Add `rePickAndUploadDay` to `App.js`, immediately after `chooseAndUploadDayScreenshot`**

```js
const rePickAndUploadDay = async (dayIndex) => {
  if (!memberSession || !isOnline) {
    setError(isOnline ? 'Start onboarding first' : 'Upload requires a connection');
    return;
  }
  let uris;
  try {
    uris = await pickImages(5);
  } catch (e) {
    setError('Photo library permission denied');
    return;
  }
  if (!uris || uris.length === 0) return;

  const currentDay = festivalDays.find((d) => d.dayIndex === dayIndex);
  const dayLabel = currentDay?.label || '';

  setDayStates((prev) => ({
    ...prev,
    [dayIndex]: { status: 'uploading', sets: [], retryCount: 0, imageUris: uris },
  }));
  setError('');

  uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, uris, null, dayLabel)
    .then((response) => {
      const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
      setDayStates((prev) => ({
        ...prev,
        [dayIndex]: { ...prev[dayIndex], status: 'done', sets, errorMsg: null },
      }));
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setDayStates((prev) => ({
        ...prev,
        [dayIndex]: {
          ...prev[dayIndex],
          status: 'failed',
          retryCount: (prev[dayIndex]?.retryCount || 0) + 1,
          errorMsg: friendlyError(msg),
        },
      }));
    });
};
```

- [ ] **Step 2: Pass `onChooseNewImage` to `SetupScreen` in `App.js`**

Find the `SetupScreen` render call (around line 1310). Add one prop:
```js
onChooseNewImage={rePickAndUploadDay}
```

The full `SetupScreen` usage should now include:
```js
onRetryDay={retryDayUpload}
onChooseNewImage={rePickAndUploadDay}  // ← add this line
onDeleteDaySet={deleteDaySet}
```

- [ ] **Step 3: Accept and forward `onChooseNewImage` in `SetupScreen.js`**

Add `onChooseNewImage` to the destructured props at the top of `SetupScreen`:
```js
export function SetupScreen({
  // ... existing props ...
  onRetryDay,
  onChooseNewImage,   // ← add this
  onDeleteDaySet,
  // ...
```

Then in the `review_days` `DayTabReview` render, add `onReUpload`:
```js
<DayTabReview
  festivalDays={festivalDays || []}
  dayStates={dayStates || {}}
  onRetry={onRetryDay}
  onReUpload={onChooseNewImage}   // ← add this line
  onDeleteSet={onDeleteDaySet}
  onAddSet={onAddDaySet}
  onSetPreference={onSetDayPreference}
  onEditSet={onEditDaySet}
  onAddOpen={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50)}
  onConfirmDay={onConfirmDay}
/>
```

- [ ] **Step 4: Render "Choose New Image" button in `DayTabReview`'s failed state**

In `DayTabReview.js`, find the failed state block (around line 273). After the Retry button and before the Add Manually button, add:

```js
{onReUpload ? (
  <Pressable onPress={() => onReUpload(activeDay)} style={styles.secondaryBtn}>
    <Text style={styles.secondaryBtnText}>Choose New Image</Text>
  </Pressable>
) : null}
```

The full failed block should now read:
```js
} : current.status === 'failed' ? (
  <View style={styles.failedBlock}>
    <Text style={styles.failedText}>
      {current.retryCount >= 3
        ? `${current.errorMsg || 'Could not parse this screenshot.'} (No more retries — add artists manually.)`
        : (current.errorMsg || 'Could not parse this screenshot.')}
    </Text>
    {current.retryCount < 3 ? (
      <Pressable onPress={() => onRetry(activeDay)} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>
          Retry Upload ({3 - current.retryCount} attempt{3 - current.retryCount !== 1 ? 's' : ''} left)
        </Text>
      </Pressable>
    ) : null}
    {onReUpload ? (
      <Pressable onPress={() => onReUpload(activeDay)} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Choose New Image</Text>
      </Pressable>
    ) : null}
    {isAdding ? (
      <AddArtistForm
        dayIndex={activeDay}
        onAdd={(fields) => onAddSet(fields, activeDay)}
        onCancel={() => setIsAdding(false)}
        C={C}
        styles={styles}
      />
    ) : (
      <Pressable onPress={() => { setIsAdding(true); if (onAddOpen) onAddOpen(); }} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>+ Add Manually</Text>
      </Pressable>
    )}
  </View>
```

- [ ] **Step 5: Verify: on a failed day in the review screen, three options are now visible: "Retry Upload", "Choose New Image", "+ Add Manually". Tapping "Choose New Image" opens the photo picker.**

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/App.js apps/mobile/src/screens/SetupScreen.js apps/mobile/src/components/DayTabReview.js
git commit -m "feat: add Choose New Image option to failed upload state"
```

---

## Task 7: Remove minimum-artist constraint

**Files:**
- Modify: `services/api/app/api/personal.py`
- Modify: `services/api/tests/test_personal.py`
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Update the existing test to assert the new behavior**

In `services/api/tests/test_personal.py`, find `test_setup_complete_requires_at_least_one_set` (around line 114):

```python
def test_setup_complete_requires_at_least_one_set() -> None:
    solo = _create_group("Solo", "NoSets")
    session_token = solo["session"]["token"]

    done_resp = client.post(
        "/v1/members/me/setup/complete",
        headers={"x-session-token": session_token},
        json={"confirm": True},
    )
    assert done_resp.status_code == 400
    assert done_resp.json()["detail"] == "at_least_one_set_required"
```

Replace with:
```python
def test_setup_complete_allows_zero_sets() -> None:
    """Members can complete setup with no artists — they'll just see others' picks."""
    solo = _create_group("Solo", "NoSets")
    session_token = solo["session"]["token"]

    done_resp = client.post(
        "/v1/members/me/setup/complete",
        headers={"x-session-token": session_token},
        json={"confirm": True},
    )
    assert done_resp.status_code == 200
    assert done_resp.json()["ok"] is True
```

- [ ] **Step 2: Run the test to verify it fails (because the server still has the constraint)**

```bash
cd services/api && .venv/bin/pytest tests/test_personal.py::test_setup_complete_allows_zero_sets -v
```

Expected: FAIL with `assert 400 == 200`

- [ ] **Step 3: Remove the minimum-artist check from `complete_setup` in `personal.py`**

Find and remove these lines (around line 295):
```python
pref_count = conn.execute(
    "SELECT COUNT(*) AS cnt FROM member_set_preferences WHERE member_id = ?",
    (session["member_id"],),
).fetchone()
if pref_count is None or pref_count["cnt"] < 1:
    raise HTTPException(status_code=400, detail="at_least_one_set_required")
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd services/api && .venv/bin/pytest tests/test_personal.py::test_setup_complete_allows_zero_sets -v
```

Expected: PASS

- [ ] **Step 5: Run the full personal test suite to confirm no regressions**

```bash
cd services/api && .venv/bin/pytest tests/test_personal.py -v
```

Expected: All tests pass.

- [ ] **Step 6: Remove `at_least_one_set_required` from App.js `friendlyError` map**

Find this line in `App.js` (around line 39):
```js
at_least_one_set_required: 'You need at least one artist saved before finishing.',
```

Delete it.

- [ ] **Step 7: Commit**

```bash
git add services/api/app/api/personal.py services/api/tests/test_personal.py apps/mobile/App.js
git commit -m "feat: remove minimum-artist gate from setup completion"
```

---

## Task 8: Push to remote

- [ ] **Step 1: Push all commits**

```bash
git push
```

Render will auto-deploy the API changes. Verify the deploy completes successfully in the Render dashboard before testing on device.
