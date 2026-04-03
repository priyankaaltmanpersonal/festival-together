# Quick-Add to Schedule from Group Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the group grid tap modal, let a user add a set they don't have to their schedule as "maybe" with one button tap.

**Architecture:** Two file changes only — `GroupScheduleScreen.js` gets the modal footer UI (new `AddToScheduleFooter` sub-component + `(you)` label on `AttendeeRow`), and `App.js` wires in `myMemberId` + `onAddToMySchedule` props. No backend changes.

**Tech Stack:** React Native, expo-linear-gradient, existing `addPersonalSet` API call in App.js.

---

## Files

- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`
- Modify: `apps/mobile/App.js`

---

### Task 1: Add `isSelf` label to `AttendeeRow` + new modal styles

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add `isSelf` prop to `AttendeeRow` and render "(you)" suffix**

In `GroupScheduleScreen.js`, update `AttendeeRow`:

```js
function AttendeeRow({ attendee, chipColor, isSelf = false }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.modalRow}>
      <View
        style={[
          styles.modalAvatar,
          { backgroundColor: withAlpha(chipColor || C.attendeeBg, 0.2), borderColor: chipColor || C.attendeeBg }
        ]}
      >
        <Text style={[styles.modalAvatarText, { color: chipColor || C.attendeeBg }]}>
          {initials(attendee.display_name)}
        </Text>
      </View>
      <Text style={styles.modalName}>
        {attendee.display_name}
        {isSelf ? <Text style={styles.modalSelfLabel}> (you)</Text> : null}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Add new styles to `makeStyles`**

Add these entries inside `makeStyles(C)`:

```js
  modalDivider: { height: 1, backgroundColor: C.cardBorder, marginVertical: 4 },
  modalStatusPill: {
    backgroundColor: C.primaryBg,
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: C.inputBorder,
    alignItems: 'center',
    gap: 3,
  },
  modalStatusText: { fontSize: 13, fontWeight: '700', color: C.kickerText, textAlign: 'center' },
  modalAddHint: { fontSize: 11, color: C.textMuted, textAlign: 'center' },
  modalSelfLabel: { color: C.textMuted, fontWeight: '400', fontSize: 13 },
  modalAddedPill: {
    backgroundColor: C.successBg,
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: C.successBorder,
    alignItems: 'center',
  },
  modalAddedText: { fontSize: 13, fontWeight: '800', color: C.success },
  modalAddError: { fontSize: 11, color: C.error, textAlign: 'center' },
  modalAddBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: C.primaryShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  modalAddBtnGradient: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
```

- [ ] **Step 3: Add `LinearGradient` import at top of `GroupScheduleScreen.js`**

```js
import { LinearGradient } from 'expo-linear-gradient';
```

- [ ] **Step 4: Verify the file still renders — no syntax errors**

Check: no red underlines in editor, or run `npx expo export --platform ios 2>&1 | head -20` from `apps/mobile/` — should complete without JS parse errors.

---

### Task 2: Add `AddToScheduleFooter` sub-component

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add `AddToScheduleFooter` component**

Add this just above the `makeStyles` definition (after `AttendeeRow`):

```js
function AddToScheduleFooter({ setItem, onAdd, onAdded }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    setAdding(true);
    setAddError('');
    try {
      await onAdd(setItem);
      setAdded(true);
      setTimeout(onAdded, 1000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add. Try again.');
    } finally {
      setAdding(false);
    }
  };

  if (added) {
    return (
      <View style={styles.modalAddedPill}>
        <Text style={styles.modalAddedText}>✓ Added as maybe!</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={handleAdd} disabled={adding} style={[styles.modalAddBtn, adding && { opacity: 0.6 }]}>
        <LinearGradient
          colors={C.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modalAddBtnGradient}
        >
          <Text style={styles.modalAddBtnText}>{adding ? 'Adding…' : '+ Add to My Schedule'}</Text>
        </LinearGradient>
      </Pressable>
      <Text style={styles.modalAddHint}>Adds as "maybe" — edit in your schedule to confirm</Text>
      {addError ? <Text style={styles.modalAddError}>{addError}</Text> : null}
    </View>
  );
}
```

Note: `useState` is already imported at the top of the file.

- [ ] **Step 2: Verify no syntax errors** (same check as Task 1 Step 4)

---

### Task 3: Wire footer into the modal + pass `isSelf` to attendee rows

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add `myMemberId` and `onAddToMySchedule` to the component props**

Update the `GroupScheduleScreen` function signature:

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
}) {
```

- [ ] **Step 2: Pass `isSelf` to each `AttendeeRow` in the modal**

Find the two places in the modal that render `<AttendeeRow>` and add `isSelf`:

```js
// In the "Definitely" list:
{expandedSet.definite.map((attendee) => (
  <AttendeeRow
    key={`def-${attendee.member_id}`}
    attendee={attendee}
    chipColor={attendee.chip_color || memberColorById[attendee.member_id]}
    isSelf={attendee.member_id === myMemberId}
  />
))}

// In the "Maybe" list:
{expandedSet.maybe.map((attendee) => (
  <AttendeeRow
    key={`maybe-${attendee.member_id}`}
    attendee={attendee}
    chipColor={attendee.chip_color || memberColorById[attendee.member_id]}
    isSelf={attendee.member_id === myMemberId}
  />
))}
```

- [ ] **Step 3: Add the footer below the Maybe section inside the modal `ScrollView`**

After the existing Maybe attendee block (after the `modalEmpty` text or the maybe list), add:

```js
{myMemberId && onAddToMySchedule ? (() => {
  const myAttendance = (expandedSet.attendees || []).find(
    (a) => a.member_id === myMemberId
  );
  return (
    <>
      <View style={styles.modalDivider} />
      {myAttendance ? (
        <View style={styles.modalStatusPill}>
          <Text style={styles.modalStatusText}>
            ✓ On your schedule — {myAttendance.preference === 'must_see' ? 'Must See' : 'Maybe'}
          </Text>
          <Text style={styles.modalAddHint}>Edit in your schedule to change preference</Text>
        </View>
      ) : (
        <AddToScheduleFooter
          setItem={expandedSet}
          onAdd={onAddToMySchedule}
          onAdded={() => setExpandedSet(null)}
        />
      )}
    </>
  );
})() : null}
```

- [ ] **Step 4: Verify no syntax errors** (same check as Task 1 Step 4)

---

### Task 4: Wire new props in `App.js`

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Add `addSetFromGrid` function in App.js**

Add this just after the existing `addPersonalSet` function (around line 950):

```js
const addSetFromGrid = async (setItem) => {
  await addPersonalSet({
    artist_name: setItem.artist_name,
    stage_name: setItem.stage_name,
    start_time_pt: setItem.start_time_pt,
    end_time_pt: setItem.end_time_pt,
    day_index: setItem.day_index,
  });
};
```

- [ ] **Step 2: Pass new props to `GroupScheduleScreen`**

Find the `<GroupScheduleScreen ... />` block in App.js (around line 1193) and add two props:

```jsx
<GroupScheduleScreen
  homeSnapshot={homeSnapshot}
  scheduleSnapshot={scheduleSnapshot}
  selectedMemberIds={selectedMemberIds}
  loading={loading}
  onToggleMember={...}
  onResetFilters={...}
  inviteCode={inviteCode}
  onCopyInvite={...}
  inviteCopied={inviteCopied}
  myMemberId={homeSnapshot?.me?.id}
  onAddToMySchedule={addSetFromGrid}
/>
```

Only `myMemberId` and `onAddToMySchedule` are new — leave all existing props exactly as they are.

---

### Task 5: Manual verification + commit

- [ ] **Step 1: Full manual test checklist**

Run the app (`npx expo start` from `apps/mobile/`) and verify:

1. Tap a set in the group grid that **you're not attending** → modal opens → "Add to My Schedule" gradient button appears below a divider → hint text "Adds as 'maybe'..." visible
2. Tap "Add to My Schedule" → button dims and shows "Adding…" → then "✓ Added as maybe!" green pill → modal closes after ~1 second
3. Reopen the group schedule → tap that same set → modal now shows the status pill "✓ On your schedule — Maybe" (not the add button)
4. Tap a set you're already attending as **Must See** → modal shows "✓ On your schedule — Must See"
5. Your name row in the attendee list shows "(you)" in muted text
6. Tap a set you're **not attending** while **offline** → "Add to My Schedule" button → tapping shows inline error (network error message)

- [ ] **Step 2: Commit**

```bash
cd apps/mobile
git add src/screens/GroupScheduleScreen.js
cd ../..
git add apps/mobile/App.js
git commit -m "feat: add quick-add to schedule from group grid modal

Tapping a set in the group grid now shows an Add to My Schedule button
in the detail modal when the user isn't attending. One tap adds as
maybe. Already-attending users see their current preference status.
Attendee rows show (you) to identify the current user.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```
