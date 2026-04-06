# Bottom Navigation + More Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-right hamburger menu with a persistent 3-tab bottom navigation bar (Group, My Schedule, More) and a More bottom sheet with invite code, profile editing, and secondary actions.

**Architecture:** Two new components (`BottomTabBar`, `MoreSheet`) extracted from App.js logic. A new backend `PATCH /v1/members/me` endpoint handles display name + chip color updates. App.js wires everything together and removes the old menu overlay.

**Tech Stack:** React Native, expo-linear-gradient, @expo/vector-icons (Feather), react-native-safe-area-context, FastAPI/SQLite backend.

---

## Files

- Create: `apps/mobile/src/components/BottomTabBar.js`
- Create: `apps/mobile/src/components/MoreSheet.js`
- Modify: `apps/mobile/App.js`
- Modify: `services/api/app/api/groups.py`
- Modify: `services/api/app/schemas/groups.py`

---

### Task 1: Backend — PATCH /v1/members/me

**Files:**
- Modify: `services/api/app/schemas/groups.py`
- Modify: `services/api/app/api/groups.py`

- [ ] **Step 1: Add `MemberUpdateRequest` schema to `services/api/app/schemas/groups.py`**

Add after the existing `LeaveGroupRequest` class:

```python
class MemberUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    chip_color: str | None = None
```

Also add `MemberUpdateRequest` to the import list at the top of `groups.py` API file (next step).

- [ ] **Step 2: Add the route to `services/api/app/api/groups.py`**

Add this import to the existing import from schemas:
```python
from app.schemas.groups import (
    DeleteMemberRequest,
    FestivalDay,
    GroupCreateRequest,
    GroupCreateResponse,
    GroupSummary,
    GroupUpdateRequest,
    JoinInviteRequest,
    InvitePreviewResponse,
    LeaveGroupRequest,
    MemberSummary,
    MemberUpdateRequest,
    SessionSummary,
    _DEFAULT_FESTIVAL_DAYS,
)
```

Then add this route just before the `@router.post("/members/me/leave")` route (around line 331):

```python
@router.patch("/members/me")
def update_member(payload: MemberUpdateRequest, session=Depends(require_session)) -> dict:
    with get_conn() as conn:
        if payload.chip_color is not None:
            normalized = normalize_chip_color(payload.chip_color)
            if not validate_chip_color(normalized):
                raise HTTPException(status_code=400, detail="invalid_chip_color")
            # Check it's not taken by another active member in this group
            used_rows = conn.execute(
                "SELECT chip_color FROM members WHERE group_id = ? AND active = 1 AND id != ? AND chip_color IS NOT NULL",
                (session["group_id"], session["member_id"]),
            ).fetchall()
            used = {row["chip_color"] for row in used_rows}
            if normalized in used:
                raise HTTPException(status_code=409, detail="chip_color_unavailable")

        fields = []
        values = []
        if payload.display_name is not None:
            fields.append("display_name = ?")
            values.append(payload.display_name.strip())
        if payload.chip_color is not None:
            fields.append("chip_color = ?")
            values.append(normalize_chip_color(payload.chip_color))

        if not fields:
            return {"ok": True}

        values.append(session["member_id"])
        conn.execute(
            f"UPDATE members SET {', '.join(fields)} WHERE id = ?",
            values,
        )
    return {"ok": True}
```

- [ ] **Step 3: Verify the backend starts without errors**

```bash
cd services/api
uvicorn app.main:app --reload 2>&1 | head -20
```

Expected: server starts, no import errors.

- [ ] **Step 4: Commit**

```bash
git add services/api/app/schemas/groups.py services/api/app/api/groups.py
git commit -m "feat: add PATCH /v1/members/me for display name and chip color update"
```

---

### Task 2: BottomTabBar component

**Files:**
- Create: `apps/mobile/src/components/BottomTabBar.js`

- [ ] **Step 1: Create `apps/mobile/src/components/BottomTabBar.js`**

```js
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export function BottomTabBar({ activeView, onNavigate, onOpenMore }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, insets.bottom), [C, insets.bottom]);

  const tabs = [
    { key: 'group', icon: 'grid', label: 'Group' },
    { key: 'edit', icon: 'user', label: 'My Schedule' },
    { key: 'more', icon: 'menu', label: 'More' },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = tab.key === 'more'
          ? activeView === 'more'
          : activeView === tab.key;
        const color = isActive ? C.primary : C.textMuted;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => tab.key === 'more' ? onOpenMore() : onNavigate(tab.key)}
          >
            <Feather name={tab.icon} size={22} color={color} />
            {isActive ? <Text style={styles.label}>{tab.label}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (C, bottomInset) => StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.tabBorder,
    backgroundColor: C.tabBg,
    paddingBottom: bottomInset || 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    gap: 2,
    borderTopWidth: 2.5,
    borderTopColor: 'transparent',
  },
  tabActive: {
    borderTopColor: C.primary,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: C.primary,
    lineHeight: 12,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/BottomTabBar.js
git commit -m "feat: add BottomTabBar component with active top-border style"
```

---

### Task 3: MoreSheet component

**Files:**
- Create: `apps/mobile/src/components/MoreSheet.js`

- [ ] **Step 1: Create `apps/mobile/src/components/MoreSheet.js`**

```js
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme';

export function MoreSheet({
  visible,
  onClose,
  inviteCode,
  inviteCopied,
  onCopyInvite,
  onIndividualSchedules,
  onResetApp,
  // profile
  currentDisplayName,
  currentChipColor,
  chipColorOptions,
  takenColors,     // chip_colors of OTHER members in the group
  onSaveProfile,   // async (displayName, chipColor) => void
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const openProfile = () => {
    setDraftName(currentDisplayName || '');
    setDraftColor(currentChipColor || '');
    setSaveError('');
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!draftName.trim()) {
      setSaveError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await onSaveProfile(draftName.trim(), draftColor);
      setProfileOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset App?',
      'This will clear your session and return to the welcome screen. Your group and schedule data will remain on the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: onResetApp },
      ]
    );
  };

  const availableColors = (chipColorOptions || []).filter(
    (c) => !(takenColors || []).includes(c) || c === currentChipColor
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Invite code */}
            {inviteCode ? (
              <Pressable onPress={onCopyInvite} style={styles.inviteCard}>
                <Text style={styles.inviteLabel}>Invite friends</Text>
                <View style={styles.inviteRow}>
                  <Text style={styles.inviteCode}>{inviteCode}</Text>
                  <Text style={styles.inviteCopy}>{inviteCopied ? '✓ Copied!' : '📋 Copy'}</Text>
                </View>
              </Pressable>
            ) : null}

            {/* Profile */}
            <Pressable onPress={profileOpen ? null : openProfile} style={styles.row}>
              <Text style={styles.rowLabel}>Edit Profile</Text>
              {!profileOpen ? <Text style={styles.rowChevron}>›</Text> : null}
            </Pressable>
            {profileOpen ? (
              <View style={styles.profileForm}>
                <Text style={styles.fieldLabel}>Display name</Text>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  style={styles.input}
                  maxLength={60}
                  placeholder="Your name"
                />
                <Text style={styles.fieldLabel}>Chip color</Text>
                <View style={styles.colorGrid}>
                  {(chipColorOptions || []).map((color) => {
                    const taken = (takenColors || []).includes(color) && color !== currentChipColor;
                    return (
                      <Pressable
                        key={color}
                        disabled={taken}
                        onPress={() => setDraftColor(color)}
                        style={[
                          styles.swatch,
                          { backgroundColor: color },
                          draftColor === color && styles.swatchSelected,
                          taken && styles.swatchTaken,
                        ]}
                      />
                    );
                  })}
                </View>
                {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
                <View style={styles.profileBtns}>
                  {saving ? (
                    <ActivityIndicator color={C.primary} />
                  ) : (
                    <Pressable onPress={handleSaveProfile} style={styles.saveBtn}>
                      <Text style={styles.saveBtnText}>Save</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setProfileOpen(false)} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Individual schedules */}
            <Pressable onPress={() => { onClose(); onIndividualSchedules(); }} style={styles.row}>
              <Text style={styles.rowLabel}>Individual Schedules</Text>
              <Text style={styles.rowChevron}>›</Text>
            </Pressable>

            {/* Reset App — de-emphasized */}
            <Pressable onPress={handleResetApp} style={styles.resetRow}>
              <Text style={styles.resetLabel}>Reset App</Text>
            </Pressable>

          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.modalOverlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.cardBg,
    borderRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.tabBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  inviteCard: {
    backgroundColor: C.primaryBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.inputBorder,
    padding: 12,
    marginBottom: 8,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCode: { fontSize: 16, fontWeight: '800', color: C.kickerText, letterSpacing: 1 },
  inviteCopy: { fontSize: 12, fontWeight: '700', color: C.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  rowLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  rowChevron: { fontSize: 18, color: C.textMuted },
  profileForm: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    marginBottom: 2,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.fieldLabelText },
  input: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: C.inputBg,
    color: C.text,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: C.text,
    transform: [{ scale: 1.15 }],
  },
  swatchTaken: { opacity: 0.2 },
  saveError: { fontSize: 11, color: C.error, fontWeight: '600' },
  profileBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  resetRow: {
    paddingVertical: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  resetLabel: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/MoreSheet.js
git commit -m "feat: add MoreSheet component with invite, profile edit, individual schedules, reset app"
```

---

### Task 4: Wire App.js — remove old menu, add tab bar + more sheet

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Add imports at the top of App.js**

Add these two lines to the existing import block:

```js
import { BottomTabBar } from './src/components/BottomTabBar';
import { MoreSheet } from './src/components/MoreSheet';
```

- [ ] **Step 2: Replace `menuOpen` state with `moreSheetOpen`**

Find:
```js
const [menuOpen, setMenuOpen] = useState(false);
```
Replace with:
```js
const [moreSheetOpen, setMoreSheetOpen] = useState(false);
```

- [ ] **Step 3: Add `updateProfile` function**

Add this function just after the `copyInviteCode` function (around line 1124):

```js
const updateProfile = async (newDisplayName, newChipColor) => {
  await apiRequest({
    baseUrl: apiUrl,
    path: '/v1/members/me',
    method: 'PATCH',
    sessionToken: memberSession,
    body: {
      display_name: newDisplayName,
      chip_color: newChipColor,
    },
  });
  // Re-fetch home to update homeSnapshot with new name/color
  const homePayload = await apiRequest({
    baseUrl: apiUrl,
    path: '/v1/members/me/home',
    method: 'GET',
    sessionToken: memberSession,
  });
  setHomeSnapshot(homePayload);
};
```

- [ ] **Step 4: Update `resetFlow` to close the more sheet**

Find the line inside `resetFlow` that does `setMenuOpen(false)`:
```js
setMenuOpen(false);
```
Replace with:
```js
setMoreSheetOpen(false);
```

- [ ] **Step 5: Update `openEditSchedule` to close the more sheet**

Find inside `openEditSchedule`:
```js
setMenuOpen(false);
```
Replace with:
```js
setMoreSheetOpen(false);
```

- [ ] **Step 6: Update `loadIndividual` — add close sheet**

Find the `loadIndividual` function and change `setMenuOpen(false)` to `setMoreSheetOpen(false)`. If `loadIndividual` doesn't call `setMenuOpen`, find where Individual Schedules navigation happens and ensure `setMoreSheetOpen(false)` is called.

Actually, in `MoreSheet`, the Individual Schedules row calls `onClose()` then `onIndividualSchedules()`. `onIndividualSchedules` in App.js will be `loadIndividual`. No change needed to `loadIndividual` itself.

- [ ] **Step 7: Replace hamburger button in the header**

Find:
```jsx
{canOpenMenu ? (
  <Pressable onPress={() => setMenuOpen((prev) => !prev)} style={styles.menuButton}>
    <Text style={styles.menuButtonText}>☰</Text>
  </Pressable>
) : null}
```
Delete it entirely (the header should have no button now).

- [ ] **Step 8: Replace the menu overlay block with BottomTabBar + MoreSheet**

Find and delete the entire `{menuOpen ? ( ... ) : null}` block (lines ~1241–1270).

Also find and delete the `MenuItem` component function (~lines 1276–1283).

Then, just before `</SafeAreaView>` (and after all screen content), add:

```jsx
{canOpenMenu ? (
  <BottomTabBar
    activeView={activeView}
    onNavigate={(view) => {
      if (view === 'edit') {
        openEditSchedule();
      } else {
        setActiveView(view);
      }
    }}
    onOpenMore={() => setMoreSheetOpen(true)}
  />
) : null}

<MoreSheet
  visible={moreSheetOpen}
  onClose={() => setMoreSheetOpen(false)}
  inviteCode={inviteCode}
  inviteCopied={inviteCopied}
  onCopyInvite={copyInviteCode}
  onIndividualSchedules={loadIndividual}
  onResetApp={resetFlow}
  currentDisplayName={homeSnapshot?.me?.display_name || ''}
  currentChipColor={homeSnapshot?.me?.chip_color || ''}
  chipColorOptions={CHIP_COLOR_OPTIONS}
  takenColors={(homeSnapshot?.members || [])
    .filter((m) => m.id !== homeSnapshot?.me?.id)
    .map((m) => m.chip_color)
    .filter(Boolean)}
  onSaveProfile={updateProfile}
/>
```

- [ ] **Step 9: Remove unused menu styles from `makeStyles`**

Delete these style entries from `makeStyles` in App.js:
- `menuButton`
- `menuButtonText`
- `menuOverlay`
- `menuCard`
- `menuLabel`
- `menuInviteCard`
- `menuInviteLabel`
- `menuInviteRow`
- `menuInviteCode`
- `menuCopyBtn`
- `menuCopyBtnText`
- `menuCopiedState`
- `menuCopiedText`

- [ ] **Step 10: Verify the app renders without errors**

```bash
cd apps/mobile && npx expo export --platform ios 2>&1 | head -30
```

Expected: export completes with no JS parse errors.

- [ ] **Step 11: Commit and push**

```bash
git add apps/mobile/App.js
git commit -m "feat: replace hamburger menu with bottom tab bar and More sheet

- BottomTabBar: Group / My Schedule / More tabs with top-border active state
- MoreSheet: invite code card, profile editing (name + chip color), Individual
  Schedules navigation, Reset App with confirmation dialog
- Removes old hamburger button, menuOpen state, MenuItem component, menu styles

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```
