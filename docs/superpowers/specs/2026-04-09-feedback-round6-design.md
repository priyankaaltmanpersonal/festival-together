# Feedback Round 6: Mint Tuning, My Sets Toggle, Modal Cleanup, Onboarding, Bubble Contrast

**Date:** 2026-04-09
**Scope:** Frontend only — `GroupScheduleScreen.js`, `theme/index.js`, `SetupScreen.js`. No backend changes.

---

## 1. Muted Mint Colors

Replace the 4 existing attendance card tokens in `apps/mobile/src/theme/index.js`. Same mint family, ~40% less chroma so the cards are noticeable but not loud:

| Token | Old | New |
|---|---|---|
| `myAttendanceMaybeBg` | `#e0f7ef` | `#edf5f2` |
| `myAttendanceMaybeBorder` | `#7dd4b0` | `#b5cfc8` |
| `myAttendanceDefBg` | `#b8eedb` | `#d6ede6` |
| `myAttendanceDefBorder` | `#3db88a` | `#8ab8ad` |

---

## 2. "My Sets" Toggle

A new `myOnly` boolean state in `GroupScheduleScreen`. A "My Sets" pill toggles it on/off. The two toggles ("Group Only" and "My Sets") are **mutually exclusive** — selecting one deactivates the other. The "My Sets" toggle is only rendered when `myMemberId` is set.

**Filter logic:** When `myOnly` is true, filter `filteredSets` to sets where `myMemberId` appears in `effectiveAttendees` (respects optimistic state). Apply this filter before the existing `hideUnattended` filter is considered (both can't be active simultaneously since they're mutually exclusive, but the pipeline is: day filter → myOnly OR groupOnly filter → visible sets).

**Empty state:** When `myOnly` is active and no sets match on the selected day, render a centered message inside the grid area:
> "You haven't added any sets for this day yet. Double-tap a card to add one."

**Toggle pill styling:** Same style as the existing "Group Only" pill (`togglePill` / `togglePillActive`). Positioned in the same `toggleRow` as "Group Only". Since they're mutually exclusive, only one can show as active at a time.

---

## 3. Modal Cleanup

**Remove `AddToScheduleFooter`** component entirely.

**Footer behavior by attendance state** (when both `myMemberId` and `onNavigateToEditSet` are present):

- **If attending:** Keep the existing `modalStatusPill` block unchanged — shows "✓ On your schedule — Must See / Maybe" with the "Edit in your schedule →" link inside it.
- **If not attending:** Replace the `AddToScheduleFooter` with a single plain link: `"Add in your schedule →"` using the existing `modalEditLink` style. Tapping it: close modal → navigate to `EditMyScheduleScreen` pre-scrolled to the set's `day_index`.

The `onAddToMySchedule` prop is no longer used in the modal. It remains on the component signature (double-tap still uses it) but the modal footer no longer references it.

---

## 4. Onboarding Text Update (upload_all_days)

In `SetupScreen.js`, inside the `upload_all_days` step, when `hasOfficialLineup` is true: reorder the elements and add a contextual info message.

**New order (hasOfficialLineup = true):**

1. Info text (new): *"The full lineup is already imported! You can add artists directly from the group grid, or upload a screenshot of your personal schedule to mark your picks."*
2. **"Browse Full Lineup →"** button (moved up — was at bottom)
3. `— or —` divider
4. **"Choose Screenshot"** button
5. **"Skip for Now"** button (renamed from "Skip This Day")

When `hasOfficialLineup` is false, the step is unchanged from current behavior.

---

## 5. Attendee Bubble Contrast Fix

Add `borderWidth: 1` and `borderColor: 'rgba(255,255,255,0.75)'` to the `attendeeBubble` style in `GroupScheduleScreen.js`. This white ring separates every bubble from any card background (mint or otherwise), fixing contrast for chip colors like `#06A77D` (mint) and `#F0C040` (gold) that could otherwise blend into the card.

---

## Testing

**New Jest tests:**
- "My Sets" toggle shows only sets where `myMemberId` is an attendee
- "My Sets" toggle shows empty state message when no attended sets on selected day
- Selecting "My Sets" deactivates "Group Only" and vice versa
- Modal shows "Add in your schedule →" link when user is not attending
- Modal shows "Edit in your schedule →" link when user is attending
- Modal does not show an "Add to My Schedule" button (regression: AddToScheduleFooter removed)

No backend tests needed (no API changes).
