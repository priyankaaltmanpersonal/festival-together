---
name: Feedback Round 2 Bug Fixes
description: Six UI/UX fixes from user testing: time validation, all-stages grid, immediate edit propagation, time-ordered add, MoreSheet collapse, sticky time column
type: project
---

# Feedback Round 2 Bug Fixes

## 1. Start/End Time Validation

**Where:** `AddArtistForm.handleAdd` in `DayTabReview.js` and `EditableSetCard.handleSave` in `EditableSetCard.js`

**Change:** Before calling the API, check if `startDate >= endDate` (comparing total minutes = hours * 60 + minutes). If so, set the form error "End time must be after start time." and return early. Both forms already have error display (`formError` / `saveError`).

**Edge case:** Times that cross midnight (e.g., start 11:00 PM, end 1:00 AM). The existing `timeToMinutes` logic in the grid already handles this by treating hours < 6 as h + 24. Apply the same logic here so crossing midnight is valid.

## 2. Grid Always Shows All Stages

**Where:** `GroupScheduleScreen.js`, `stageColumns` computation (line ~56)

**Change:** Remove the `.filter((stage) => filteredSets.some((s) => s.stage_name === stage))` before the `.map()`. All stages from `scheduleSnapshot.stages` will always appear as columns, even if no sets are assigned to them for the selected day.

**Non-issue:** If zero sets exist for the entire day, `buildTimeline` already returns `null` and the grid doesn't render at all — the all-stages change only affects days that have at least one set somewhere.

## 3. Immediate Edit Propagation to Grid

**Where:** `App.js`

### 3a. `deletePersonalSet`

Currently only removes from `personalSets`. Add optimistic updates to also:
- Remove the user from `scheduleSnapshot.sets[x].attendees` for the deleted canonical set, and decrement `attendee_count`.
- Remove the set from `individualSnapshot.members[me].sets`.

On API error, roll back all three state values (capture snapshots before update).

### 3b. `editCanonicalSet`

Currently only updates `personalSets`. After the API call succeeds, also update `scheduleSnapshot.sets` — spread `fields` (artist_name, stage_name, start_time_pt, end_time_pt) onto the matching set by `canonical_set_id`.

## 4. Time-Ordered Insert on Add

**Where:** `addPersonalSet` in `App.js` (line ~957)

**Change:** Replace `[...prev, newSet]` with a sorted insert:
```
[...prev, newSet].sort((a, b) => {
  if (a.day_index !== b.day_index) return a.day_index - b.day_index;
  const minutesOf = (t) => {
    const [h, m] = t.split(':').map(Number);
    return (h < 6 ? h + 24 : h) * 60 + m;
  };
  return minutesOf(a.start_time_pt) - minutesOf(b.start_time_pt);
})
```

## 5. MoreSheet Height Collapse Fix

**Where:** `MoreSheet.js`

**Problem:** `<KeyboardAvoidingView style={{ flex: 1 }}>` inside a `Pressable` (the sheet) that has no explicit height. `flex: 1` against an unconstrained parent collapses to 0, producing the invisible sheet.

**Fix:** Remove `style={{ flex: 1 }}` from `KeyboardAvoidingView`. The sheet's `maxHeight: '75%'` and the ScrollView's content will correctly size the sheet. `KeyboardAvoidingView` still provides keyboard avoidance for the profile name input without needing flex.

## 6. Sticky Time Column on Horizontal Scroll

**Where:** `GroupScheduleScreen.js`

**Problem:** The time column is inside the horizontal `ScrollView`, so it scrolls away when panning right.

**Restructured layout:**

```
<View flexDirection="row" flex={1}>
  ┌─────────────────┬─────────────────────────────────────┐
  │  Fixed 70px     │  <ScrollView horizontal>             │
  │  time panel     │    stage headers (no "Time" cell)    │
  │  ─ "Time" hdr   │    <ScrollView vertical, synced>     │
  │  <ScrollView    │      stage columns                   │
  │   scrollEnabled │    </ScrollView>                     │
  │   ={false}      │  </ScrollView>                       │
  │   ref=timeRef>  │                                      │
  │   time labels   │                                      │
  │  </ScrollView>  │                                      │
  └─────────────────┴─────────────────────────────────────┘
</View>
```

**Scroll sync:** The right (stage) vertical `ScrollView` has `onScroll` + `scrollEventThrottle={16}`. On each scroll event, call `timeScrollRef.current?.scrollTo({ y: contentOffset.y, animated: false })` to keep the time column in sync.

The `gridHeader` row moves inside the horizontal `ScrollView` (stage headers only). A matching time header cell sits above the fixed time column outside the horizontal scroll. Both share the same height (`GRID_HEADER_HEIGHT`).

The `gridBodyHeight` calculation (`containerHeight - filterHeight - GRID_HEADER_HEIGHT`) is unchanged.
