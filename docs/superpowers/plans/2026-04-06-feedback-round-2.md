# Feedback Round 2 Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six UI/UX bugs: time validation, all-stages grid, immediate edit propagation, time-ordered inserts, MoreSheet height collapse, and sticky time column.

**Architecture:** All changes are in the React Native mobile app (`apps/mobile/`). No new files needed — modifications are spread across `App.js`, `GroupScheduleScreen.js`, `DayTabReview.js`, `EditableSetCard.js`, and `MoreSheet.js`. Each task is independent and can be committed separately.

**Tech Stack:** React Native (Expo), JavaScript, no test runner present — manual verification via Expo Go / simulator after each task.

---

## Files Modified

- `apps/mobile/App.js` — Tasks 3 and 4 (`deletePersonalSet`, `editCanonicalSet`, `addPersonalSet`)
- `apps/mobile/src/screens/GroupScheduleScreen.js` — Tasks 2 and 6 (all-stages, sticky time column)
- `apps/mobile/src/components/DayTabReview.js` — Task 1 (`AddArtistForm` time validation)
- `apps/mobile/src/components/EditableSetCard.js` — Task 1 (`handleSave` time validation)
- `apps/mobile/src/components/MoreSheet.js` — Task 5 (height collapse fix)

---

### Task 1: Start/End Time Validation

**Files:**
- Modify: `apps/mobile/src/components/DayTabReview.js` — `handleAdd` in `AddArtistForm`
- Modify: `apps/mobile/src/components/EditableSetCard.js` — `handleSave`

**Context:** Both forms use `Date` objects for start/end times (from `DateTimePicker`). We compare total minutes to detect invalid ranges. Hours < 6 are treated as next-day (h + 24) so crossing midnight is valid (e.g., 11 PM → 1 AM is fine; 1 AM → 11 PM is invalid).

- [ ] **Step 1: Add validation helper in `DayTabReview.js`**

In `DayTabReview.js`, add the helper function `timeToTotalMinutes` right after the `makeDefaultTime` function (line ~29):

```js
function timeToTotalMinutes(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h < 6 ? h + 24 : h) * 60 + m;
}
```

- [ ] **Step 2: Add validation to `AddArtistForm.handleAdd` in `DayTabReview.js`**

In `AddArtistForm.handleAdd` (line ~44), add time validation after the name/stage check:

```js
const handleAdd = async () => {
  if (!name.trim() || !stage.trim()) {
    setFormError('Artist name and stage are required.');
    return;
  }
  if (timeToTotalMinutes(startDate) >= timeToTotalMinutes(endDate)) {
    setFormError('End time must be after start time.');
    return;
  }
  setSaving(true);
  setFormError('');
  // ... rest unchanged
```

- [ ] **Step 3: Add validation helper in `EditableSetCard.js`**

In `EditableSetCard.js`, add the same helper after the `formatHHMM` function (line ~38):

```js
function timeToTotalMinutes(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h < 6 ? h + 24 : h) * 60 + m;
}
```

- [ ] **Step 4: Add validation to `EditableSetCard.handleSave`**

In `EditableSetCard.handleSave` (line ~94), add validation before the `try` block:

```js
const handleSave = async () => {
  setSaveError('');
  if (timeToTotalMinutes(editStart) >= timeToTotalMinutes(editEnd)) {
    setSaveError('End time must be after start time.');
    return;
  }
  try {
    // ... rest unchanged
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/DayTabReview.js apps/mobile/src/components/EditableSetCard.js
git commit -m "fix: validate start time is before end time in add and edit forms"
```

---

### Task 2: Grid Always Shows All Stages

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js` — `stageColumns` computation (~line 56)

- [ ] **Step 1: Remove the stage filter from `stageColumns`**

Find the `stageColumns` computation in `GroupScheduleScreen.js` (currently lines 56–63):

```js
const stageColumns = stages
  .filter((stage) => filteredSets.some((s) => s.stage_name === stage))
  .map((stage) => ({
    stage,
    sets: filteredSets
      .filter((item) => item.stage_name === stage)
      .sort((a, b) => timeToMinutes(a.start_time_pt) - timeToMinutes(b.start_time_pt)),
  }));
```

Replace with (remove the `.filter(...)` line):

```js
const stageColumns = stages
  .map((stage) => ({
    stage,
    sets: filteredSets
      .filter((item) => item.stage_name === stage)
      .sort((a, b) => timeToMinutes(a.start_time_pt) - timeToMinutes(b.start_time_pt)),
  }));
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/GroupScheduleScreen.js
git commit -m "fix: always show all stages in grid even if no artists are scheduled"
```

---

### Task 3: Immediate Edit Propagation to Grid

**Files:**
- Modify: `apps/mobile/App.js` — `deletePersonalSet` (~line 919) and `editCanonicalSet` (~line 988)

- [ ] **Step 1: Update `deletePersonalSet` to also update snapshots**

Find `deletePersonalSet` in `App.js` (~line 919). Replace the entire function with:

```js
const deletePersonalSet = async (canonicalSetId) => {
  const previousPersonalSets = personalSets;
  const previousScheduleSnapshot = scheduleSnapshot;
  const previousIndividualSnapshot = individualSnapshot;
  const myId = homeSnapshot?.me?.id;

  setPersonalSets((prev) => prev.filter((s) => s.canonical_set_id !== canonicalSetId));

  if (myId && scheduleSnapshot) {
    setScheduleSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sets: (prev.sets || []).map((setItem) => {
          if (setItem.canonical_set_id !== canonicalSetId) return setItem;
          const newAttendees = (setItem.attendees || []).filter((a) => a.member_id !== myId);
          return { ...setItem, attendees: newAttendees, attendee_count: newAttendees.length };
        }),
      };
    });
  }

  if (myId && individualSnapshot) {
    setIndividualSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: (prev.members || []).map((member) =>
          member.member_id !== myId
            ? member
            : { ...member, sets: (member.sets || []).filter((s) => s.canonical_set_id !== canonicalSetId) }
        ),
      };
    });
  }

  try {
    await apiRequest({
      baseUrl: apiUrl,
      path: `/v1/members/me/sets/${canonicalSetId}`,
      method: 'DELETE',
      sessionToken: memberSession,
    });
  } catch (err) {
    setPersonalSets(previousPersonalSets);
    setScheduleSnapshot(previousScheduleSnapshot);
    setIndividualSnapshot(previousIndividualSnapshot);
    setError(friendlyError(err instanceof Error ? err.message : String(err)));
  }
};
```

- [ ] **Step 2: Update `editCanonicalSet` to also update `scheduleSnapshot`**

Find `editCanonicalSet` in `App.js` (~line 988). Replace the entire function with:

```js
const editCanonicalSet = async (canonicalSetId, fields) => {
  await apiRequest({
    baseUrl: apiUrl,
    path: `/v1/canonical-sets/${canonicalSetId}`,
    method: 'PATCH',
    sessionToken: memberSession,
    body: fields,
  });
  setPersonalSets((prev) =>
    prev.map((s) =>
      s.canonical_set_id === canonicalSetId ? { ...s, ...fields } : s
    )
  );
  setScheduleSnapshot((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      sets: (prev.sets || []).map((setItem) =>
        setItem.canonical_set_id !== canonicalSetId
          ? setItem
          : { ...setItem, ...fields }
      ),
    };
  });
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.js
git commit -m "fix: propagate delete and edit changes immediately to grid without requiring refresh"
```

---

### Task 4: Time-Ordered Insert on Add

**Files:**
- Modify: `apps/mobile/App.js` — `addPersonalSet` (~line 937)

- [ ] **Step 1: Change `addPersonalSet` to insert in time order**

Find `addPersonalSet` in `App.js` (~line 937). The current last line inside the function reads:

```js
setPersonalSets((prev) => [...prev, newSet]);
```

Replace that line with:

```js
setPersonalSets((prev) => {
  const minutesOf = (t) => {
    const [h, m] = (t || '00:00').split(':').map(Number);
    return (h < 6 ? h + 24 : h) * 60 + m;
  };
  return [...prev, newSet].sort((a, b) => {
    if (a.day_index !== b.day_index) return a.day_index - b.day_index;
    return minutesOf(a.start_time_pt) - minutesOf(b.start_time_pt);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/App.js
git commit -m "fix: insert artist in time order when added manually or from grid"
```

---

### Task 5: MoreSheet Height Collapse Fix

**Files:**
- Modify: `apps/mobile/src/components/MoreSheet.js` — remove `style={{ flex: 1 }}` from `KeyboardAvoidingView`

**Context:** `KeyboardAvoidingView` with `flex: 1` inside a `Pressable` (sheet) that has no explicit height causes the component to collapse to 0 height. Removing `flex: 1` lets the sheet size naturally from its children, bounded by `maxHeight: '75%'`.

- [ ] **Step 1: Remove `flex: 1` from `KeyboardAvoidingView`**

In `MoreSheet.js`, find the `KeyboardAvoidingView` (line ~79):

```jsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={0}
  style={{ flex: 1 }}
>
```

Change to:

```jsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={0}
>
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/MoreSheet.js
git commit -m "fix: MoreSheet collapsed to zero height due to flex:1 on KeyboardAvoidingView"
```

---

### Task 6: Sticky Time Column on Horizontal Scroll

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js` — restructure grid layout

**Context:** The grid currently puts the time column inside the horizontal `ScrollView`, so it scrolls away when panning right. The fix moves the time column outside the horizontal scroll, using a ref-synced vertical `ScrollView` to keep time labels aligned with stage rows.

- [ ] **Step 1: Add `useRef` import and time scroll ref**

At the top of `GroupScheduleScreen.js`, `useRef` needs to be added to the import. Change line 1:

```js
import { useMemo, useRef, useState } from 'react';
```

Inside the `GroupScheduleScreen` component body, add a ref after the existing state declarations:

```js
const timeScrollRef = useRef(null);
```

- [ ] **Step 2: Replace the grid JSX with the new sticky-column layout**

Find the block starting at `{timeline ? (` (~line 130) and ending at `) : null}` after the closing `</ScrollView>` (~line 233). Replace the entire block with:

```jsx
{timeline ? (
  <View style={styles.gridOuter}>
    {/* Fixed left: time header + time body */}
    <View style={styles.timePanel}>
      <View style={[styles.headerCell, styles.timeCol, styles.headerText, styles.timePanelHeader]}>
        <Text style={styles.headerText}>Time</Text>
      </View>
      <ScrollView
        ref={timeScrollRef}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        style={gridBodyHeight ? { height: gridBodyHeight } : styles.gridVScroll}
      >
        <View style={[styles.timeCol, { height: timeline.totalHeight }]}>
          {timeline.labels.map((minute) => {
            const y = minuteToY(minute, timeline.startMinute);
            return (
              <View key={`time-${minute}`} style={[styles.timeTick, { top: y }]}>
                <Text style={styles.timeText}>{formatTime(minute)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>

    {/* Scrollable right: stage headers + stage bodies */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stagesHScroll}>
      <View>
        <View style={styles.gridHeader}>
          {stageColumns.map((column) => (
            <Text key={column.stage} style={[styles.headerCell, styles.stageCol, styles.headerText]}>
              {column.stage}
            </Text>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={gridBodyHeight ? { height: gridBodyHeight } : styles.gridVScroll}
          onScroll={(e) => {
            timeScrollRef.current?.scrollTo({
              y: e.nativeEvent.contentOffset.y,
              animated: false,
            });
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.gridBody}>
            {stageColumns.map((column) => (
              <View key={column.stage} style={[styles.stageCol, { height: timeline.totalHeight }]}>
                {timeline.labels.map((minute) => (
                  <View
                    key={`${column.stage}-${minute}`}
                    style={[styles.rowLine, { top: minuteToY(minute, timeline.startMinute) }]}
                  />
                ))}

                {column.sets.map((setItem) => {
                  const top = minuteToY(timeToMinutes(setItem.start_time_pt), timeline.startMinute);
                  const startMin = timeToMinutes(setItem.start_time_pt);
                  const endMin = setItem.end_time_pt ? timeToMinutes(setItem.end_time_pt) : startMin;
                  const rawDuration = endMin - startMin;
                  const duration = rawDuration > 0 ? rawDuration : 90;
                  const height = Math.max(26, (duration / SLOT_MINUTES) * SLOT_HEIGHT - 2);
                  const definite = (setItem.attendees || []).filter((a) => a.preference === 'must_see');
                  const maybe = (setItem.attendees || []).filter((a) => a.preference !== 'must_see');
                  const maybeCount = Math.max(0, (setItem.attendee_count || 0) - definite.length);
                  const maxRows = height < 43 ? 1 : 2;
                  const maxBubbles = maxRows * BUBBLES_PER_ROW;
                  const hasOverflow = definite.length > maxBubbles;
                  const shownBubbles = hasOverflow
                    ? definite.slice(0, maxBubbles - 1)
                    : definite.slice(0, maxBubbles);
                  const overflowCount = hasOverflow ? definite.length - (maxBubbles - 1) : 0;
                  const actualRows = Math.ceil(shownBubbles.length / BUBBLES_PER_ROW) || 1;
                  const bubblesHeight = actualRows === 1 ? 16 : 35;
                  const showSummary = height >= bubblesHeight + 40;

                  return (
                    <View key={setItem.id} style={[styles.setCardWrap, { top, height }]}>
                      <Pressable
                        onPress={() => setExpandedSet({ ...setItem, definite, maybe })}
                        style={[styles.setTag, tierStyle(setItem.popularity_tier, C)]}
                      >
                        <Text style={styles.artistText} numberOfLines={1}>{setItem.artist_name}</Text>
                        <Text style={styles.timeRangeText} numberOfLines={1}>
                          {setItem.start_time_pt}{setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt ? `–${setItem.end_time_pt}` : ''}
                        </Text>
                        <View style={styles.pin}>
                          <View style={styles.attendeeRow}>
                            {shownBubbles.map((attendee) => (
                              <View
                                key={attendee.member_id}
                                style={[
                                  styles.attendeeBubble,
                                  { backgroundColor: attendee.chip_color || memberColorById[attendee.member_id] || C.attendeeBg }
                                ]}
                              >
                                <Text style={styles.attendeeText}>{initials(attendee.display_name)}</Text>
                              </View>
                            ))}
                            {overflowCount > 0 ? (
                              <View style={styles.overflowBubble}>
                                <Text style={styles.overflowText}>+{overflowCount}</Text>
                              </View>
                            ) : null}
                          </View>
                          {showSummary ? (
                            <Text style={styles.summaryText} numberOfLines={1}>
                              {definite.length} definitely · {maybeCount} maybe
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  </View>
) : null}
```

- [ ] **Step 3: Update styles in `makeStyles`**

In the `makeStyles` function, make these changes:

Remove `gridHScroll` and `gridVScroll` styles (they're replaced). Add the new styles. The full updated style block for the grid-related entries should be:

```js
gridOuter: {
  flex: 1,
  flexDirection: 'row',
},
timePanel: {
  width: 70,
  borderRightWidth: 1,
  borderColor: C.gridBorder,
},
timePanelHeader: {
  borderBottomWidth: 1,
  borderColor: C.gridBorder,
  height: GRID_HEADER_HEIGHT,
  justifyContent: 'center',
},
stagesHScroll: {
  flex: 1,
},
gridVScroll: { flex: 1 },
gridHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.gridBorder },
headerCell: {
  paddingHorizontal: 6,
  paddingVertical: 6,
  borderRightWidth: 1,
  borderColor: C.gridBorder,
},
gridBody: { flexDirection: 'row' },
timeCol: { width: 70, backgroundColor: C.gridTimeBg },
stageCol: { width: 130, borderRightWidth: 1, borderColor: C.gridBorder, position: 'relative', backgroundColor: C.gridStageBg },
headerText: { fontWeight: '700', color: C.gridHeaderText, fontSize: 12 },
timeTick: { position: 'absolute', left: 4 },
timeText: { color: C.gridTimeText, fontWeight: '700', fontSize: 11 },
rowLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: C.gridRowLine },
```

Note: `timeCol` no longer needs `borderRightWidth` since `timePanel` handles the border. Remove `borderRightWidth` from `timeCol`. The `timePanelHeader` has `height: GRID_HEADER_HEIGHT` (33) and `justifyContent: 'center'` so the "Time" text aligns with stage headers. The `headerCell` on the time panel header cell has `paddingVertical: 6` naturally giving ~33px height — use `timePanelHeader` to override and fix height explicitly.

- [ ] **Step 4: Verify `GRID_HEADER_HEIGHT` matches actual header height**

The stage header cells use `paddingVertical: 6` + `fontSize: 12` (lineHeight ~18) + `borderBottomWidth: 1` = ~31px. The constant `GRID_HEADER_HEIGHT = 33` (line 6) is a close approximation. Set `timePanelHeader` to `height: GRID_HEADER_HEIGHT` to align the time header with stage headers. No code change needed if the constant is correct — just verify visually.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/GroupScheduleScreen.js
git commit -m "fix: sticky time column when scrolling grid horizontally"
```

---

## Self-Review

**Spec coverage check:**
1. ✅ Time validation — Tasks 1 covers both AddArtistForm and EditableSetCard
2. ✅ All stages shown — Task 2
3. ✅ Delete propagates to grid — Task 3a
4. ✅ Edit propagates to grid — Task 3b
5. ✅ Time-ordered add — Task 4
6. ✅ MoreSheet fix — Task 5
7. ✅ Sticky time column — Task 6

**Placeholder scan:** No TBDs or vague steps. All code is complete.

**Type consistency:** 
- `canonicalSetId` used consistently across Tasks 3, 4
- `timeToTotalMinutes` defined locally in both files that use it (Task 1)
- `minutesOf` is defined inline in Task 4 (no cross-task dependency)
- `timeScrollRef` defined in Task 6 Step 1, used in Step 2 ✅
- `gridOuter`, `timePanel`, `stagesHScroll`, `timePanelHeader` defined in Step 3, used in Step 2 ✅
