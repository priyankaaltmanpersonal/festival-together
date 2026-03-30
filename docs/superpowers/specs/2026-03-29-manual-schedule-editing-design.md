# Manual Schedule Editing + Invite Code UX

**Date:** 2026-03-29
**Status:** Approved

## Problem

After uploading a schedule screenshot, users have no way to fix parser errors. If an artist name is wrong, a time is off, an artist is missing, or a phantom set was added, they are stuck. For a 3-day festival with 12 users this is a real problem. Additionally, the group invite code is only visible to the founder as tiny gray text — members have no way to invite additional friends.

## Scope

Two features in one implementation:

1. **Manual schedule editing** — every member (including founder) can delete, edit, and add artists on their schedule
2. **Invite code UX** — invite code visible and tap-to-copy for all members in two places

---

## Feature 1: Manual Schedule Editing

### Rules

| Operation | Scope | Notes |
|---|---|---|
| Delete | Personal only | Removes caller's `member_set_preferences` row. Canonical set stays; other members unaffected. |
| Add | Match-or-create | Same dedup logic as upload: match on `artist_name + stage_name + start_time_pt + day_index` (case-insensitive). Links to existing canonical set if found; creates new one if not. |
| Edit (name/stage/time) | Shared (group-wide) | Updates the `canonical_sets` row directly. Affects everyone who has that artist. Requires inline warning before save. |

### Where it appears

Both surfaces get identical card behavior — same UI pattern, same callbacks:

1. **`SetupScreen` — `upload_day` step:** The parsed list shown right after each day's upload already displays artist cards. Add ✕ and Edit buttons to those cards, plus an "+ Add Artist" button below the list.
2. **`EditMyScheduleScreen` — post-setup:** The "Your Parsed Sets" list. Same ✕ / Edit buttons per card, same "+ Add Artist" button.

### UI — Inline expand (Option A)

Each artist card has two new controls:

- **✕ button** (top-right of card, red) — one tap to delete. Optimistic: card disappears immediately, restores on API failure.
- **Edit ✏ button** (pill, right-aligned in the preference row) — tapping expands the card in-place to show the edit form.

**Expanded edit form fields:**
- Artist name (text input, pre-filled)
- Stage (text input, pre-filled)
- Start time (text input, `HH:MM` 24h format internally, pre-filled)
- End time (text input, `HH:MM` 24h format internally, pre-filled)
- **Save** button (primary) + **Cancel** button (secondary)
- Inline warning below fields: *"⚠ Edits to name, stage, or time affect everyone in your group who has this artist."*

Only one card can be in edit mode at a time. Opening a second card's edit form collapses the first.

**"+ Add Artist" button** appears at the bottom of the set list. Tapping it appends a new blank expanded card to the bottom of the list. Same form as edit but with empty fields and no warning (adds are personal — the canonical set creation is an implementation detail the user doesn't need to know about).

### Backend — 3 new endpoints

#### `DELETE /members/me/sets/{canonical_set_id}`
- Auth: any authenticated member
- Deletes the `member_set_preferences` row for `(member_id, canonical_set_id)`
- Returns `{"ok": true}`
- 404 if preference not found

#### `POST /members/me/sets`
Request body:
```json
{
  "artist_name": "string",
  "stage_name": "string",
  "start_time_pt": "HH:MM",
  "end_time_pt": "HH:MM",
  "day_index": 1
}
```
- Match-or-create: case-insensitive lookup on `artist_name + stage_name + start_time_pt + day_index` within the group
- If canonical set found: insert `member_set_preferences` row (preference=`flexible`, attendance=`going`)
- If not found: insert `canonical_sets` row first (status=`resolved`, source_confidence=`1.0`), then preference row
- 409 if preference already exists for this member + canonical set (mobile shows "You already have this artist on your schedule" inline below the add form)
- Returns `{"ok": true, "canonical_set_id": "..."}`

#### `PATCH /canonical-sets/{id}`
Request body (all fields optional):
```json
{
  "artist_name": "string",
  "stage_name": "string",
  "start_time_pt": "HH:MM",
  "end_time_pt": "HH:MM"
}
```
- Auth: any authenticated member whose group owns that canonical set
- Updates only the provided fields
- Returns `{"ok": true}`
- 403 if caller's group doesn't own the set
- 404 if set not found
- 400 if no fields provided

### Error handling

| Operation | Strategy |
|---|---|
| Delete | Optimistic — remove card immediately, restore on failure with error toast |
| Add | Non-optimistic — spinner on Add button, insert card on success |
| Edit | Non-optimistic — spinner on Save button, update card on success |

---

## Feature 2: Invite Code UX

The invite code is already stored in App state for all members (set on join and on group creation). It just needs to be displayed.

### In the navigation menu

A small card at the top of the menu overlay (above the nav items) shows:
- Label: "Invite friends"
- The invite code in large, bold, monospace style
- A copy icon (📋) to the right
- Tapping the copy icon calls `Clipboard.setStringAsync(inviteCode)` and briefly shows "Copied!" in place of the icon (reset after 2 seconds)

Visible to all members (founder and non-founder).

### In the group schedule screen

A one-line invite row inside the existing `topRow` of the filter section:
- Text: `Invite: XXXX` with a small copy icon
- Same tap-to-copy behavior
- Always visible, small, does not compete with the filter chips

---

## What is NOT changing

- The `canonical_sets` table schema — no migrations needed
- The `member_set_preferences` table schema — no migrations needed
- The upload flow itself — parsing and union-upsert logic unchanged
- The `FounderToolsScreen` invite code display — can be cleaned up separately or left as-is

---

## Out of scope

- Approval workflow for shared edits (not needed for 12 trusted users)
- Day picker on the Add form (day_index is pre-set to the current upload day context, or defaults to day 1 in EditMyScheduleScreen — can revisit)
- Fuzzy matching on manual adds (exact match is sufficient; users can see the list before adding)
