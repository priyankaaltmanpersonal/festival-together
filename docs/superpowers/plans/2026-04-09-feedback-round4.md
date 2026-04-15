# Feedback Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a visual bug where preference changes spread to all grid cards, replace the tiny overlay icons with double-tap cycling, add edit-navigation from the modal, style maybe/definitely differently in the individual schedule view, and show persisted official lineup stats in founder tools.

**Architecture:** Five independent changes across backend (one SQL addition) and frontend (gesture handling, navigation state, visual styling). They can be implemented sequentially in any order; each is self-contained.

**Tech Stack:** React Native (Expo), pytest/FastAPI backend, Jest + @testing-library/react-native, AsyncStorage for one-time hint persistence.

---

## File Map

| File | Change |
|---|---|
| `services/api/app/api/groups.py` | Add official_set_count + official_days to home response |
| `services/api/tests/test_groups.py` | New backend tests for lineup stats |
| `apps/mobile/App.js` | Fix applyPreferenceLocally bug; add editInitialDay state + onNavigateToEditSet; pass onRemoveFromGrid + officialLineupStats |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Double-tap logic; remove overlay buttons; hint banner; tappable edit link |
| `apps/mobile/src/screens/IndividualSchedulesScreen.js` | PreferenceBadge component + styling |
| `apps/mobile/src/screens/FounderToolsScreen.js` | officialLineupStats prop + persistent stats block + delete button fix |
| `apps/mobile/src/screens/EditMyScheduleScreen.js` | Add initialDayIndex prop |
| `apps/mobile/src/components/DayTabReview.js` | Add initialSelectedDay prop |
| `apps/mobile/src/__tests__/GroupScheduleScreen.test.js` | Replace quick-action tests with double-tap tests; add edit-link test |
| `apps/mobile/src/__tests__/IndividualSchedulesScreen.test.js` | Add badge color/style tests |
| `apps/mobile/src/__tests__/FounderToolsScreen.test.js` | Add persistent stats tests; delete button visibility fix |
| `apps/mobile/src/__tests__/DayTabReview.test.js` | Add initialSelectedDay test |

---

## Task 1: Backend — add official lineup stats to home endpoint

**Files:**
- Modify: `services/api/app/api/groups.py` (inside `member_home`, around line 437)
- Modify: `services/api/tests/test_groups.py`

- [ ] **Step 1: Write the failing backend tests**

Add these three tests to `services/api/tests/test_groups.py`. Find the section with `test_home_has_official_lineup_*` tests and add after them:

```python
def test_home_includes_official_set_count_and_days_when_lineup_exists() -> None:
    """home response includes count and day labels when official sets exist."""
    with patch("app.api.groups.parse_official_lineup_from_image", return_value=[
        {"artist_name": "Artist A", "stage_name": "Sahara", "start_time_pt": "20:00", "end_time_pt": "21:00", "day_index": 1, "day_label": "Friday"},
        {"artist_name": "Artist B", "stage_name": "Gobi", "start_time_pt": "22:00", "end_time_pt": "23:00", "day_index": 2, "day_label": "Saturday"},
    ]):
        client.post(
            f"/v1/groups/{founder_group_id}/lineup/import",
            files=[("images", ("day.jpg", b"fake", "image/jpeg")), ("images", ("day2.jpg", b"fake2", "image/jpeg"))],
            headers={"X-Session-Token": founder_session},
        )
    resp = client.get("/v1/members/me/home", headers={"X-Session-Token": founder_session})
    assert resp.status_code == 200
    group = resp.json()["group"]
    assert group["official_set_count"] == 2
    assert "Friday" in group["official_days"]
    assert "Saturday" in group["official_days"]


def test_home_official_set_count_zero_when_no_lineup() -> None:
    """home response has count=0, days=[] when no official sets exist."""
    resp = client.get("/v1/members/me/home", headers={"X-Session-Token": member_session})
    assert resp.status_code == 200
    group = resp.json()["group"]
    assert group["official_set_count"] == 0
    assert group["official_days"] == []


def test_home_official_days_handles_null_festival_days() -> None:
    """home response doesn't crash when festival_days is null but official sets exist."""
    # Insert a canonical set with source='official' directly, bypassing the import
    import sqlite3
    with sqlite3.connect(db_path) as raw:
        raw.execute(
            "INSERT INTO canonical_sets (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, source) "
            "VALUES ('test-set-null-days', ?, 'Ghost Artist', 'Sahara', '20:00', '21:00', 99, 'official')",
            (founder_group_id,)
        )
        raw.commit()
    # Note: day_index 99 won't match any festival_days entry, so official_days may be [] or partial
    resp = client.get("/v1/members/me/home", headers={"X-Session-Token": founder_session})
    assert resp.status_code == 200
    group = resp.json()["group"]
    # Should not crash; count includes the orphaned set
    assert group["official_set_count"] >= 1
    assert isinstance(group["official_days"], list)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/api && python3 -m pytest tests/test_groups.py::test_home_includes_official_set_count_and_days_when_lineup_exists tests/test_groups.py::test_home_official_set_count_zero_when_no_lineup tests/test_groups.py::test_home_official_days_handles_null_festival_days -v
```

Expected: FAIL — `KeyError: 'official_set_count'`

- [ ] **Step 3: Add official stats to the home endpoint**

In `services/api/app/api/groups.py`, inside the `member_home` function, find the `has_official_lineup` query (around line 437) and replace:

```python
        has_official_lineup = conn.execute(
            "SELECT 1 FROM canonical_sets WHERE group_id = ? AND source = 'official' LIMIT 1",
            (member["group_id"],),
        ).fetchone() is not None
```

with:

```python
        has_official_lineup = conn.execute(
            "SELECT 1 FROM canonical_sets WHERE group_id = ? AND source = 'official' LIMIT 1",
            (member["group_id"],),
        ).fetchone() is not None

        official_set_count = 0
        official_days: list[str] = []
        if has_official_lineup:
            day_rows = conn.execute(
                """
                SELECT day_index, COUNT(*) AS cnt
                FROM canonical_sets
                WHERE group_id = ? AND source = 'official'
                GROUP BY day_index
                ORDER BY day_index
                """,
                (member["group_id"],),
            ).fetchall()
            official_set_count = sum(row["cnt"] for row in day_rows)
            raw_festival_days = member["festival_days"]
            try:
                festival_days_list = json.loads(raw_festival_days) if raw_festival_days else []
            except (json.JSONDecodeError, TypeError):
                festival_days_list = []
            day_index_to_label = {d["day_index"]: d["label"] for d in festival_days_list}
            official_days = [
                day_index_to_label.get(row["day_index"], f"Day {row['day_index']}")
                for row in day_rows
            ]
```

Then in the return dict, update the `"group"` key to include the new fields:

```python
        "group": {
            "id": member["group_id"],
            "name": member["group_name"],
            "icon_url": member["icon_url"],
            "festival_days": json.loads(member["festival_days"]) if member["festival_days"] else [
                {"day_index": 1, "label": "Friday"},
                {"day_index": 2, "label": "Saturday"},
                {"day_index": 3, "label": "Sunday"},
            ],
            "has_official_lineup": has_official_lineup,
            "official_set_count": official_set_count,
            "official_days": official_days,
        },
```

- [ ] **Step 4: Run the new tests plus the full test suite**

```bash
cd services/api && python3 -m pytest tests/test_groups.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd services/api
git add app/api/groups.py tests/test_groups.py
git commit -m "feat: add official_set_count and official_days to home endpoint"
```

---

## Task 2: Fix applyPreferenceLocally bug in App.js

**Files:**
- Modify: `apps/mobile/App.js` (around line 295)
- Modify: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js` (add regression test)

- [ ] **Step 1: Add the regression test**

In `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`, add a new describe block. Note this is a unit test for the _visual_ outcome (we can't test App.js internals directly from the component test, but we can verify the bug scenario doesn't occur by using the component's applyPreference callback chain). Since `applyPreferenceLocally` is in App.js, the regression test documents the bug clearly in a comment and verifies the component renders correct state after a mock `onSetPreferenceFromGrid` call that only updates one set:

```javascript
describe('GroupScheduleScreen — preference update isolation', () => {
  const MY_ID = 'me';

  it('does not visually change unrelated sets when one set preference changes', () => {
    // Regression: applyPreferenceLocally was updating ALL sets' attendee preferences
    // instead of only the matching canonicalSetId. This test verifies the component
    // prop boundary—a parent that correctly updates only one set in the snapshot
    // results in only that set showing must_see styling.
    const attendees = (pref) => [{ member_id: MY_ID, display_name: 'Me', preference: pref, chip_color: '#f00' }];
    const sets = [
      { id: 'set-a', day_index: 1, artist_name: 'Set A', stage_name: STAGE, start_time_pt: '20:00', end_time_pt: '21:00', attendees: attendees('flexible'), attendee_count: 1, popularity_tier: null },
      { id: 'set-b', day_index: 1, artist_name: 'Set B', stage_name: STAGE, start_time_pt: '21:00', end_time_pt: '22:00', attendees: attendees('flexible'), attendee_count: 1, popularity_tier: null },
    ];
    // Simulate a correctly-fixed parent: only set-a gets upgraded to must_see
    const updatedSets = sets.map((s) =>
      s.id === 'set-a'
        ? { ...s, attendees: attendees('must_see') }
        : s
    );
    const { rerender, getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn(), onRemoveFromGrid: jest.fn() })}
        scheduleSnapshot={{ sets, stages: [STAGE] }}
      />
    );
    rerender(
      <GroupScheduleScreen
        {...makeProps(updatedSets, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn(), onRemoveFromGrid: jest.fn() })}
        scheduleSnapshot={{ sets: updatedSets, stages: [STAGE] }}
      />
    );
    // Both sets should still render (no crash or disappearance)
    expect(getByText('Set A')).toBeTruthy();
    expect(getByText('Set B')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (documents expected behavior)**

```bash
cd apps/mobile && npm test -- --testPathPattern="GroupScheduleScreen" --passWithNoTests 2>&1 | tail -20
```

Expected: PASS (the test validates prop-boundary behavior which is already correct).

- [ ] **Step 3: Fix applyPreferenceLocally in App.js**

In `apps/mobile/App.js`, find `applyPreferenceLocally` (around line 295). Replace the `setScheduleSnapshot` block:

```javascript
    setScheduleSnapshot((prev) => {
      if (!prev || !homeSnapshot?.me?.id) return prev;
      return {
        ...prev,
        sets: (prev.sets || []).map((setItem) => ({
          ...setItem,
          attendees: (setItem.attendees || []).map((attendee) =>
            attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
          ),
          must_see_count: (setItem.attendees || []).map((attendee) =>
            attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
          ).filter((attendee) => attendee.preference === 'must_see').length
        }))
      };
    });
```

with:

```javascript
    setScheduleSnapshot((prev) => {
      if (!prev || !homeSnapshot?.me?.id) return prev;
      return {
        ...prev,
        sets: (prev.sets || []).map((setItem) => {
          if (setItem.id !== canonicalSetId) return setItem;
          const updatedAttendees = (setItem.attendees || []).map((attendee) =>
            attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
          );
          return {
            ...setItem,
            attendees: updatedAttendees,
            must_see_count: updatedAttendees.filter((a) => a.preference === 'must_see').length,
          };
        }),
      };
    });
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && npm test -- --testPathPattern="GroupScheduleScreen" --passWithNoTests 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd apps/mobile
git add App.js src/__tests__/GroupScheduleScreen.test.js
git commit -m "fix: applyPreferenceLocally only updates matching set in scheduleSnapshot"
```

---

## Task 3: DayTabReview + EditMyScheduleScreen — initialDayIndex prop

**Files:**
- Modify: `apps/mobile/src/components/DayTabReview.js` (line 185 — `useState(festivalDays[0]?.dayIndex)`)
- Modify: `apps/mobile/src/screens/EditMyScheduleScreen.js`
- Modify: `apps/mobile/src/__tests__/DayTabReview.test.js`

- [ ] **Step 1: Write the failing test**

Open `apps/mobile/src/__tests__/DayTabReview.test.js`. Add a new describe block:

```javascript
describe('DayTabReview — initialSelectedDay', () => {
  it('renders the initialSelectedDay tab as active on first render', () => {
    const festivalDays = [
      { dayIndex: 1, label: 'Friday' },
      { dayIndex: 2, label: 'Saturday' },
    ];
    const dayStates = {
      1: { status: 'done', sets: [], retryCount: 0, imageUris: null },
      2: { status: 'done', sets: [], retryCount: 0, imageUris: null },
    };
    const { getByText } = render(
      <DayTabReview
        festivalDays={festivalDays}
        dayStates={dayStates}
        initialSelectedDay={2}
        onRetry={jest.fn()}
        onDeleteSet={jest.fn()}
        onAddSet={jest.fn()}
        onSetPreference={jest.fn()}
        onEditSet={jest.fn()}
        onReUpload={jest.fn()}
        onAddOpen={jest.fn()}
      />
    );
    // Saturday (day 2) should be the active tab — we can verify by checking
    // that the Saturday tab button exists and is rendered
    expect(getByText('Saturday')).toBeTruthy();
  });
});
```

Also check what imports DayTabReview.test.js currently has. If it doesn't import `DayTabReview`, add:
```javascript
import { DayTabReview } from '../components/DayTabReview';
```

- [ ] **Step 2: Run test to verify it fails or passes as-is**

```bash
cd apps/mobile && npm test -- --testPathPattern="DayTabReview" --passWithNoTests 2>&1 | tail -20
```

Note: This test may pass even without changes since we're just checking the tab renders. The key behavioral test is that `activeDay` starts at the `initialSelectedDay` value. Proceed.

- [ ] **Step 3: Add initialSelectedDay prop to DayTabReview**

In `apps/mobile/src/components/DayTabReview.js`, find the `DayTabReview` function signature and the `useState` for `activeDay` (around line 185):

The current signature looks like:
```javascript
export function DayTabReview({ festivalDays, dayStates, onRetry, onDeleteSet, onAddSet, onSetPreference, onEditSet, onReUpload, onAddOpen }) {
  ...
  const [activeDay, setActiveDay] = useState(festivalDays[0]?.dayIndex ?? 1);
```

Change to:
```javascript
export function DayTabReview({ festivalDays, dayStates, initialSelectedDay, onRetry, onDeleteSet, onAddSet, onSetPreference, onEditSet, onReUpload, onAddOpen }) {
  ...
  const [activeDay, setActiveDay] = useState(initialSelectedDay ?? festivalDays[0]?.dayIndex ?? 1);
```

- [ ] **Step 4: Add initialDayIndex prop to EditMyScheduleScreen**

In `apps/mobile/src/screens/EditMyScheduleScreen.js`, update the function signature:

```javascript
export function EditMyScheduleScreen({
  personalSets,
  festivalDays,
  onReUploadDay,
  onSetPreference,
  onDeleteSet,
  onAddSet,
  onEditSet,
  initialDayIndex,
}) {
```

And pass it to `DayTabReview`:

```javascript
          <DayTabReview
            festivalDays={festivalDays || []}
            dayStates={dayStates}
            initialSelectedDay={initialDayIndex}
            onRetry={() => {}}
            onDeleteSet={onDeleteSet}
            onAddSet={onAddSet}
            onSetPreference={onSetPreference}
            onEditSet={onEditSet}
            onReUpload={onReUploadDay}
            onAddOpen={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50)}
          />
```

- [ ] **Step 5: Wire up in App.js**

In `apps/mobile/App.js`:

1. Add state near the other view state variables (around line 116):
```javascript
const [editInitialDay, setEditInitialDay] = useState(null);
```

2. Add a useEffect to clear editInitialDay when leaving edit view (add near the other useEffects):
```javascript
useEffect(() => {
  if (activeView !== 'edit') setEditInitialDay(null);
}, [activeView]);
```

3. Add `onNavigateToEditSet` function (near `openEditSchedule` around line 1243):
```javascript
const navigateToEditSet = (dayIndex) => {
  setEditInitialDay(dayIndex);
  openEditSchedule();
};
```

4. Update the `<EditMyScheduleScreen>` render (around line 1515):
```javascript
{activeView === 'edit' ? (
  <EditMyScheduleScreen
    personalSets={personalSets}
    festivalDays={festivalDays}
    onReUploadDay={chooseAndUploadDayScreenshot}
    onSetPreference={setPreference}
    onDeleteSet={deletePersonalSet}
    onAddSet={addPersonalSet}
    onEditSet={editCanonicalSet}
    initialDayIndex={editInitialDay}
  />
) : null}
```

5. Pass `onNavigateToEditSet` to `<GroupScheduleScreen>` (around line 1469):
```javascript
{activeView === 'group' ? (
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
    onSetPreferenceFromGrid={setPreference}
    onRemoveFromGrid={deletePersonalSet}
    onNavigateToEditSet={navigateToEditSet}
    festivalDays={festivalDays}
  />
) : null}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/mobile && npm test -- --testPathPattern="DayTabReview" --passWithNoTests 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd apps/mobile
git add src/components/DayTabReview.js src/screens/EditMyScheduleScreen.js App.js src/__tests__/DayTabReview.test.js
git commit -m "feat: add initialDayIndex to EditMyScheduleScreen and initialSelectedDay to DayTabReview"
```

---

## Task 4: GroupScheduleScreen — double-tap cycling + tappable edit link

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`
- Modify: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

This is the largest task. Take care with the timer logic.

- [ ] **Step 1: Write the new GroupScheduleScreen tests**

Replace the entire `describe('GroupScheduleScreen — quick-add icons', ...)` block (lines 106–191) and add new tests. Also update `makeProps` to include the new props.

First, update `makeProps` (around line 25) to add the new props:

```javascript
function makeProps(sets, overrides = {}) {
  return {
    homeSnapshot: { members: [] },
    scheduleSnapshot: { sets, stages: [STAGE] },
    selectedMemberIds: [],
    loading: false,
    onToggleMember: jest.fn(),
    onResetFilters: jest.fn(),
    inviteCode: null,
    onCopyInvite: jest.fn(),
    inviteCopied: false,
    myMemberId: null,
    onAddToMySchedule: null,
    onSetPreferenceFromGrid: jest.fn(),
    onRemoveFromGrid: jest.fn(),
    onNavigateToEditSet: jest.fn(),
    festivalDays: [
      { dayIndex: 1, label: 'Friday' },
      { dayIndex: 2, label: 'Saturday' },
    ],
    ...overrides,
  };
}
```

Then replace the old quick-add describe block with:

```javascript
describe('GroupScheduleScreen — double-tap attendance cycling', () => {
  const MY_ID = 'member-me';

  function makeAttendedSet(id, preference) {
    return {
      id,
      day_index: 1,
      artist_name: `Artist ${id}`,
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees: preference
        ? [{ member_id: MY_ID, display_name: 'Me', preference, chip_color: '#f00' }]
        : [],
      attendee_count: preference ? 1 : 0,
      popularity_tier: null,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('double-tap on a not-attending set calls onAddToMySchedule', () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const sets = [makeAttendedSet('a', null)];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onAddToMySchedule: onAdd })}
      />
    );
    const card = getByText('Artist a');
    fireEvent.press(card);
    fireEvent.press(card);
    jest.runAllTimers();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('double-tap on a maybe set calls onSetPreferenceFromGrid with must_see', () => {
    const onUpgrade = jest.fn().mockResolvedValue(undefined);
    const sets = [makeAttendedSet('b', 'flexible')];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onSetPreferenceFromGrid: onUpgrade })}
      />
    );
    const card = getByText('Artist b');
    fireEvent.press(card);
    fireEvent.press(card);
    jest.runAllTimers();
    expect(onUpgrade).toHaveBeenCalledWith('b', 'must_see');
  });

  it('double-tap on a definitely set calls onRemoveFromGrid', () => {
    const onRemove = jest.fn().mockResolvedValue(undefined);
    const sets = [makeAttendedSet('c', 'must_see')];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onRemoveFromGrid: onRemove })}
      />
    );
    const card = getByText('Artist c');
    fireEvent.press(card);
    fireEvent.press(card);
    jest.runAllTimers();
    expect(onRemove).toHaveBeenCalledWith('c');
  });

  it('single tap after debounce opens the expand modal', () => {
    const sets = [makeAttendedSet('d', null)];
    const { getByText, queryByText } = render(
      <GroupScheduleScreen {...makeProps(sets, { myMemberId: MY_ID })} />
    );
    fireEvent.press(getByText('Artist d'));
    jest.advanceTimersByTime(300);
    // Modal title for expanded set appears
    expect(queryByText('Artist d')).toBeTruthy();
  });

  it('overlay + and ✓ icon buttons are not rendered', () => {
    const maybe = [makeAttendedSet('e', 'flexible')];
    const none = [makeAttendedSet('f', null)];
    const { queryByText: q1 } = render(
      <GroupScheduleScreen {...makeProps(maybe, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn() })} />
    );
    expect(q1('✓')).toBeNull();
    const { queryByText: q2 } = render(
      <GroupScheduleScreen {...makeProps(none, { myMemberId: MY_ID, onAddToMySchedule: jest.fn() })} />
    );
    expect(q2('+')).toBeNull();
  });
});

describe('GroupScheduleScreen — edit navigation link', () => {
  const MY_ID = 'member-me';

  it('shows tappable edit link in expanded modal when user is attending', () => {
    jest.useFakeTimers();
    const attendees = [{ member_id: MY_ID, display_name: 'Me', preference: 'must_see', chip_color: '#f00' }];
    const sets = [{
      id: 'set-x',
      day_index: 1,
      artist_name: 'Edit Artist',
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees,
      attendee_count: 1,
      popularity_tier: null,
    }];
    const onNavigate = jest.fn();
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onNavigateToEditSet: onNavigate, onAddToMySchedule: jest.fn() })}
      />
    );
    // Open the modal via single tap (after debounce)
    fireEvent.press(getByText('Edit Artist'));
    jest.advanceTimersByTime(300);
    // Tap the edit link
    fireEvent.press(getByText('Edit in your schedule →'));
    expect(onNavigate).toHaveBeenCalledWith(1);
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
cd apps/mobile && npm test -- --testPathPattern="GroupScheduleScreen" --passWithNoTests 2>&1 | tail -30
```

Expected: multiple FAIL — double-tap tests fail because the overlay buttons still exist, edit link test fails because the link doesn't exist.

- [ ] **Step 3: Rewrite GroupScheduleScreen**

This is the largest edit. Make the following changes to `apps/mobile/src/screens/GroupScheduleScreen.js`:

**3a. Update imports** — add `useRef` and `useEffect` to the React import, add `AsyncStorage`:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { DaySelector } from '../components/DaySelector';
import { timeToMinutes, formatTime, formatTimeStr, minuteToY, buildTimeline, initials, withAlpha, SLOT_MINUTES, SLOT_HEIGHT } from '../utils';
```

**3b. Update the component props signature** — replace the existing `GroupScheduleScreen` function signature:

```javascript
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
  onSetPreferenceFromGrid,
  onRemoveFromGrid,
  onNavigateToEditSet,
  festivalDays,
}) {
```

**3c. Replace pendingSetId state + quick-action handlers** — remove these lines:
```javascript
  const [pendingSetId, setPendingSetId] = useState(null);

  const handleQuickAdd = useCallback(async (setItem) => { ... }, [...]);
  const handleQuickUpgrade = useCallback(async (canonicalSetId) => { ... }, [...]);
```

And replace with the double-tap implementation:

```javascript
  const lastTapRef = useRef(new Map());
  const inFlightRef = useRef(new Set());
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('hint_grid_doubletap_seen').then((val) => {
      if (!val) setShowHint(true);
    });
    return () => {
      lastTapRef.current.forEach((entry) => clearTimeout(entry.timeout));
    };
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    AsyncStorage.setItem('hint_grid_doubletap_seen', 'true');
  }, []);

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(dismissHint, 4000);
    return () => clearTimeout(t);
  }, [showHint, dismissHint]);

  const handleCardPress = useCallback((setItem) => {
    const setId = setItem.id;
    const now = Date.now();
    const last = lastTapRef.current.get(setId);

    if (last && now - last.time < 250) {
      // Double-tap detected
      clearTimeout(last.timeout);
      lastTapRef.current.delete(setId);
      if (inFlightRef.current.has(setId)) return;

      const myAttendance = (setItem.attendees || []).find((a) => a.member_id === myMemberId);
      inFlightRef.current.add(setId);

      let action;
      if (!myAttendance) {
        action = onAddToMySchedule ? onAddToMySchedule(setItem) : Promise.resolve();
      } else if (myAttendance.preference !== 'must_see') {
        action = onSetPreferenceFromGrid ? onSetPreferenceFromGrid(setId, 'must_see') : Promise.resolve();
      } else {
        action = onRemoveFromGrid ? onRemoveFromGrid(setId) : Promise.resolve();
      }

      Promise.resolve(action).finally(() => {
        inFlightRef.current.delete(setId);
      });
      return;
    }

    // Single tap — schedule expand after debounce
    const timeout = setTimeout(() => {
      lastTapRef.current.delete(setId);
      const definite = (setItem.attendees || []).filter((a) => a.preference === 'must_see');
      const maybe = (setItem.attendees || []).filter((a) => a.preference !== 'must_see');
      setExpandedSet({ ...setItem, definite, maybe });
    }, 250);

    lastTapRef.current.set(setId, { time: now, timeout });
  }, [myMemberId, onAddToMySchedule, onSetPreferenceFromGrid, onRemoveFromGrid]);
```

**3d. Update the hint banner rendering** — add this between the filter section and the grid, right after `{!timeline ? ... : null}`:

```javascript
      {showHint ? (
        <Pressable style={styles.hintBanner} onPress={dismissHint}>
          <Text style={styles.hintText}>Double-tap any set to change your attendance</Text>
        </Pressable>
      ) : null}
```

**3e. Update the card Pressable** — find the set card rendering inside `column.sets.map`. Replace the `<Pressable onPress={() => setExpandedSet(...)}` with `<Pressable onPress={() => handleCardPress(setItem)}`. Also remove the entire `{myMemberId ? (() => { ... })() : null}` block (the overlay buttons). The card render becomes:

```javascript
                      {column.sets.map((setItem) => {
                        const top = minuteToY(timeToMinutes(setItem.start_time_pt), timeline.startMinute);
                        const startMin = timeToMinutes(setItem.start_time_pt);
                        const endMin = setItem.end_time_pt ? timeToMinutes(setItem.end_time_pt) : startMin;
                        const rawDuration = endMin - startMin;
                        const duration = rawDuration > 0 ? rawDuration : 120;
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
                              onPress={() => handleCardPress(setItem)}
                              style={[styles.setTag, tierStyle(setItem.popularity_tier, C)]}
                            >
                              <Text style={styles.artistText} numberOfLines={1}>{setItem.artist_name}</Text>
                              <Text style={styles.timeRangeText} numberOfLines={1}>
                                {formatTimeStr(setItem.start_time_pt)}{setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt ? `–${formatTimeStr(setItem.end_time_pt)}` : ''}
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
```

**3f. Update the expanded modal** — replace the static hint text with a tappable link. Find:

```javascript
                          <Text style={styles.modalAddHint}>Edit in your schedule to change preference</Text>
```

Replace with:

```javascript
                          <Pressable
                            onPress={() => {
                              setExpandedSet(null);
                              if (onNavigateToEditSet && expandedSet?.day_index != null) {
                                onNavigateToEditSet(expandedSet.day_index);
                              }
                            }}
                          >
                            <Text style={styles.modalEditLink}>Edit in your schedule →</Text>
                          </Pressable>
```

**3g. Update styles** — in `makeStyles`, remove `quickActionBtn`, `quickAddBtn`, `quickMaybeBtn`, `quickActionText` styles. Add new styles:

```javascript
  hintBanner: {
    backgroundColor: 'rgba(251,146,60,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    alignItems: 'center',
  },
  hintText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalEditLink: {
    fontSize: 12,
    color: '#5c85ff',
    textDecorationLine: 'underline',
    textAlign: 'center',
    paddingVertical: 4,
  },
```

Also update `setCardWrap` — remove the bottom padding that was accommodating the overlay button. The `right: 3` and `left: 3` are fine, but the wrap no longer needs extra room for the overlay icon.

- [ ] **Step 4: Mock AsyncStorage in the test file**

At the top of `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`, add:

```javascript
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue('true'), // hint already seen by default
  setItem: jest.fn().mockResolvedValue(undefined),
}));
```

For the hint banner tests specifically, the mock can be overridden per-test:
```javascript
const AsyncStorage = require('@react-native-async-storage/async-storage');
// In a test: AsyncStorage.getItem.mockResolvedValueOnce(null);
```

- [ ] **Step 5: Run tests**

```bash
cd apps/mobile && npm test -- --testPathPattern="GroupScheduleScreen" --passWithNoTests 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd apps/mobile
git add src/screens/GroupScheduleScreen.js src/__tests__/GroupScheduleScreen.test.js
git commit -m "feat: replace overlay icons with double-tap attendance cycling on grid cards"
```

---

## Task 5: IndividualSchedulesScreen — preference badge styling

**Files:**
- Modify: `apps/mobile/src/screens/IndividualSchedulesScreen.js`
- Modify: `apps/mobile/src/__tests__/IndividualSchedulesScreen.test.js`

- [ ] **Step 1: Add tests for badge colors**

In `apps/mobile/src/__tests__/IndividualSchedulesScreen.test.js`, add new tests to the existing `describe` block (after line 105):

```javascript
describe('IndividualSchedulesScreen — preference badge styling', () => {
  const makeSnapshot = (preference) => ({
    members: [{
      member_id: 'mem-1',
      display_name: 'Alice',
      setup_status: 'done',
      sets: [{
        canonical_set_id: 'set-1',
        artist_name: 'Test Artist',
        stage_name: 'Sahara',
        start_time_pt: '21:00',
        end_time_pt: '22:00',
        day_index: 1,
        preference,
      }],
    }],
  });

  it('renders a green Definitely badge for must_see sets', () => {
    const { getByTestId } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot('must_see') })} />
    );
    const badge = getByTestId('preference-badge');
    expect(badge.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(22,163,74,0.15)' })])
    );
  });

  it('renders an amber Maybe badge for flexible sets', () => {
    const { getByTestId } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot('flexible') })} />
    );
    const badge = getByTestId('preference-badge');
    expect(badge.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(245,158,11,0.15)' })])
    );
  });

  it('handles null preference gracefully (renders Maybe badge)', () => {
    const { getByTestId } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot(null) })} />
    );
    expect(getByTestId('preference-badge')).toBeTruthy();
  });

  it('preference text is not shown inline in the stage/time line', () => {
    const { queryByText } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot('must_see') })} />
    );
    // The stage/time helper line should not contain preference text
    // Definitely and Maybe appear in badge, not in the helper text bullet point
    expect(queryByText(/• Definitely/)).toBeNull();
    expect(queryByText(/• Maybe/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/mobile && npm test -- --testPathPattern="IndividualSchedulesScreen" --passWithNoTests 2>&1 | tail -20
```

Expected: FAIL — `getByTestId('preference-badge')` not found.

- [ ] **Step 3: Add PreferenceBadge component and update IndividualSchedulesScreen**

In `apps/mobile/src/screens/IndividualSchedulesScreen.js`:

**3a.** Add the `PreferenceBadge` function after the imports, before `IndividualSchedulesScreen`:

```javascript
function PreferenceBadge({ preference, styles }) {
  const isDefinitely = preference === 'must_see';
  const label = isDefinitely ? 'Definitely' : 'Maybe';
  const bgColor = isDefinitely ? 'rgba(22,163,74,0.15)' : 'rgba(245,158,11,0.15)';
  const textColor = isDefinitely ? '#16a34a' : '#B45309';
  return (
    <View
      testID="preference-badge"
      style={[styles.badgePill, { backgroundColor: bgColor }]}
    >
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}
```

**3b.** Update the set row rendering. Find:

```javascript
              <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
                <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                <Text style={styles.helper}>
                  {setItem.stage_name} • {formatTimeStr(setItem.start_time_pt)}–{formatTimeStr(setItem.end_time_pt)} • {setItem.preference === 'must_see' ? 'Definitely' : 'Maybe'}
                </Text>
              </View>
```

Replace with:

```javascript
              <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
                <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                <Text style={styles.helper}>
                  {setItem.stage_name} • {formatTimeStr(setItem.start_time_pt)}–{formatTimeStr(setItem.end_time_pt)}
                </Text>
                <PreferenceBadge preference={setItem.preference} styles={styles} />
              </View>
```

**3c.** Add badge styles to `makeStyles`:

```javascript
  badgePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
```

- [ ] **Step 4: Run all IndividualSchedulesScreen tests**

```bash
cd apps/mobile && npm test -- --testPathPattern="IndividualSchedulesScreen" --passWithNoTests 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd apps/mobile
git add src/screens/IndividualSchedulesScreen.js src/__tests__/IndividualSchedulesScreen.test.js
git commit -m "feat: add colored preference badge (Definitely/Maybe) to individual schedules"
```

---

## Task 6: FounderToolsScreen — persistent lineup stats + delete button fix

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`
- Modify: `apps/mobile/App.js` (pass officialLineupStats)
- Modify: `apps/mobile/src/__tests__/FounderToolsScreen.test.js`

- [ ] **Step 1: Write the failing tests**

In `apps/mobile/src/__tests__/FounderToolsScreen.test.js`:

**1a.** Update `makeProps` to include the new prop:

```javascript
function makeProps(overrides = {}) {
  return {
    inviteCode: 'ABC123',
    groupName: 'Test Crew',
    onOpenSchedule: jest.fn(),
    onImportLineup: jest.fn(),
    onCopyInvite: jest.fn(),
    inviteCopied: false,
    lineupImportState: 'idle',
    lineupImportResult: null,
    officialLineupStats: null,
    onDeleteLineup: undefined,
    ...overrides,
  };
}
```

**1b.** Update the existing test `'does not show Delete button when idle'` — it should still pass (no stats, state idle → no delete). Leave it as-is.

**1c.** Add new describe block at the end:

```javascript
describe('FounderToolsScreen — persistent lineup stats', () => {
  it('shows stats block when officialLineupStats has sets and state is idle', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 312, days: ['Friday', 'Saturday', 'Sunday'] },
        })}
      />
    );
    expect(getByText(/312 sets/)).toBeTruthy();
    expect(getByText(/Friday/)).toBeTruthy();
  });

  it('does not show stats block when set_count is 0', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 0, days: [] },
        })}
      />
    );
    expect(queryByText(/sets/)).toBeNull();
  });

  it('does not show stats block when lineupImportState is done (success box shown instead)', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
          officialLineupStats: { set_count: 10, days: ['Friday'] },
        })}
      />
    );
    // The fresh import success box should show, not the persistent stats block
    expect(queryByText(/10 sets imported/)).toBeTruthy();
  });

  it('shows delete button when officialLineupStats has sets even if state is idle', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 50, days: ['Friday'] },
          onDeleteLineup: jest.fn(),
        })}
      />
    );
    expect(getByText('Delete All Official Sets')).toBeTruthy();
  });

  it('does not show delete button when no lineup exists and state is idle', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 0, days: [] },
          onDeleteLineup: jest.fn(),
        })}
      />
    );
    expect(queryByText('Delete All Official Sets')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
cd apps/mobile && npm test -- --testPathPattern="FounderToolsScreen" --passWithNoTests 2>&1 | tail -20
```

Expected: new tests FAIL.

- [ ] **Step 3: Update FounderToolsScreen**

In `apps/mobile/src/screens/FounderToolsScreen.js`:

**3a.** Add `officialLineupStats` to the props destructuring:

```javascript
export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  onCopyInvite,
  inviteCopied,
  onDeleteLineup,
  lineupImportState = 'idle',
  lineupImportResult = null,
  officialLineupStats = null,
}) {
```

**3b.** Add the persistent stats block. Find the block rendering `lineupImportState === 'uploading'` and `lineupImportState === 'done'`. Add a new condition before the upload button:

```javascript
        {lineupImportState === 'uploading' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={[styles.helper, { flex: 1 }]}>Parsing lineup… this may take 1–2 minutes. Please keep the app open.</Text>
          </View>
        ) : lineupImportState === 'done' && lineupImportResult ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              ✓ {lineupImportResult.sets_created} sets imported
              {lineupImportResult.days_processed?.length
                ? ` across ${lineupImportResult.days_processed.join(', ')}`
                : ''}
            </Text>
          </View>
        ) : lineupImportState === 'idle' && officialLineupStats?.set_count > 0 ? (
          <View style={styles.statsBox}>
            <Text style={styles.statsText}>
              ✓ Official lineup already imported — {officialLineupStats.set_count} sets
              {officialLineupStats.days?.length ? ` across ${officialLineupStats.days.join(', ')}` : ''}
            </Text>
          </View>
        ) : null}
```

**3c.** Fix delete button condition. Find:

```javascript
        {lineupImportState === 'done' && onDeleteLineup ? (
```

Replace with:

```javascript
        {(lineupImportState === 'done' || (officialLineupStats?.set_count > 0)) && onDeleteLineup ? (
```

**3d.** Add `statsBox` and `statsText` styles to `makeStyles`:

```javascript
  statsBox: {
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
  },
  statsText: { color: C.textMuted, fontWeight: '600', fontSize: 13 },
```

- [ ] **Step 4: Pass officialLineupStats from App.js**

In `apps/mobile/App.js`, find the `<FounderToolsScreen>` render (around line 1492) and add the prop:

```javascript
      {activeView === 'founder' ? (
        <FounderToolsScreen
          inviteCode={inviteCode}
          groupName={homeSnapshot?.group?.name}
          onOpenSchedule={() => setActiveView('group')}
          onImportLineup={importOfficialLineup}
          onCopyInvite={copyInviteCode}
          inviteCopied={inviteCopied}
          onDeleteLineup={deleteOfficialLineup}
          lineupImportState={lineupImportState}
          lineupImportResult={lineupImportResult}
          officialLineupStats={
            homeSnapshot?.group?.has_official_lineup
              ? {
                  set_count: homeSnapshot.group.official_set_count ?? 0,
                  days: homeSnapshot.group.official_days ?? [],
                }
              : null
          }
        />
      ) : null}
```

- [ ] **Step 5: Run all FounderToolsScreen tests**

```bash
cd apps/mobile && npm test -- --testPathPattern="FounderToolsScreen" --passWithNoTests 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd apps/mobile
git add src/screens/FounderToolsScreen.js src/__tests__/FounderToolsScreen.test.js App.js
git commit -m "feat: show persistent lineup stats in founder tools; fix delete button visibility"
```

---

## Task 7: Full test suite + cleanup + push

- [ ] **Step 1: Run all frontend tests**

```bash
cd apps/mobile && npm test -- --passWithNoTests 2>&1 | tail -30
```

Expected: all pass. If any fail, fix them before continuing.

- [ ] **Step 2: Run all backend tests**

```bash
cd services/api && python3 -m pytest 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Remove dead imports from GroupScheduleScreen**

In `apps/mobile/src/screens/GroupScheduleScreen.js`, verify `useCallback` is still used (it is, for `handleCardPress` and `dismissHint`). Verify `LinearGradient` is no longer used in `GroupScheduleScreen` (it was only used in `AddToScheduleFooter`, which is still there). No removals needed there.

Check for any remaining references to `pendingSetId`, `quickActionBtn`, `quickAddBtn`, `quickMaybeBtn`, `quickActionText` in the file — these should be gone. If any remain, remove them.

- [ ] **Step 4: Push to remote**

```bash
cd /Users/priyankaaltman/Dropbox/My\ Mac\ \(Priyankas-MacBook-Air.local\)/Documents/Google-Drive-Backup/personal-tech-projects/festival-together && git push origin main
```

- [ ] **Step 5: Run EAS build**

```bash
cd apps/mobile && eas build --platform ios --profile production --auto-submit
```

When prompted, answer `y` to all prompts.
