# Feedback Round 5: Double-Tap Feedback & Mint Card Highlighting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make double-tap on grid cards feel instant (haptic + scale pulse + optimistic state), and highlight cards where the current user is attending with a mint background.

**Architecture:** All changes are in `GroupScheduleScreen.js`. A `optimisticAttendance` state Map overrides server-provided attendee data for in-flight mutations. A `cardAnimRef` Map holds `Animated.Value` instances per card for the scale pulse. A new exported pure function `userAttendanceCardStyle` computes the mint override style. The theme gets 4 new color tokens.

**Tech Stack:** React Native `Animated` API, `expo-haptics`, `@testing-library/react-native`

---

### Task 1: Install expo-haptics and add test mock

**Files:**
- Modify: `apps/mobile/package.json` (via npm install)
- Modify: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

- [ ] **Step 1: Install expo-haptics**

```bash
cd apps/mobile && npx expo install expo-haptics
```

Expected: package installs successfully, `expo-haptics` appears in `package.json` dependencies.

- [ ] **Step 2: Add expo-haptics mock to the test file**

In `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`, add this mock block after the existing `jest.mock('@react-native-async-storage/async-storage', ...)` block:

```js
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));
```

- [ ] **Step 3: Run tests to confirm they still pass**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass (no change in behavior yet).

---

### Task 2: Add mint color tokens to theme

**Files:**
- Modify: `apps/mobile/src/theme/index.js`

- [ ] **Step 1: Add 4 new tokens to `lightColors`**

In `apps/mobile/src/theme/index.js`, add these entries inside the `lightColors` object, after the `// Popularity tiers` block and before the `// Attendee bubble` block:

```js
  // Per-user attendance card highlighting
  myAttendanceMaybeBg: '#e0f7ef',
  myAttendanceMaybeBorder: '#7dd4b0',
  myAttendanceDefBg: '#b8eedb',
  myAttendanceDefBorder: '#3db88a',
```

- [ ] **Step 2: Run tests to confirm no breakage**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass.

---

### Task 3: Write failing unit tests for `userAttendanceCardStyle`

**Files:**
- Modify: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

- [ ] **Step 1: Add import for `userAttendanceCardStyle` and `lightColors` at the top of the test file**

Add these two imports after the existing import lines:

```js
import { lightColors } from '../theme';
import { userAttendanceCardStyle } from '../screens/GroupScheduleScreen';
```

- [ ] **Step 2: Add the unit test suite at the bottom of the test file**

```js
describe('userAttendanceCardStyle', () => {
  it('returns empty object when preference is null (not attending)', () => {
    expect(userAttendanceCardStyle(null, lightColors)).toEqual({});
  });

  it('returns empty object when preference is "none"', () => {
    expect(userAttendanceCardStyle('none', lightColors)).toEqual({});
  });

  it('returns maybe mint style for flexible (maybe) preference', () => {
    const style = userAttendanceCardStyle('flexible', lightColors);
    expect(style.backgroundColor).toBe(lightColors.myAttendanceMaybeBg);
    expect(style.borderColor).toBe(lightColors.myAttendanceMaybeBorder);
  });

  it('returns definitely mint style for must_see preference', () => {
    const style = userAttendanceCardStyle('must_see', lightColors);
    expect(style.backgroundColor).toBe(lightColors.myAttendanceDefBg);
    expect(style.borderColor).toBe(lightColors.myAttendanceDefBorder);
  });
});
```

- [ ] **Step 3: Run tests to confirm the new tests fail**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: 4 new tests fail with something like `userAttendanceCardStyle is not a function` (the export does not exist yet). All previously passing tests still pass.

---

### Task 4: Export `userAttendanceCardStyle` and wire it into card render

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add `userAttendanceCardStyle` as an exported function at the bottom of the file**

Add this after the `tierStyle` function at the bottom of `GroupScheduleScreen.js`:

```js
export function userAttendanceCardStyle(preference, C) {
  if (preference === 'must_see') {
    return { backgroundColor: C.myAttendanceDefBg, borderColor: C.myAttendanceDefBorder };
  }
  if (preference != null && preference !== 'none') {
    return { backgroundColor: C.myAttendanceMaybeBg, borderColor: C.myAttendanceMaybeBorder };
  }
  return {};
}
```

- [ ] **Step 2: Run the 4 new tests to confirm they now pass**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all 4 `userAttendanceCardStyle` tests pass.

- [ ] **Step 3: Wire the style into the card render**

Inside the `column.sets.map((setItem) => { ... })` block in `GroupScheduleScreen.js`, this is the current card render starting at the `return (` inside the map. Replace the existing `<View key={setItem.id} ...>` wrapper and the `<Pressable style={[styles.setTag, tierStyle(...)]}` line with:

```jsx
// Compute current user's effective preference from server data
// (optimistic override added in Task 5)
const myEffectivePref = myMemberId
  ? ((setItem.attendees || []).find((a) => a.member_id === myMemberId)?.preference ?? null)
  : null;

return (
  <View key={setItem.id} style={[styles.setCardWrap, { top, height }]}>
    <Pressable
      onPress={() => handleCardPress(setItem)}
      style={[
        styles.setTag,
        tierStyle(setItem.popularity_tier, C),
        myMemberId ? userAttendanceCardStyle(myEffectivePref, C) : null,
      ]}
    >
```

The rest of the card JSX (artist name, time range, pin/bubbles) is unchanged. Close the `<View>` (not `</Animated.View>` yet — that comes in Task 6) and `</Pressable>` as before.

- [ ] **Step 4: Run all tests to confirm no regression**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass.

---

### Task 5: Add optimistic attendance state and update card render

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add optimistic state declarations**

Inside `GroupScheduleScreen`, after the `const inFlightRef = useRef(new Set());` and `const [showHint, setShowHint] = useState(false);` lines, add:

```js
const optimisticRef = useRef(new Map());
const [optimisticAttendance, setOptimisticAttendance] = useState(() => new Map());
optimisticRef.current = optimisticAttendance; // keep ref in sync for stable callbacks
```

- [ ] **Step 2: Update `handleCardPress` to write and revert optimistic state**

Replace the entire `handleCardPress` useCallback with:

```js
const handleCardPress = useCallback((setItem) => {
  const setId = setItem.id;
  const now = Date.now();
  const last = lastTapRef.current.get(setId);

  if (last && now - last.time < 250) {
    // Double-tap detected
    clearTimeout(last.timeout);
    lastTapRef.current.delete(setId);
    if (inFlightRef.current.has(setId)) return;

    // Determine current effective preference (optimistic takes priority)
    const myOptimistic = optimisticRef.current.get(setId);
    let currentPref;
    if (myOptimistic !== undefined) {
      currentPref = myOptimistic;
    } else {
      const myAttendee = myMemberId
        ? (setItem.attendees || []).find((a) => a.member_id === myMemberId)
        : null;
      currentPref = myAttendee?.preference ?? 'none';
    }

    // Determine next state and which API call to make
    let nextPref, action;
    if (!currentPref || currentPref === 'none') {
      nextPref = 'flexible';
      action = onAddToMySchedule ? onAddToMySchedule(setItem) : Promise.resolve();
    } else if (currentPref !== 'must_see') {
      nextPref = 'must_see';
      action = onSetPreferenceFromGrid ? onSetPreferenceFromGrid(setId, 'must_see') : Promise.resolve();
    } else {
      nextPref = 'none';
      action = onRemoveFromGrid ? onRemoveFromGrid(setId) : Promise.resolve();
    }

    // Write optimistic state immediately so card re-renders with mint color
    setOptimisticAttendance((prev) => {
      const next = new Map(prev);
      next.set(setId, nextPref);
      return next;
    });
    inFlightRef.current.add(setId);

    Promise.resolve(action)
      .then(() => {
        // Server confirmed — clear optimistic override (real parent state will take over)
        setOptimisticAttendance((prev) => {
          const next = new Map(prev);
          next.delete(setId);
          return next;
        });
      })
      .catch(() => {
        // Revert to previous preference on failure
        setOptimisticAttendance((prev) => new Map(prev).set(setId, currentPref));
      })
      .finally(() => {
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
// optimisticRef, cardAnimRef, setOptimisticAttendance are stable — safe to omit
```

- [ ] **Step 3: Update card render to compute effective attendees from optimistic state**

Inside `column.sets.map((setItem) => { ... })`, replace the existing lines that compute `definite`, `maybe`, and `maybeCount` (currently at the top of the map body) with:

```js
// Compute effectiveAttendees by applying optimistic override for current user
const myOptimistic = optimisticAttendance.get(setItem.id);
let effectiveAttendees = setItem.attendees || [];
if (myMemberId && myOptimistic !== undefined) {
  if (myOptimistic === 'none') {
    effectiveAttendees = effectiveAttendees.filter((a) => a.member_id !== myMemberId);
  } else {
    const alreadyIn = effectiveAttendees.some((a) => a.member_id === myMemberId);
    if (alreadyIn) {
      effectiveAttendees = effectiveAttendees.map((a) =>
        a.member_id === myMemberId ? { ...a, preference: myOptimistic } : a
      );
    } else {
      const myMember = members.find((m) => m.id === myMemberId);
      effectiveAttendees = [
        ...effectiveAttendees,
        {
          member_id: myMemberId,
          preference: myOptimistic,
          display_name: myMember?.display_name || '',
          chip_color: myMember?.chip_color || null,
        },
      ];
    }
  }
}

const definite = effectiveAttendees.filter((a) => a.preference === 'must_see');
const maybe = effectiveAttendees.filter((a) => a.preference !== 'must_see');
const maybeCount = maybe.length;
```

Also update `myEffectivePref` (from Task 4 Step 3) to use `effectiveAttendees` instead of `setItem.attendees`:

```js
const myEffectivePref = myMemberId
  ? (effectiveAttendees.find((a) => a.member_id === myMemberId)?.preference ?? null)
  : null;
```

The bubble rendering (`shownBubbles`, `overflowCount`, etc.) already uses the local `definite` variable, so no further changes needed there.

- [ ] **Step 4: Run all tests to confirm no regression**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass.

---

### Task 6: Add scale animation and haptic feedback

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`

- [ ] **Step 1: Add `Animated` to the react-native import**

At the top of `GroupScheduleScreen.js`, the current import is:

```js
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
```

Change it to:

```js
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
```

- [ ] **Step 2: Add expo-haptics import**

After the `import AsyncStorage` line, add:

```js
import * as Haptics from 'expo-haptics';
```

- [ ] **Step 3: Add `cardAnimRef` declaration**

Inside `GroupScheduleScreen`, after the `optimisticRef` / `optimisticAttendance` lines added in Task 5, add:

```js
const cardAnimRef = useRef(new Map());
```

- [ ] **Step 4: Add haptic + animation calls to the double-tap path in `handleCardPress`**

Inside `handleCardPress`, immediately after the `if (inFlightRef.current.has(setId)) return;` guard (and before the "Determine current effective preference" comment), insert:

```js
    // Haptic confirmation
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Scale pulse animation
    if (!cardAnimRef.current.has(setId)) {
      cardAnimRef.current.set(setId, new Animated.Value(1));
    }
    const anim = cardAnimRef.current.get(setId);
    Animated.spring(anim, { toValue: 1.07, tension: 300, friction: 8, useNativeDriver: true })
      .start(() => {
        Animated.spring(anim, { toValue: 1, tension: 300, friction: 8, useNativeDriver: true }).start();
      });
```

- [ ] **Step 5: Wrap the card in `Animated.View` with scale transform**

In the card render (inside `column.sets.map`), initialize the animation value before the `return (`:

```js
// Ensure animation value exists for this card (lazy init during render is safe — refs are stable)
if (!cardAnimRef.current.has(setItem.id)) {
  cardAnimRef.current.set(setItem.id, new Animated.Value(1));
}
const scaleAnim = cardAnimRef.current.get(setItem.id);
```

Then change the outer wrapper from `<View key={...} style={[styles.setCardWrap, { top, height }]}>` to:

```jsx
<Animated.View key={setItem.id} style={[styles.setCardWrap, { top, height, transform: [{ scale: scaleAnim }] }]}>
```

And change the closing `</View>` for that wrapper to `</Animated.View>`.

The `<Pressable>` and all its children are unchanged.

- [ ] **Step 6: Run all tests to confirm no regression**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass (Animated and expo-haptics are mocked in jest-expo; animation calls are no-ops in tests).

---

### Task 7: Final verification and commit

**Files:** none (verification only, then commit)

- [ ] **Step 1: Run the full test suite one final time**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests pass. Confirm the count includes the 4 new `userAttendanceCardStyle` tests.

- [ ] **Step 2: Commit**

```bash
cd apps/mobile && git add \
  src/theme/index.js \
  src/screens/GroupScheduleScreen.js \
  src/__tests__/GroupScheduleScreen.test.js \
  package.json
git commit -m "$(cat <<'EOF'
feat: instant double-tap feedback and mint card highlighting for attended sets

- Add haptic (Light impact) + spring scale pulse on double-tap confirmation
- Add optimistic attendance state so card color updates instantly (no network wait)
- Highlight user's maybe sets with light mint bg, definitely sets with deeper mint
- Install expo-haptics; add 4 new theme tokens for mint colors

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push to remote**

```bash
git push
```
