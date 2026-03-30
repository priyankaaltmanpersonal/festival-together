# Async Upload + Tabbed Day Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlap per-day screenshot uploads so the user picks all screenshots first then reviews results in a tabbed interface, eliminating sequential 10–15 s idle waits; apply the same tabbed day view to the post-onboarding edit screen.

**Architecture:** Pure client-side — no backend changes. A new `DayTabReview` shared component renders a tab bar (Fri/Sat/Sun) + per-day content for both the setup review step and `EditMyScheduleScreen`. `App.js` replaces per-day scalar state (`dayUploadStatus`, `dayParsedSets`, etc.) with a `dayStates` map keyed by `dayIndex`, and fires each day's upload non-blockingly so the user can pick the next day's screenshot while the previous is still parsing.

**Tech Stack:** React Native (Expo), existing FastAPI backend unchanged, `useTheme` from `src/theme/index.js`.

---

## File Map

| Action | File |
|--------|------|
| **Create** | `apps/mobile/src/components/DayTabReview.js` |
| **Modify** | `apps/mobile/App.js` |
| **Modify** | `apps/mobile/src/screens/SetupScreen.js` |
| **Modify** | `apps/mobile/src/screens/EditMyScheduleScreen.js` |

---

## Task 1: Create `DayTabReview` component

**Files:**
- Create: `apps/mobile/src/components/DayTabReview.js`

**Props accepted by `DayTabReview`:**
- `festivalDays` — `[{ dayIndex: number, label: string }]`
- `dayStates` — `{ [dayIndex]: { status: 'idle'|'uploading'|'done'|'failed', sets: [], retryCount: number } }`
- `onRetry(dayIndex)` — parent retries upload for that day
- `onDeleteSet(canonicalSetId, dayIndex)`
- `onAddSet(fields, dayIndex)` — `fields` includes `day_index`
- `onSetPreference(canonicalSetId, preference, dayIndex)`
- `onEditSet(canonicalSetId, fields)` — may be `null` if editing is not supported in context

`DayTabReview` owns: active tab, editing-set id, saving-set id, and is-adding-artist flag. The parent owns all `dayStates` and API calls.

**Important:** `DayTabReview` does NOT wrap content in a `ScrollView`. The parent component provides scrolling. This avoids nested-ScrollView issues.

- [ ] **Step 1: Create the file**

```js
// apps/mobile/src/components/DayTabReview.js
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EditableSetCard } from './EditableSetCard';
import { useTheme } from '../theme';

function AddArtistForm({ dayIndex, onAdd, onCancel, C, styles }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim() || !start.trim() || !end.trim()) {
      setFormError('All fields are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: start.trim(),
        end_time_pt: end.trim(),
        day_index: dayIndex,
      });
      onCancel();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCard}>
      <Text style={styles.addCardLabel}>Add Artist</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Artist name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Bad Bunny" />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Stage</Text>
        <TextInput value={stage} onChangeText={setStage} style={styles.input} placeholder="e.g. Coachella Stage" />
      </View>
      <View style={styles.timeRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
          <TextInput value={start} onChangeText={setStart} style={styles.input} placeholder="21:00" />
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>End (HH:MM)</Text>
          <TextInput value={end} onChangeText={setEnd} style={styles.input} placeholder="23:00" />
        </View>
      </View>
      <View style={styles.saveRow}>
        {saving ? (
          <ActivityIndicator color={C.primary} />
        ) : (
          <Pressable onPress={handleAdd} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {formError ? <Text style={styles.saveError}>{formError}</Text> : null}
    </View>
  );
}

export function DayTabReview({
  festivalDays,
  dayStates,
  onRetry,
  onDeleteSet,
  onAddSet,
  onSetPreference,
  onEditSet,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [activeDay, setActiveDay] = useState(festivalDays[0]?.dayIndex ?? 1);
  const [editingSetId, setEditingSetId] = useState(null);
  const [savingSetId, setSavingSetId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleTabPress = (dayIndex) => {
    setActiveDay(dayIndex);
    setEditingSetId(null);
    setIsAdding(false);
  };

  const handleSave = async (canonicalSetId, fields) => {
    if (!onEditSet) return;
    setSavingSetId(canonicalSetId);
    try {
      await onEditSet(canonicalSetId, fields);
      setEditingSetId(null);
    } finally {
      setSavingSetId(null);
    }
  };

  const current = dayStates[activeDay] || { status: 'idle', sets: [], retryCount: 0 };
  const sets = current.sets || [];

  const renderContent = () => {
    if (current.status === 'uploading') {
      return (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Analyzing your schedule…</Text>
        </View>
      );
    }

    if (current.status === 'failed') {
      return (
        <View style={styles.failedBlock}>
          <Text style={styles.failedText}>
            {current.retryCount >= 3
              ? 'Could not parse this screenshot after 3 attempts.'
              : 'Could not parse this screenshot.'}
          </Text>
          {current.retryCount < 3 ? (
            <Pressable onPress={() => onRetry(activeDay)} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>
                Retry Upload ({3 - current.retryCount} attempt{3 - current.retryCount !== 1 ? 's' : ''} left)
              </Text>
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
            <Pressable onPress={() => setIsAdding(true)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>+ Add Manually</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return (
      <>
        {current.status === 'idle' ? (
          <Text style={styles.emptyText}>No screenshot uploaded for this day.</Text>
        ) : sets.length === 0 ? (
          <Text style={styles.emptyText}>No artists found — add manually below.</Text>
        ) : null}
        {sets.map((setItem) => (
          <EditableSetCard
            key={setItem.canonical_set_id}
            setItem={setItem}
            isEditing={editingSetId === setItem.canonical_set_id}
            onStartEdit={() => setEditingSetId(setItem.canonical_set_id)}
            onCancelEdit={() => setEditingSetId(null)}
            onSave={(fields) => handleSave(setItem.canonical_set_id, fields)}
            onDelete={() => onDeleteSet(setItem.canonical_set_id, activeDay)}
            onSetPreference={(canonicalSetId, pref) => onSetPreference(canonicalSetId, pref, activeDay)}
            saving={savingSetId === setItem.canonical_set_id}
            deleting={false}
          />
        ))}
        {isAdding ? (
          <AddArtistForm
            dayIndex={activeDay}
            onAdd={(fields) => onAddSet(fields, activeDay)}
            onCancel={() => setIsAdding(false)}
            C={C}
            styles={styles}
          />
        ) : (
          <Pressable onPress={() => setIsAdding(true)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>+ Add Artist</Text>
          </Pressable>
        )}
      </>
    );
  };

  return (
    <View>
      <View style={styles.tabBar}>
        {festivalDays.map((day) => {
          const state = dayStates[day.dayIndex] || { status: 'idle', sets: [] };
          const isActive = day.dayIndex === activeDay;
          return (
            <Pressable
              key={day.dayIndex}
              onPress={() => handleTabPress(day.dayIndex)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabActiveText]}>
                {day.label}
              </Text>
              {state.status === 'uploading' ? (
                <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 4 }} />
              ) : state.status === 'done' && (state.sets || []).length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{(state.sets || []).length}</Text>
                </View>
              ) : state.status === 'failed' ? (
                <Text style={styles.tabErrorMark}>!</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
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
  badge: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: { color: C.primaryText, fontSize: 10, fontWeight: '700' },
  tabErrorMark: { color: C.error, fontWeight: '800', fontSize: 13 },
  content: { gap: 8 },
  loadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  loadingText: { color: C.textMuted, fontSize: 13 },
  failedBlock: { gap: 10 },
  failedText: { color: C.error, fontSize: 13 },
  emptyText: { color: C.textMuted, fontSize: 13 },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: C.btnSecondaryBg,
  },
  secondaryBtnText: { color: C.btnSecondaryText, fontWeight: '600', fontSize: 13 },
  addCard: {
    backgroundColor: C.addCardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.addCardBorder,
    padding: 12,
    gap: 8,
  },
  addCardLabel: { fontWeight: '700', color: C.addCardLabel, fontSize: 13 },
  fieldGroup: { gap: 3 },
  fieldLabel: { color: C.fieldLabelText, fontSize: 11, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 13,
    backgroundColor: C.inputBg,
    color: C.text,
  },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  saveError: { color: C.error, fontWeight: '600', fontSize: 12 },
});
```

- [ ] **Step 2: Start Expo dev server and verify no Metro bundler errors for the new file**

```bash
cd apps/mobile && npx expo start
```

Expected: Metro bundles successfully. The component isn't used yet so no visual check needed.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/DayTabReview.js
git commit -m "feat: add DayTabReview shared component (tabbed day schedule view)"
git push
```

---

## Task 2: Refactor App.js — state model + functions

**Files:**
- Modify: `apps/mobile/App.js`

After this task the app will briefly have broken SetupScreen/EditMyScheduleScreen prop wiring (fixed in Tasks 3 & 4). Start the app only to confirm no startup JS exception.

- [ ] **Step 1: Replace the six old state declarations (lines ~113–120) with `dayStates`**

Remove:
```js
  const [uploadDayIndex, setUploadDayIndex] = useState(1);
  const [dayUploadStatus, setDayUploadStatus] = useState('idle'); // 'idle'|'uploading'|'done'|'error'
  const [dayParsedSets, setDayParsedSets] = useState([]);
  const [editingDaySetId, setEditingDaySetId] = useState(null);
  const [savingDaySetId, setSavingDaySetId] = useState(null);
  const [isAddingDaySet, setIsAddingDaySet] = useState(false);
  const [skippedDayIndices, setSkippedDayIndices] = useState(new Set());
  const [successfulUploadCount, setSuccessfulUploadCount] = useState(0);
```

Add:
```js
  const [uploadDayIndex, setUploadDayIndex] = useState(1);
  // { [dayIndex]: { status: 'idle'|'uploading'|'done'|'failed', sets: [], retryCount: 0, imageUris: null } }
  const [dayStates, setDayStates] = useState({});
```

- [ ] **Step 2: Update the `loadAppState` hydration block (lines ~170–172)**

Remove:
```js
        setUploadDayIndex(storedState.uploadDayIndex || 1);
        setSuccessfulUploadCount(storedState.successfulUploadCount || 0);
        setSkippedDayIndices(new Set(storedState.skippedDayIndices || []));
```

Add:
```js
        setUploadDayIndex(storedState.uploadDayIndex || 1);
        // Convert any in-flight 'uploading' day to 'failed' — uploads can't resume after restart
        const rawDayStates = storedState.dayStates || {};
        const sanitizedDayStates = {};
        for (const [key, val] of Object.entries(rawDayStates)) {
          sanitizedDayStates[key] = val.status === 'uploading'
            ? { ...val, status: 'failed', retryCount: (val.retryCount || 0) + 1, imageUris: null }
            : val;
        }
        setDayStates(sanitizedDayStates);
```

- [ ] **Step 3: Update the AppState `change` handler (lines ~197–209)**

Remove:
```js
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setDayUploadStatus((prev) => {
          if (prev === 'uploading') {
            setError('Upload may have been interrupted — tap to try again.');
            return 'error';
          }
          return prev;
        });
      }
    });
    return () => sub.remove();
  }, []);
```

Add:
```js
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setDayStates((prev) => {
          const hasInterrupted = Object.values(prev).some((d) => d.status === 'uploading');
          if (!hasInterrupted) return prev;
          const next = {};
          for (const [key, val] of Object.entries(prev)) {
            next[key] = val.status === 'uploading'
              ? { ...val, status: 'failed', retryCount: (val.retryCount || 0) + 1, imageUris: null }
              : val;
          }
          setError('Upload may have been interrupted — tap to retry.');
          return next;
        });
      }
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 4: Update `saveAppState` — payload and dependency array**

In the `saveAppState({...})` call, replace:
```js
      uploadDayIndex,
      successfulUploadCount,
      skippedDayIndices: Array.from(skippedDayIndices),
```
With:
```js
      uploadDayIndex,
      dayStates,
```

In the dependency array for that `useEffect`, replace:
```js
    uploadDayIndex,
    successfulUploadCount,
    skippedDayIndices,
```
With:
```js
    uploadDayIndex,
    dayStates,
```

- [ ] **Step 5: Remove old upload-related functions**

Delete the following functions entirely from App.js:
- `chooseAndUploadDayScreenshot` (the async function that calls `setDayUploadStatus('uploading')`)
- `finishUploadFlow`
- `advanceUploadDay`
- `reuploadDay`
- `goBackUploadDay`
- `skipUploadDay`
- `setDayPreference`
- `deleteDayParsedSet`
- `addDayParsedSet`
- `editDaySet`

- [ ] **Step 6: Add replacement functions**

Add the following block after `removeFestivalDay` and before any other functions:

```js
  // ── Upload-all-days flow ─────────────────────────────────────────────────

  const advancePickDay = (currentDayIndex) => {
    const currentIdx = festivalDays.findIndex((d) => d.dayIndex === currentDayIndex);
    const nextDay = festivalDays[currentIdx + 1];
    if (nextDay) {
      setUploadDayIndex(nextDay.dayIndex);
    } else {
      setOnboardingStep('review_days');
    }
  };

  const chooseAndUploadDayScreenshot = async (dayIndex) => {
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

    // Advance to next day immediately (non-blocking upload fires in background)
    advancePickDay(dayIndex);

    uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, uris, null, dayLabel)
      .then((response) => {
        const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: { ...prev[dayIndex], status: 'done', sets },
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
          },
        }));
        setError(friendlyError(msg));
      });
  };

  const retryDayUpload = (dayIndex) => {
    const dayState = dayStates[dayIndex];
    if (!dayState?.imageUris || dayState.status === 'uploading') return;

    const currentDay = festivalDays.find((d) => d.dayIndex === dayIndex);
    const dayLabel = currentDay?.label || '';

    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: { ...prev[dayIndex], status: 'uploading' },
    }));
    setError('');

    uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, dayState.imageUris, null, dayLabel)
      .then((response) => {
        const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: { ...prev[dayIndex], status: 'done', sets },
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
          },
        }));
        setError(friendlyError(msg));
      });
  };

  const skipPickDay = () => {
    advancePickDay(uploadDayIndex);
  };

  const finishUploadFlow = () => {
    run('finish setup', async () => {
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
      setMenuOpen(false);
    });
  };

  const deleteDaySet = async (canonicalSetId, dayIndex) => {
    const previous = dayStates[dayIndex]?.sets || [];
    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        sets: previous.filter((s) => s.canonical_set_id !== canonicalSetId),
      },
    }));
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/members/me/sets/${canonicalSetId}`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
    } catch (err) {
      setDayStates((prev) => ({
        ...prev,
        [dayIndex]: { ...prev[dayIndex], sets: previous },
      }));
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const addDaySet = async (fields, dayIndex) => {
    const data = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/sets',
      method: 'POST',
      sessionToken: memberSession,
      body: fields,
    });
    const newSet = {
      canonical_set_id: data.canonical_set_id,
      artist_name: fields.artist_name,
      stage_name: fields.stage_name,
      start_time_pt: fields.start_time_pt,
      end_time_pt: fields.end_time_pt,
      day_index: dayIndex,
      preference: 'flexible',
    };
    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        sets: [...(prev[dayIndex]?.sets || []), newSet],
      },
    }));
  };

  const setDaySetPreference = (canonicalSetId, preference, dayIndex) => {
    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        sets: (prev[dayIndex]?.sets || []).map((s) =>
          s.canonical_set_id === canonicalSetId ? { ...s, preference } : s
        ),
      },
    }));
    if (!memberSession || !isOnline) return;
    const revertPref = preference === 'must_see' ? 'flexible' : 'must_see';
    apiRequest({
      baseUrl: apiUrl,
      path: `/v1/members/me/sets/${canonicalSetId}`,
      method: 'PATCH',
      sessionToken: memberSession,
      body: { preference },
    }).catch(() => {
      setDayStates((prev) => ({
        ...prev,
        [dayIndex]: {
          ...prev[dayIndex],
          sets: (prev[dayIndex]?.sets || []).map((s) =>
            s.canonical_set_id === canonicalSetId ? { ...s, preference: revertPref } : s
          ),
        },
      }));
    });
  };
```

- [ ] **Step 7: Update `completeFestivalSetup` to use the new step name and reset `dayStates`**

There are two occurrences of this block in `completeFestivalSetup` (founder path and member-join path). In each, replace:
```js
      setDayUploadStatus('idle');
      setSuccessfulUploadCount(0);
      setSkippedDayIndices(new Set());
      setOnboardingStep('upload_day');
```
With:
```js
      setDayStates({});
      setUploadDayIndex(festivalDays[0]?.dayIndex ?? 1);
      setOnboardingStep('upload_all_days');
```

- [ ] **Step 8: Update `resetFlow` to use new state**

In `resetFlow`, replace:
```js
    setUploadDayIndex(1);
    setSuccessfulUploadCount(0);
    setSkippedDayIndices(new Set());
    setDayUploadStatus('idle');
    setDayParsedSets([]);
```
With:
```js
    setUploadDayIndex(1);
    setDayStates({});
```

- [ ] **Step 9: Verify app starts without a JS exception**

```bash
cd apps/mobile && npx expo start
```

Expected: app loads to onboarding/home screen. Some props to `SetupScreen` will be undefined (expected — fixed in Task 3). No uncaught reference errors in Metro log.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/App.js
git commit -m "refactor: replace per-day scalar state with dayStates map, add non-blocking upload flow"
git push
```

---

## Task 3: Update SetupScreen.js + rewire App.js → SetupScreen

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/App.js` (SetupScreen prop block only)

- [ ] **Step 1: Add `DayTabReview` import to SetupScreen.js**

After the existing imports at the top of `SetupScreen.js`, add:
```js
import { DayTabReview } from '../components/DayTabReview';
```

- [ ] **Step 2: Replace the props signature of `SetupScreen`**

Replace the entire destructured parameter list (lines ~18–64) with:

```js
export function SetupScreen({
  userRole,
  onboardingStep,
  displayName,
  setDisplayName,
  groupName,
  setGroupName,
  inviteCodeInput,
  setInviteCodeInput,
  inviteCode,
  selectedChipColor,
  setSelectedChipColor,
  chipColorOptions,
  availableJoinColors,
  festivalDays,
  setFestivalDayLabel,
  onAddFestivalDay,
  onRemoveFestivalDay,
  loading,
  error,
  log,
  onBeginProfile,
  onCompleteFestivalSetup,
  onResetFlow,
  onChoosePath,
  // upload_all_days step
  uploadDayIndex,
  dayStates,
  onChooseDayScreenshot,
  onSkipDay,
  // review_days step
  onRetryDay,
  onDeleteDaySet,
  onAddDaySet,
  onSetDayPreference,
  onEditDaySet,
  onFinishUploadFlow,
}) {
```

- [ ] **Step 3: Remove the `upload_day` step block**

Delete the entire block:
```js
      {onboardingStep === 'upload_day' ? (() => {
        ...
      })() : null}
```
(This is the large IIFE block that renders the upload UI with `ActivityIndicator`, `dayParsedSets.map(...)`, etc.)

- [ ] **Step 4: Add `upload_all_days` and `review_days` step blocks**

In place of the removed block, add:

```jsx
      {onboardingStep === 'upload_all_days' ? (() => {
        const totalDays = (festivalDays || []).length;
        const dayPosition = (festivalDays || []).findIndex((d) => d.dayIndex === uploadDayIndex) + 1;
        const currentDay = (festivalDays || []).find((d) => d.dayIndex === uploadDayIndex);
        const dayLabel = currentDay?.label || `Day ${uploadDayIndex}`;
        const truncatedLabel = dayLabel.length > 15 ? dayLabel.slice(0, 15) + '…' : dayLabel;
        const dayState = (dayStates || {})[uploadDayIndex] || { status: 'idle' };

        return (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Upload {truncatedLabel} schedule</Text>
            <Text style={styles.helper}>Day {dayPosition} of {totalDays}</Text>
            {dayState.status === 'uploading' ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator color={C.primary} size="small" />
                <Text style={styles.helper}>Uploading in background…</Text>
              </View>
            ) : dayState.status === 'done' ? (
              <Text style={styles.helper}>✓ {(dayState.sets || []).length} artists found</Text>
            ) : dayState.status === 'failed' ? (
              <Text style={[styles.helper, { color: C.error }]}>Upload failed — retry in review</Text>
            ) : null}
            <ActionButton
              label="Choose Screenshot"
              onPress={() => onChooseDayScreenshot(uploadDayIndex)}
              primary
              disabled={loading}
            />
            <ActionButton
              label="Skip This Day"
              onPress={onSkipDay}
              disabled={loading}
            />
          </View>
        );
      })() : null}

      {onboardingStep === 'review_days' ? (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Review Your Schedule</Text>
          <Text style={styles.helper}>Check each day and fix any mistakes.</Text>
          <DayTabReview
            festivalDays={festivalDays || []}
            dayStates={dayStates || {}}
            onRetry={onRetryDay}
            onDeleteSet={onDeleteDaySet}
            onAddSet={onAddDaySet}
            onSetPreference={onSetDayPreference}
            onEditSet={onEditDaySet}
          />
          <ActionButton
            label="Finish →"
            onPress={onFinishUploadFlow}
            primary
            disabled={loading || Object.values(dayStates || {}).some((d) => d.status === 'uploading')}
          />
        </View>
      ) : null}
```

- [ ] **Step 5: Rewire App.js → SetupScreen props**

In `App.js`, find the `<SetupScreen ... />` JSX block (lines ~1129–1175) and replace the entire prop list with:

```jsx
        <SetupScreen
          userRole={userRole}
          onboardingStep={onboardingStep}
          displayName={displayName}
          setDisplayName={setDisplayName}
          groupName={groupName}
          setGroupName={setGroupName}
          inviteCodeInput={inviteCodeInput}
          setInviteCodeInput={setInviteCodeInput}
          inviteCode={inviteCode}
          selectedChipColor={selectedChipColor}
          setSelectedChipColor={setSelectedChipColor}
          chipColorOptions={CHIP_COLOR_OPTIONS}
          availableJoinColors={availableJoinColors}
          festivalDays={festivalDays}
          setFestivalDayLabel={setFestivalDayLabel}
          onAddFestivalDay={addFestivalDay}
          onRemoveFestivalDay={removeFestivalDay}
          loading={loading}
          error={error}
          log={log}
          onBeginProfile={beginProfile}
          onCompleteFestivalSetup={completeFestivalSetup}
          onResetFlow={resetFlow}
          onChoosePath={choosePath}
          uploadDayIndex={uploadDayIndex}
          dayStates={dayStates}
          onChooseDayScreenshot={chooseAndUploadDayScreenshot}
          onSkipDay={skipPickDay}
          onRetryDay={retryDayUpload}
          onDeleteDaySet={deleteDaySet}
          onAddDaySet={addDaySet}
          onSetDayPreference={setDaySetPreference}
          onEditDaySet={editCanonicalSet}
          onFinishUploadFlow={finishUploadFlow}
        />
```

- [ ] **Step 6: Verify the full upload flow end-to-end**

1. Start Expo: `cd apps/mobile && npx expo start`
2. Go through onboarding to the `upload_all_days` step
3. Pick Friday screenshot → confirm the UI immediately advances to Saturday
4. Pick Saturday → confirm it advances to Sunday
5. Pick Sunday → confirm it transitions to `review_days`
6. Confirm the tab bar shows Fri/Sat/Sun with spinners for days still parsing
7. Wait for parsing to finish — confirm spinners become set counts
8. Try adding an artist manually on a day
9. Tap "Finish →" — confirm it's disabled while any day is uploading, enabled after

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/App.js
git commit -m "feat: replace upload_day step with upload_all_days + review_days tabbed flow"
git push
```

---

## Task 4: Update EditMyScheduleScreen.js + rewire App.js → EditMyScheduleScreen

**Files:**
- Modify: `apps/mobile/src/screens/EditMyScheduleScreen.js`
- Modify: `apps/mobile/App.js` (EditMyScheduleScreen prop block only)

- [ ] **Step 1: Update `EditMyScheduleScreen.js`**

Replace the entire file contents with:

```js
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DayTabReview } from '../components/DayTabReview';
import { useTheme } from '../theme';

export function EditMyScheduleScreen({
  personalSets,
  festivalDays,
  loading,
  onImportPersonal,
  onRefreshPersonal,
  onSetAllMustSee,
  onSetPreference,
  onDeleteSet,
  onAddSet,
  onEditSet,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  // Build dayStates from personalSets so DayTabReview can render them
  const dayStates = useMemo(() => {
    const result = {};
    for (const day of (festivalDays || [])) {
      result[day.dayIndex] = {
        status: 'done',
        sets: (personalSets || []).filter((s) => s.day_index === day.dayIndex),
        retryCount: 0,
        imageUris: null,
      };
    }
    return result;
  }, [festivalDays, personalSets]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Update Your Schedule</Text>
        <Text style={styles.helper}>Upload more screenshots if your plans changed.</Text>
        <Pressable onPress={onImportPersonal} style={[styles.buttonPrimary, loading && styles.buttonDisabled]} disabled={loading}>
          <Text style={styles.buttonText}>Upload + Re-Parse</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable onPress={onRefreshPersonal} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
          <Pressable onPress={onSetAllMustSee} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>All Must-See</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 4 }} /> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          Your Schedule ({(personalSets || []).length} artists)
        </Text>
        {(festivalDays || []).length === 0 ? (
          <Text style={styles.helper}>No schedule loaded yet.</Text>
        ) : (
          <DayTabReview
            festivalDays={festivalDays || []}
            dayStates={dayStates}
            onRetry={() => {}}
            onDeleteSet={(canonicalSetId) => onDeleteSet(canonicalSetId)}
            onAddSet={(fields) => onAddSet(fields)}
            onSetPreference={(canonicalSetId, pref) => onSetPreference(canonicalSetId, pref)}
            onEditSet={onEditSet}
          />
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8,
  },
  label: { fontWeight: '700', color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  row: { flexDirection: 'row', gap: 8 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: C.btnSecondaryBg,
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
});
```

Note: `onDeleteSet`, `onAddSet`, and `onSetPreference` callbacks receive `(canonicalSetId, dayIndex)` / `(fields, dayIndex)` / `(canonicalSetId, pref, dayIndex)` from `DayTabReview`, but `EditMyScheduleScreen` ignores the `dayIndex` arg since the parent (`App.js`) `deletePersonalSet` / `addPersonalSet` / `setPreference` functions don't need it — the `day_index` is already in `fields` for add, and the API call uses only the canonical set ID for delete/preference.

- [ ] **Step 2: Rewire App.js → EditMyScheduleScreen props**

Find the `<EditMyScheduleScreen ... />` JSX block in `App.js` (lines ~1204–1218) and replace with:

```jsx
        <EditMyScheduleScreen
          personalSets={personalSets}
          festivalDays={festivalDays}
          loading={loading}
          onImportPersonal={importPersonal}
          onRefreshPersonal={refreshPersonal}
          onSetAllMustSee={setAllMustSee}
          onSetPreference={setPreference}
          onDeleteSet={deletePersonalSet}
          onAddSet={addPersonalSet}
          onEditSet={editCanonicalSet}
        />
```

- [ ] **Step 3: Verify `EditMyScheduleScreen` end-to-end**

1. Start Expo: `cd apps/mobile && npx expo start`
2. Complete onboarding so you reach the main group view
3. Open the hamburger menu → tap "Edit My Schedule"
4. Confirm the screen shows a tab bar with the festival days
5. Confirm artists are grouped under the correct day tab
6. Add an artist manually, confirm it appears under the correct tab
7. Delete an artist, confirm it disappears
8. Toggle must-see / maybe on an artist, confirm the preference updates

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/EditMyScheduleScreen.js apps/mobile/App.js
git commit -m "feat: update EditMyScheduleScreen to use DayTabReview with per-day tabs"
git push
```
