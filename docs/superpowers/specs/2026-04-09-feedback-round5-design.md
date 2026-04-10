# Feedback Round 5: Double-Tap Feedback & Per-User Card Highlighting

**Date:** 2026-04-09  
**Scope:** `GroupScheduleScreen` only — no backend changes

---

## Problem Summary

1. **Double-tap has no immediate feedback.** Registering a tap produces no perceptible response until the API round-trip completes (~1-2s), making users unsure whether the gesture was received.
2. **Cards for the current user's attended sets are indistinguishable** from other cards at a glance — the only signal is a tiny attendee bubble or small summary text.

---

## Design

### 1. Double-Tap Immediate Feedback

#### Haptic feedback
On double-tap detection (inside `handleCardPress`), call `Haptics.impactAsync(ImpactFeedbackStyle.Light)` from `expo-haptics`. Fires synchronously before the API call, giving the user an immediate tactile confirmation.

#### Scale pulse animation
- A `useRef(new Map())` (`cardAnimRef`) maps each `setId` to an `Animated.Value` (initialized to `1`).
- On double-tap, spring the value: `1 → 1.07 → 1` with `tension: 300, friction: 8` (~150ms).
- Each card's `Pressable` is wrapped in an `Animated.View` with `transform: [{ scale: cardAnimRef.current.get(setId) }]`.
- Purely local — no component state change, no re-render.

#### Optimistic attendance state
- New `useState(new Map())` called `optimisticAttendance` in `GroupScheduleScreen`. Keys: `setId`. Values: `'none' | 'maybe' | 'must_see'`.
- On double-tap, immediately write the next attendance state into this map.
- Card rendering checks `optimisticAttendance` first; if present, uses it instead of `setItem.attendees` to determine the user's current state (both for the cycle logic and for mint highlighting).
- On API success: delete the entry from the map (parent state now reflects truth; next render clears it cleanly).
- On API failure: revert the entry to the previous value (silent rollback — the grid shows the server's actual state with no error message).

**Result:** The card background changes to mint, the bubble appears/disappears, and the animation fires — all within a single frame of the double-tap, not after the network round-trip.

---

### 2. Per-User Card Mint Highlighting

#### New theme tokens (added to `lightColors` in `src/theme/index.js`)
```js
myAttendanceMaybeBg: '#e0f7ef',      // very light mint
myAttendanceMaybeBorder: '#7dd4b0',  // subtle mint border
myAttendanceDefBg: '#b8eedb',        // medium mint
myAttendanceDefBorder: '#3db88a',    // richer mint border
```

#### Card style override
After applying the `tierStyle()` to a card, check whether `myMemberId` appears in the optimistic map or `setItem.attendees`:
- **Maybe** (`preference !== 'must_see'` or optimistic value `'maybe'`): override background + border with `myAttendanceMaybe*` tokens.
- **Definitely** (`preference === 'must_see'` or optimistic value `'must_see'`): override with `myAttendanceDef*` tokens.
- **Not attending**: no override; tier color is used as normal.

The tier border is replaced when the user is attending (acceptable trade-off — attendance status is more actionable info than popularity tier for the user's own sets).

#### Visual progression
- Not attending → double-tap → **mint background instantly** (optimistic) + haptic + pulse
- Maybe → double-tap → **deeper mint + bubble appears** (optimistic) + haptic + pulse
- Definitely → double-tap → **back to tier color, bubble gone** (optimistic) + haptic + pulse

---

### 3. No Backend Changes

All changes are frontend-only. The server API, data models, and response shapes are unchanged.

---

### 4. Testing

**New Jest tests in `GroupScheduleScreen.test.js`:**
- Card applies mint `myAttendanceMaybeBg` background when `myMemberId` is a maybe attendee
- Card applies deeper `myAttendanceDefBg` background when `myMemberId` is a definitely attendee
- Card uses tier color (no mint) when `myMemberId` is not attending
- Existing regression test for preference-update isolation remains in place

No new backend tests required.
