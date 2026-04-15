# Feedback Round 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five UX improvements: muted mint card colors, "My Sets" grid toggle, modal cleanup (remove add button, always show nav link), onboarding text update for official lineup, and white ring on attendee bubbles for contrast.

**Architecture:** All changes are frontend-only. `theme/index.js` gets updated color tokens. `GroupScheduleScreen.js` gets a new `myOnly` state, updated filter/render logic, simplified modal footer, and bubble border. `SetupScreen.js` gets restructured `upload_all_days` branch. No backend changes.

**Tech Stack:** React Native, Jest + @testing-library/react-native

---

## File Map

| File | Change |
|---|---|
| `apps/mobile/src/theme/index.js` | Update 4 mint color token values |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Add `myOnly` toggle state + filter, update modal footer, remove `AddToScheduleFooter`, add bubble border |
| `apps/mobile/src/screens/SetupScreen.js` | Restructure `upload_all_days` step when `hasOfficialLineup` is true |
| `apps/mobile/src/__tests__/GroupScheduleScreen.test.js` | Add tests for My Sets toggle, modal cleanup |
| `apps/mobile/src/__tests__/SetupScreen.test.js` | Update and add tests for onboarding text change |

---

### Task 1: Update mint color tokens

**Files:**
- Modify: `apps/mobile/src/theme/index.js`

- [ ] **Step 1: Update the 4 mint token values**

In `apps/mobile/src/theme/index.js`, find the `// Per-user attendance card highlighting` block (currently after `// Popularity tiers`) and replace the 4 values:

```js
  // Per-user attendance card highlighting
  myAttendanceMaybeBg: '#edf5f2',
  myAttendanceMaybeBorder: '#b5cfc8',
  myAttendanceDefBg: '#d6ede6',
  myAttendanceDefBorder: '#8ab8ad',
```

- [ ] **Step 2: Run tests to confirm no breakage**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/theme/index.js && git commit -m "feat: mute mint attendance card colors"
```

---

### Task 2: Write failing tests for "My Sets" toggle

**Files:**
- Modify: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

- [ ] **Step 1: Add the failing test suite at the bottom of the file**

```js
describe('GroupScheduleScreen — My Sets toggle', () => {
  const MY_ID = 'member-me';

  function makeAttendedSet(id, myId, otherAttendees = []) {
    return {
      id,
      day_index: 1,
      artist_name: `Artist ${id}`,
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees: [
        { member_id: myId, display_name: 'Me', preference: 'must_see', chip_color: '#f00' },
        ...otherAttendees,
      ],
      attendee_count: 1 + otherAttendees.length,
      popularity_tier: null,
    };
  }

  it('shows My sets toggle button when myMemberId is provided', () => {
    const sets = [makeSet('a', 1, 'Artist A')];
    const { getByText } = render(
      <GroupScheduleScreen {...makeProps(sets, { myMemberId: MY_ID })} />
    );
    expect(getByText('My sets')).toBeTruthy();
  });

  it('does not show My sets toggle when myMemberId is null', () => {
    const sets = [makeSet('a', 1, 'Artist A')];
    const { queryByText } = render(
      <GroupScheduleScreen {...makeProps(sets, { myMemberId: null })} />
    );
    expect(queryByText('My sets')).toBeNull();
  });

  it('filters to only the current user\'s sets when My sets is active', () => {
    const sets = [
      makeAttendedSet('mine', MY_ID),
      { ...makeSet('other', 1, 'Other Artist'), attendees: [], attendee_count: 0 },
    ];
    const { getByText, queryByText } = render(
      <GroupScheduleScreen {...makeProps(sets, { myMemberId: MY_ID })} />
    );
    fireEvent.press(getByText('My sets'));
    expect(getByText('Artist mine')).toBeTruthy();
    expect(queryByText('Other Artist')).toBeNull();
  });

  it('shows empty state message when My sets is active and user has no attended sets', () => {
    const sets = [makeSet('a', 1, 'Some Artist')];
    const { getByText } = render(
      <GroupScheduleScreen {...makeProps(sets, { myMemberId: MY_ID })} />
    );
    fireEvent.press(getByText('My sets'));
    expect(getByText(/You haven't added any sets for this day yet/)).toBeTruthy();
  });

  it('deactivates Group Only when My sets is pressed', () => {
    const sets = [
      makeAttendedSet('mine', MY_ID),
      { ...makeSet('group', 1, 'Group Artist'), attendees: [{ member_id: 'other', display_name: 'Other', preference: 'must_see', chip_color: '#00f' }], attendee_count: 1 },
      { ...makeSet('empty', 1, 'Empty Artist'), attendees: [], attendee_count: 0 },
    ];
    const { getByText, queryByText } = render(
      <GroupScheduleScreen {...makeProps(sets, { myMemberId: MY_ID })} />
    );
    // Activate Group Only first
    fireEvent.press(getByText('Group only'));
    expect(queryByText('Empty Artist')).toBeNull();
    // Then activate My Sets — should deactivate Group Only and filter to my sets
    fireEvent.press(getByText('My sets'));
    expect(getByText('Artist mine')).toBeTruthy();
    expect(queryByText('Group Artist')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm the new suite fails**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: 5 new tests fail (My sets toggle not yet implemented). Previously passing tests still pass.

---

### Task 3: Implement "My Sets" toggle

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add `myOnly` state**

After the line `const [hideUnattended, setHideUnattended] = useState(false);`, add:

```js
const [myOnly, setMyOnly] = useState(false);
```

- [ ] **Step 2: Update `visibleSets` computation**

Find the current `visibleSets` block:

```js
const visibleSets = hideUnattended
  ? filteredSets.filter((s) => s.attendee_count > 0)
  : filteredSets;
```

Replace it with:

```js
const visibleSets = myOnly && myMemberId
  ? filteredSets.filter((s) => {
      const inServer = (s.attendees || []).some((a) => a.member_id === myMemberId);
      const optimistic = optimisticAttendance.get(s.id);
      return inServer || (optimistic && optimistic !== 'none');
    })
  : hideUnattended
    ? filteredSets.filter((s) => s.attendee_count > 0)
    : filteredSets;
```

- [ ] **Step 3: Update the toggleRow JSX**

Find the current toggleRow block:

```jsx
{hasUnattendedSets ? (
  <View style={styles.toggleRow}>
    <Pressable
      onPress={() => setHideUnattended((v) => !v)}
      style={[styles.togglePill, hideUnattended && styles.togglePillActive]}
    >
      <Text style={[styles.togglePillText, hideUnattended && styles.togglePillTextActive]}>
        Group only
      </Text>
    </Pressable>
  </View>
) : null}
```

Replace it with:

```jsx
{(hasUnattendedSets || myMemberId) ? (
  <View style={styles.toggleRow}>
    {hasUnattendedSets ? (
      <Pressable
        onPress={() => { setHideUnattended((v) => !v); setMyOnly(false); }}
        style={[styles.togglePill, hideUnattended && styles.togglePillActive]}
      >
        <Text style={[styles.togglePillText, hideUnattended && styles.togglePillTextActive]}>
          Group only
        </Text>
      </Pressable>
    ) : null}
    {myMemberId ? (
      <Pressable
        onPress={() => { setMyOnly((v) => !v); setHideUnattended(false); }}
        style={[styles.togglePill, myOnly && styles.togglePillActive]}
      >
        <Text style={[styles.togglePillText, myOnly && styles.togglePillTextActive]}>
          My sets
        </Text>
      </Pressable>
    ) : null}
  </View>
) : null}
```

- [ ] **Step 4: Add empty state rendering and update grid condition**

Find the current empty/grid render block:

```jsx
{!timeline ? <Text style={styles.helperPad}>No schedule loaded yet.</Text> : null}

{timeline ? (
  <View style={styles.gridOuter}>
    {/* ... grid content ... */}
  </View>
) : null}
```

Replace with:

```jsx
{myOnly && myMemberId && visibleSets.length === 0 ? (
  <View style={styles.myOnlyEmpty}>
    <Text style={styles.myOnlyEmptyText}>
      You haven't added any sets for this day yet. Double-tap a card to add one.
    </Text>
  </View>
) : !timeline ? (
  <Text style={styles.helperPad}>No schedule loaded yet.</Text>
) : (
  <View style={styles.gridOuter}>
    {/* ALL existing grid content unchanged — paste verbatim */}
  </View>
)}
```

- [ ] **Step 5: Add the two new styles to `makeStyles`**

Inside the `StyleSheet.create({...})` call, add after `hintText`:

```js
  myOnlyEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  myOnlyEmptyText: {
    color: C.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
```

- [ ] **Step 6: Run tests**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all 5 new "My Sets" tests pass. All previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
cd apps/mobile && git add src/screens/GroupScheduleScreen.js && git commit -m "feat: add My Sets toggle to group schedule grid"
```

---

### Task 4: Write failing tests for modal cleanup

**Files:**
- Modify: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

- [ ] **Step 1: Add failing tests at the bottom of the file**

```js
describe('GroupScheduleScreen — modal footer (round 6)', () => {
  const MY_ID = 'member-me';

  it('shows "Add in your schedule →" link when user is not attending an expanded set', () => {
    jest.useFakeTimers();
    const sets = [{
      id: 'set-noattend',
      day_index: 1,
      artist_name: 'Not Attending Artist',
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees: [],
      attendee_count: 0,
      popularity_tier: null,
    }];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onNavigateToEditSet: jest.fn() })}
      />
    );
    fireEvent.press(getByText('Not Attending Artist'));
    act(() => { jest.advanceTimersByTime(300); });
    expect(getByText('Add in your schedule →')).toBeTruthy();
    jest.useRealTimers();
  });

  it('does not render an "Add to My Schedule" button in the expanded modal', () => {
    jest.useFakeTimers();
    const sets = [{
      id: 'set-noadd',
      day_index: 1,
      artist_name: 'No Add Button Artist',
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees: [],
      attendee_count: 0,
      popularity_tier: null,
    }];
    const { getByText, queryByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onAddToMySchedule: jest.fn(), onNavigateToEditSet: jest.fn() })}
      />
    );
    fireEvent.press(getByText('No Add Button Artist'));
    act(() => { jest.advanceTimersByTime(300); });
    expect(queryByText('+ Add to My Schedule')).toBeNull();
    jest.useRealTimers();
  });

  it('tapping "Add in your schedule →" calls onNavigateToEditSet with the set\'s day_index', () => {
    jest.useFakeTimers();
    const onNavigate = jest.fn();
    const sets = [{
      id: 'set-nav',
      day_index: 2,
      artist_name: 'Nav Artist',
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees: [],
      attendee_count: 0,
      popularity_tier: null,
    }];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, {
          myMemberId: MY_ID,
          onNavigateToEditSet: onNavigate,
          festivalDays: [{ dayIndex: 2, label: 'Saturday' }],
        })}
      />
    );
    fireEvent.press(getByText('Nav Artist'));
    act(() => { jest.advanceTimersByTime(300); });
    fireEvent.press(getByText('Add in your schedule →'));
    expect(onNavigate).toHaveBeenCalledWith(2);
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to confirm the new suite fails**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: 3 new tests fail. Previously passing tests still pass.

---

### Task 5: Implement modal cleanup and bubble border

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Replace the modal footer block**

Find the existing modal footer block that starts with:
```jsx
{myMemberId && onAddToMySchedule ? (() => {
```

Replace the entire block (from `{myMemberId && onAddToMySchedule ?` through the closing `null}`) with:

```jsx
{myMemberId && onNavigateToEditSet ? (() => {
  const myAttendance = (expandedSet.attendees || []).find(
    (a) => a.member_id === myMemberId
  );
  const navigateToDay = () => {
    const dayIdx = expandedSet?.day_index;
    setExpandedSet(null);
    if (dayIdx != null) onNavigateToEditSet(dayIdx);
  };
  return (
    <>
      <View style={styles.modalDivider} />
      {myAttendance ? (
        <View style={styles.modalStatusPill}>
          <Text style={styles.modalStatusText}>
            ✓ On your schedule — {myAttendance.preference === 'must_see' ? 'Must See' : 'Maybe'}
          </Text>
          <Pressable onPress={navigateToDay}>
            <Text style={styles.modalEditLink}>Edit in your schedule →</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={navigateToDay}>
          <Text style={styles.modalEditLink}>Add in your schedule →</Text>
        </Pressable>
      )}
    </>
  );
})() : null}
```

- [ ] **Step 2: Delete the `AddToScheduleFooter` component**

Find and delete the entire `AddToScheduleFooter` function (from `function AddToScheduleFooter({` through its closing `}`). It is no longer used.

- [ ] **Step 3: Add white border to the attendee bubble style**

In `makeStyles`, find the `attendeeBubble` style:

```js
attendeeBubble: {
  width: 16,
  height: 16,
  borderRadius: 999,
  backgroundColor: C.attendeeBg,
  alignItems: 'center',
  justifyContent: 'center',
},
```

Replace with:

```js
attendeeBubble: {
  width: 16,
  height: 16,
  borderRadius: 999,
  backgroundColor: C.attendeeBg,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.75)',
},
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all 3 new modal tests pass. All previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
cd apps/mobile && git add src/screens/GroupScheduleScreen.js && git commit -m "feat: simplify modal footer and add bubble contrast border"
```

---

### Task 6: Write failing tests for onboarding text update

**Files:**
- Modify: `apps/mobile/src/__tests__/SetupScreen.test.js`

- [ ] **Step 1: Update the existing test that checks for `/Skip photos/` — it will break**

The existing test on line 67–70:
```js
it('shows Browse Full Lineup button when hasOfficialLineup is true', () => {
  const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: true })} />);
  expect(getByText('Browse Full Lineup →')).toBeTruthy();
  expect(getByText(/Skip photos/)).toBeTruthy();
});
```

Replace it with:
```js
it('shows Browse Full Lineup button when hasOfficialLineup is true', () => {
  const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: true })} />);
  expect(getByText('Browse Full Lineup →')).toBeTruthy();
});
```

(The `/Skip photos/` assertion is removed because that helper text is being replaced.)

- [ ] **Step 2: Add new tests at the bottom of the `upload_all_days` describe block**

```js
  it('shows lineup info message when hasOfficialLineup is true', () => {
    const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: true })} />);
    expect(getByText(/The full lineup is already imported/)).toBeTruthy();
  });

  it('shows Skip for Now (not Skip This Day) when hasOfficialLineup is true', () => {
    const { getByText, queryByText } = render(
      <SetupScreen {...makeProps({ hasOfficialLineup: true })} />
    );
    expect(getByText('Skip for Now')).toBeTruthy();
    expect(queryByText('Skip This Day')).toBeNull();
  });

  it('still shows Skip This Day when hasOfficialLineup is false', () => {
    const { getByText } = render(<SetupScreen {...makeProps({ hasOfficialLineup: false })} />);
    expect(getByText('Skip This Day')).toBeTruthy();
  });

  it('calls onSkipDay when Skip for Now is pressed (hasOfficialLineup true)', () => {
    const onSkipDay = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ hasOfficialLineup: true, onSkipDay })} />
    );
    fireEvent.press(getByText('Skip for Now'));
    expect(onSkipDay).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 3: Run tests to confirm the new tests fail**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: 4 new tests fail (implementation not yet updated). The updated existing test should now pass (it no longer asserts `/Skip photos/`).

---

### Task 7: Implement onboarding text update

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`

- [ ] **Step 1: Restructure the upload_all_days step action buttons**

In `SetupScreen.js`, inside the `upload_all_days` block, find the three action buttons + existing hasOfficialLineup conditional (currently after the day status display):

```jsx
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
{hasOfficialLineup ? (
  <>
    <View style={styles.orDivider}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>or</Text>
      <View style={styles.orLine} />
    </View>
    <ActionButton
      label="Browse Full Lineup →"
      onPress={onBrowseFullLineup}
      disabled={loading}
    />
    <Text style={styles.helper}>
      Skip photos — add artists directly from the full schedule
    </Text>
  </>
) : null}
```

Replace with:

```jsx
{hasOfficialLineup ? (
  <>
    <Text style={styles.helper}>
      The full lineup is already imported! You can add artists directly from the group grid, or upload a screenshot of your personal schedule to mark your picks.
    </Text>
    <ActionButton
      label="Browse Full Lineup →"
      onPress={onBrowseFullLineup}
      primary
      disabled={loading}
    />
    <View style={styles.orDivider}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>or</Text>
      <View style={styles.orLine} />
    </View>
    <ActionButton
      label="Choose Screenshot"
      onPress={() => onChooseDayScreenshot(uploadDayIndex)}
      disabled={loading}
    />
    <ActionButton
      label="Skip for Now"
      onPress={onSkipDay}
      disabled={loading}
    />
  </>
) : (
  <>
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
  </>
)}
```

- [ ] **Step 2: Run tests**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all 4 new onboarding tests pass. All previously passing tests still pass.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/screens/SetupScreen.js src/__tests__/SetupScreen.test.js && git commit -m "feat: promote lineup grid in onboarding when official lineup is imported"
```

---

### Task 8: Final verification and push

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass. Count should be 123 (previous) + 5 My Sets + 3 modal + 4 onboarding = 135 total.

- [ ] **Step 2: Push to remote**

```bash
git push
```
