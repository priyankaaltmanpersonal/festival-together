# Bottom Navigation + More Sheet
**Date:** 2026-04-05
**Status:** Approved

## Goal

Replace the hamburger menu in the header with a persistent 3-tab bottom navigation bar. The right tab opens a "More" bottom sheet with profile editing, invite code, and secondary actions.

## Tab Bar

### Structure
Three tabs, always visible at the bottom of the screen (below all screen content, above the safe area).

| Tab | Icon | Label |
|-----|------|-------|
| Left | Grid/table (4-square) | "Group" |
| Middle | Person/user silhouette | "My Schedule" |
| Right | Hamburger (3 lines) | "More" |

### Active State
- Active tab: orange top-border (2.5px, `C.primary`) + icon in orange + label shown
- Inactive tabs: icon only in muted grey (`C.textMuted`), no label
- Label-only-on-active prevents wrapping ("My Schedule" is too wide to show always)

### Tab Bar Styling
- Background: `C.tabBg` (warm off-white, matches existing tab components)
- Top border: 1px `C.tabBorder`
- Bottom padding: accounts for safe area (use `useSafeAreaInsets`)
- Tab height: ~50px visible + safe area inset

### Icon Library
Use `@expo/vector-icons` (Feather or Ionicons, already available in Expo). Suggested icons:
- Group: `Feather "grid"` 
- My Schedule: `Feather "user"`
- More: `Feather "menu"`

### Navigation Behavior
- Tapping Group → sets `activeView = 'group'`
- Tapping My Schedule → sets `activeView = 'edit'`
- Tapping More → opens More sheet (does NOT change `activeView`)
- Header hamburger button removed entirely
- Header title stays (still shows screen name)

## More Sheet

### Trigger
Tapping the More tab opens a modal bottom sheet that slides up over the current screen. The current screen (Group or My Schedule) remains visible and dimmed behind a semi-transparent overlay. Tapping the overlay closes the sheet.

### Sheet Layout (top to bottom)

**1. Drag handle** — centered 36px wide pill, decorative

**2. Invite Code Card**
- Warm gradient card (`C.primaryBg` / orange tint)
- Label: "Invite friends" (small caps)
- Invite code in large bold monospace
- Tap anywhere on card to copy; show "Copied!" confirmation for 2s

**3. Profile Section**
- Tappable row: "Edit Profile" → expands inline (or opens sub-sheet) with:
  - Display name text input (pre-filled with current name), save on blur or explicit Save button
  - `ColorPicker` component (reuse existing) showing current color selected; available colors = all colors not taken by other members
  - Save calls existing `PUT /v1/members/me` endpoint (or equivalent) to update name + color
- On save: close the input area, update local state

**4. Navigation Row**
- "Individual Schedules" → closes sheet, sets `activeView = 'individual'`

**5. Reset App** (visually de-emphasized)
- Smaller font, muted grey color, no card/border background
- Tapping shows `Alert.alert` confirmation:
  - Title: "Reset App?"
  - Message: "This will clear your session and return to the welcome screen. Your group and schedule data will remain on the server."
  - Buttons: "Cancel" (default) + "Reset" (destructive)
  - On confirm: calls existing `resetFlow()`

### Sheet Sizing
Sheet height is content-driven (not fixed). Should not exceed 75% of screen height. If content is taller, the sheet scrolls internally.

## What Does NOT Change

- The gradient header (title still shown)
- All existing screen content and logic
- `activeView` state machine — just adding a new way to drive it
- Backend — no new endpoints (profile update uses existing member update API)
- The `SetupScreen` / onboarding flow (tab bar only shown post-onboarding, i.e. `onboardingStep === 'complete'`)

## Architecture

### Files to modify
- `apps/mobile/App.js` — replace hamburger + menu overlay with `BottomTabBar` component + `MoreSheet` component; add profile edit state + save handler
- `apps/mobile/src/components/BottomTabBar.js` — new component
- `apps/mobile/src/components/MoreSheet.js` — new component

### State
- `moreSheetOpen: boolean` — replaces `menuOpen`
- `editingProfile: boolean` — whether the profile edit section is expanded in the sheet
- Display name and chip color editing uses existing `displayName` / `selectedChipColor` state, with a local draft copy in the sheet that only commits on save

### Profile Save API
**No update endpoint exists yet.** Backend needs a new `PATCH /v1/members/me` route accepting `{ display_name?, chip_color? }`. It should validate chip_color isn't already taken by another active member in the group (same logic as join). This is a backend addition required before profile editing can ship.
