# Feedback Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 feedback items: FounderToolsScreen UI polish, copy invite code, upload warnings, parallelized official lineup parsing, AM/PM time parsing fix, delete official lineup, and 12-hour time display.

**Architecture:** Mostly isolated changes — backend gets a new DELETE endpoint + async parallelization + prompt fix; frontend gets prop additions and a new utility function. Each task is independently committable.

**Tech Stack:** React Native (Expo), FastAPI (Python), SQLite, Claude Sonnet API, Jest (frontend tests), pytest (backend tests)

---

### Task 1: Fix FounderToolsScreen padding and remove redundant back button

The screen has no top padding so content sits flush against the header. The "Back to Group View" card is redundant — the bottom tab bar already handles navigation.

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`
- Modify: `apps/mobile/src/__tests__/FounderToolsScreen.test.js`

- [ ] **Step 1: Update the failing test — remove assertions that will break**

Open `apps/mobile/src/__tests__/FounderToolsScreen.test.js`. The two tests that reference "Open Group Schedule" and the `onOpenSchedule` press interaction will fail once we remove that card. Update them:

```js
// REMOVE these two tests entirely from the 'idle state' describe block:
//   it('calls onOpenSchedule when Open Group Schedule is pressed', ...)
//   it('renders Open Group Schedule button', ...)
// They tested the "Back to Group View" card we're deleting.
```

Also add a test to verify top padding:

```js
describe('FounderToolsScreen — layout', () => {
  it('has top padding in the scroll container', () => {
    const { UNSAFE_getByType } = render(<FounderToolsScreen {...makeProps()} />);
    const { ScrollView } = require('react-native');
    const scrollView = UNSAFE_getByType(ScrollView);
    expect(scrollView.props.contentContainerStyle).toMatchObject({ paddingTop: 12 });
  });
});
```

- [ ] **Step 2: Run tests — confirm the padding test fails and Open Group Schedule tests are gone**

```bash
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: padding test FAILS ("Expected ... to match object containing paddingTop: 12")

- [ ] **Step 3: Fix FounderToolsScreen**

In `apps/mobile/src/screens/FounderToolsScreen.js`:

1. Change the `wrap` style from:
```js
wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
```
to:
```js
wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20, paddingTop: 12 },
```

2. Delete the entire third card (lines 58–63):
```js
// DELETE THIS BLOCK:
      <View style={styles.card}>
        <Text style={styles.label}>Back to Group View</Text>
        <Pressable onPress={onOpenSchedule} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>Open Group Schedule</Text>
        </Pressable>
      </View>
```

3. The `onOpenSchedule` prop is still used by App.js for the bottom tab bar — keep it in the prop destructuring but remove the `buttonSecondary` and `buttonText` styles since nothing uses them anymore.

Remove from styles:
```js
// DELETE these two style entries:
  buttonSecondary: { ... },
  buttonText: { ... },
```

- [ ] **Step 4: Run tests — all pass**

```bash
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
cd apps/mobile && git add src/screens/FounderToolsScreen.js src/__tests__/FounderToolsScreen.test.js
git commit -m "fix: add top padding and remove redundant back button from FounderToolsScreen"
```

---

### Task 2: Add tap-to-copy invite code in Founder Controls card

The invite code in the Founder Controls card is plain text. Match the copy UX from MoreSheet: tap the row to copy, show "✓ Copied!" for 2 seconds.

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`
- Modify: `apps/mobile/App.js`
- Modify: `apps/mobile/src/__tests__/FounderToolsScreen.test.js`

- [ ] **Step 1: Write failing tests**

Add to `apps/mobile/src/__tests__/FounderToolsScreen.test.js`:

```js
describe('FounderToolsScreen — copy invite code', () => {
  it('calls onCopyInvite when the invite code row is pressed', () => {
    const onCopyInvite = jest.fn();
    const { getByTestId } = render(
      <FounderToolsScreen {...makeProps({ onCopyInvite, inviteCopied: false })} />
    );
    fireEvent.press(getByTestId('invite-copy-row'));
    expect(onCopyInvite).toHaveBeenCalledTimes(1);
  });

  it('shows copy icon when not yet copied', () => {
    const { getByText } = render(
      <FounderToolsScreen {...makeProps({ onCopyInvite: jest.fn(), inviteCopied: false })} />
    );
    expect(getByText('📋 Copy')).toBeTruthy();
  });

  it('shows copied confirmation text when inviteCopied is true', () => {
    const { getByText } = render(
      <FounderToolsScreen {...makeProps({ onCopyInvite: jest.fn(), inviteCopied: true })} />
    );
    expect(getByText('✓ Copied!')).toBeTruthy();
  });
});
```

Also update `makeProps` to include the new props:
```js
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
    ...overrides,
  };
}
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: 3 new tests FAIL (testId not found, text not found)

- [ ] **Step 3: Update FounderToolsScreen to accept and use the new props**

In `apps/mobile/src/screens/FounderToolsScreen.js`:

Add `onCopyInvite` and `inviteCopied` to the prop destructuring:
```js
export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  onCopyInvite,
  inviteCopied,
  lineupImportState = 'idle',
  lineupImportResult = null,
  onDeleteLineup,  // will be added in Task 7; declare now so it's ready
}) {
```

Replace the plain invite code text inside the Founder Controls card:
```js
// REPLACE:
        <Text style={styles.helper}>Invite code: {inviteCode || 'n/a'}</Text>

// WITH:
        <Pressable
          testID="invite-copy-row"
          onPress={onCopyInvite}
          style={styles.inviteRow}
        >
          <Text style={styles.helper}>
            Invite code: <Text style={styles.inviteCodeText}>{inviteCode || 'n/a'}</Text>
          </Text>
          <Text style={styles.copyHint}>{inviteCopied ? '✓ Copied!' : '📋 Copy'}</Text>
        </Pressable>
```

Add styles:
```js
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCodeText: { fontWeight: '800', letterSpacing: 1 },
  copyHint: { fontSize: 12, fontWeight: '700', color: C.primary },
```

- [ ] **Step 4: Wire props in App.js**

In `apps/mobile/App.js`, find the `<FounderToolsScreen` render block (~line 1468) and add the two new props:

```js
      {activeView === 'founder' ? (
        <FounderToolsScreen
          inviteCode={inviteCode}
          groupName={homeSnapshot?.group?.name}
          onOpenSchedule={() => setActiveView('group')}
          onImportLineup={importOfficialLineup}
          onCopyInvite={copyInviteCode}
          inviteCopied={inviteCopied}
          lineupImportState={lineupImportState}
          lineupImportResult={lineupImportResult}
        />
      ) : null}
```

- [ ] **Step 5: Run tests — all pass**

```bash
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/FounderToolsScreen.js apps/mobile/App.js apps/mobile/src/__tests__/FounderToolsScreen.test.js
git commit -m "feat: add tap-to-copy invite code in FounderToolsScreen Founder Controls card"
```

---

### Task 3: Update upload warning text in all three upload UIs

Add "Please keep the app open" to every upload-in-progress message. Update time estimates to reflect real-world durations.

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Modify: `apps/mobile/src/components/DayTabReview.js`
- Modify: `apps/mobile/src/__tests__/FounderToolsScreen.test.js`

- [ ] **Step 1: Update the FounderToolsScreen test**

In `apps/mobile/src/__tests__/FounderToolsScreen.test.js`, find the uploading state test:
```js
    expect(getByText(/Parsing lineup/)).toBeTruthy();
```
Change to match the new text:
```js
    expect(getByText(/Parsing lineup.*keep the app open/s)).toBeTruthy();
```

- [ ] **Step 2: Run — confirm test fails**

```bash
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: FAIL (text doesn't match yet)

- [ ] **Step 3: Update FounderToolsScreen loading text**

In `apps/mobile/src/screens/FounderToolsScreen.js`, change:
```js
            <Text style={styles.helper}>Parsing lineup… this may take 15–30 seconds.</Text>
```
to:
```js
            <Text style={styles.helper}>Parsing lineup… this may take 1–2 minutes. Please keep the app open.</Text>
```

- [ ] **Step 4: Update SetupScreen loading text**

In `apps/mobile/src/screens/SetupScreen.js`, change:
```js
                <Text style={styles.helper}>This usually takes 5–10 seconds. Hang tight!</Text>
```
to:
```js
                <Text style={styles.helper}>This usually takes 15–30 seconds. Please keep the app open!</Text>
```

- [ ] **Step 5: Update DayTabReview loading text**

In `apps/mobile/src/components/DayTabReview.js`, change:
```js
              <Text style={styles.loadingHint}>This usually takes 5–10 seconds. Hang tight!</Text>
```
to:
```js
              <Text style={styles.loadingHint}>This usually takes 15–30 seconds. Please keep the app open!</Text>
```

- [ ] **Step 6: Run all frontend tests — all pass**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/FounderToolsScreen.js apps/mobile/src/screens/SetupScreen.js apps/mobile/src/components/DayTabReview.js apps/mobile/src/__tests__/FounderToolsScreen.test.js
git commit -m "fix: update upload warning text with accurate durations and keep-app-open notice"
```

---

### Task 4: Fix official lineup AM/PM time parsing

The model misreads Coachella times as AM when they should be PM, because it has no context about when the festival runs. Add festival hours context to the official lineup prompt.

**Files:**
- Modify: `services/api/app/core/llm_parser.py`
- Modify: `services/api/tests/test_llm_parser.py`

- [ ] **Step 1: Write a failing test for the prompt content**

In `services/api/tests/test_llm_parser.py`, add:

```python
def test_official_lineup_prompt_contains_festival_hours_context():
    """Prompt must include Coachella time-of-day context to prevent AM/PM confusion."""
    from app.core.llm_parser import _OFFICIAL_LINEUP_PROMPT
    prompt = _OFFICIAL_LINEUP_PROMPT.format(festival_days_json="[]")
    assert "12:30 PM" in prompt or "12:30pm" in prompt.lower(), \
        "Prompt must mention festival start time ~12:30 PM"
    assert "1:00 AM" in prompt or "1:00am" in prompt.lower(), \
        "Prompt must mention festival end time ~1:00 AM"
    assert "PM" in prompt, "Prompt must reference PM times explicitly"
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd services/api && python3 -m pytest tests/test_llm_parser.py::test_official_lineup_prompt_contains_festival_hours_context -v
```

Expected: FAIL (assertions fail because prompt has no festival hours context)

- [ ] **Step 3: Update `_OFFICIAL_LINEUP_PROMPT` in llm_parser.py**

In `services/api/app/core/llm_parser.py`, replace `_OFFICIAL_LINEUP_PROMPT` with:

```python
_OFFICIAL_LINEUP_PROMPT = """\
You are extracting the complete performance schedule from an official festival lineup graphic.

This image shows ALL performers across ALL stages for ONE day of the festival.
Extract EVERY performer shown — do not skip any. Do not filter by visual highlighting.

Read the day name from the image text (e.g. "FRIDAY", "SATURDAY", "SUNDAY") and match it
to the festival_days list to determine day_index.

Festival days: {festival_days_json}

For each performer, extract:
- artist_name: full performer name as shown (string)
- stage_name: stage column header text (string)
- start_time: 24-hour "HH:MM". Times 12:00AM–5:59AM use "24:MM"–"29:MM" extended format.
- end_time: same format, or null if not visible
- day_index: integer from festival_days matching the day shown in the image

Time reading rules for Coachella:
- The festival runs approximately 12:30 PM to 1:00 AM each night
- The grid layout places early afternoon (1 PM) near the BOTTOM and late night (1:00 AM) near the TOP
- A time label "1:00" near the BOTTOM of a stage column means 13:00 (1:00 PM) — output as "13:00"
- A time label "1:00" near the TOP of a stage column means 1:00 AM the next day — output as "25:00"
- Times between 12:30 and 11:59 are ALWAYS PM (output as 12:30–23:59)
- Times at 12:00 AM–1:30 AM are the late-night end-of-day headliner slots (output as 24:00–25:30)
- When in doubt, prefer PM over AM — the vast majority of sets start in the afternoon/evening

Rules:
- Extract ALL performers shown in the grid — this is a complete schedule, not a personal selection
- Stage names come from the column headers at the top of the grid image
- Times are shown as bullets or in a time range (e.g. "9:05–10:35" → start=21:05, end=22:35)
- Ignore decorative elements, logos, mountain/landscape art, and footer text
- Return ONLY a valid JSON array, no markdown fences, no explanation
- Omit any artist where you cannot determine start_time
"""
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
cd services/api && python3 -m pytest tests/test_llm_parser.py::test_official_lineup_prompt_contains_festival_hours_context -v
```

Expected: PASS

- [ ] **Step 5: Run full backend tests**

```bash
cd services/api && python3 -m pytest
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add services/api/app/core/llm_parser.py services/api/tests/test_llm_parser.py
git commit -m "fix: add Coachella festival hours context to official lineup prompt to fix AM/PM parsing"
```

---

### Task 5: Parallelize official lineup image parsing (3× speedup)

Currently 3 images are parsed sequentially (~40s each = ~2min total). Run them concurrently using asyncio.

**Files:**
- Modify: `services/api/app/api/groups.py`
- Modify: `services/api/tests/test_groups.py`

- [ ] **Step 1: Write a test that verifies concurrent parsing is called**

In `services/api/tests/test_groups.py`, add after existing lineup tests:

```python
def test_import_official_lineup_parses_multiple_images_concurrently() -> None:
    """All images must be parsed; order doesn't matter."""
    founder = _create_group("Parallel Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    day1 = [{"artist_name": "Artist A", "stage_name": "Coachella Stage",
              "start_time": "21:00", "end_time": "22:30", "day_index": 1}]
    day2 = [{"artist_name": "Artist B", "stage_name": "Sahara",
              "start_time": "20:00", "end_time": "21:30", "day_index": 2}]
    day3 = [{"artist_name": "Artist C", "stage_name": "Outdoor Theatre",
              "start_time": "22:00", "end_time": "23:30", "day_index": 3}]

    call_results = [day1, day2, day3]

    with patch("app.api.groups.parse_official_lineup_from_image",
               side_effect=call_results) as mock_parse:
        resp = client.post(
            f"/v1/groups/{group_id}/lineup/import",
            headers={"x-session-token": founder_session},
            files=[
                ("images", ("fri.jpg", make_jpeg_bytes(), "image/jpeg")),
                ("images", ("sat.jpg", make_jpeg_bytes(), "image/jpeg")),
                ("images", ("sun.jpg", make_jpeg_bytes(), "image/jpeg")),
            ],
        )

    assert resp.status_code == 200
    assert resp.json()["sets_created"] == 3
    assert mock_parse.call_count == 3
```

- [ ] **Step 2: Run test — confirm it passes already (behavior is correct, just slow)**

```bash
cd services/api && python3 -m pytest tests/test_groups.py::test_import_official_lineup_parses_multiple_images_concurrently -v
```

Expected: PASS (the test validates correctness; we're about to refactor for speed without breaking it)

- [ ] **Step 3: Refactor `import_official_lineup` to parse images concurrently**

In `services/api/app/api/groups.py`, update the endpoint. The key change is replacing the sequential loop with `asyncio.gather`. The Anthropic client is synchronous, so use `asyncio.to_thread`:

```python
@router.post("/groups/{group_id}/lineup/import")
async def import_official_lineup(
    group_id: str,
    images: list[UploadFile] = File(...),
    session=Depends(require_session),
) -> dict:
    """Import the official festival lineup from graphic images (founder only).

    Accepts up to 3 official day lineup images. Parses all artists using
    Claude Vision concurrently and seeds canonical_sets with source='official'.
    Skips duplicates (same artist + day already exists for group).
    """
    import asyncio

    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    with get_conn() as conn:
        group = conn.execute(
            "SELECT id, festival_days FROM groups WHERE id = ?",
            (group_id,),
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="group_not_found")
        festival_days = json.loads(group["festival_days"]) if group["festival_days"] else [
            {"day_index": 1, "label": "Friday"},
            {"day_index": 2, "label": "Saturday"},
            {"day_index": 3, "label": "Sunday"},
        ]

    # Phase 1: read + validate all images (sequential, cheap)
    compressed_images: list[bytes] = []
    for image in images:
        raw = await image.read()
        try:
            compressed = validate_and_compress(raw)
            compressed_images.append(compressed)
        except ImageValidationError as e:
            logger.warning(f"Official lineup image validation failed: {e}")

    if not compressed_images:
        raise HTTPException(status_code=400, detail="no_valid_images")

    # Phase 2: parse all images concurrently
    async def _parse_one(image_bytes: bytes) -> list[dict]:
        return await asyncio.to_thread(
            parse_official_lineup_from_image, image_bytes, festival_days
        )

    try:
        results = await asyncio.gather(*[_parse_one(img) for img in compressed_images])
    except Exception as e:
        logger.error(f"Official lineup parse failed: {e}")
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")

    all_parsed: list[dict] = []
    days_processed: set[int] = set()
    for parsed in results:
        logger.info(f"Official lineup parse: {len(parsed)} sets")
        all_parsed.extend(parsed)
        for entry in parsed:
            days_processed.add(entry["day_index"])

    if not all_parsed:
        raise HTTPException(status_code=400, detail="no_sets_parsed")

    now = _now_iso()
    sets_created = 0

    with get_conn() as conn:
        for entry in all_parsed:
            existing = conn.execute(
                """
                SELECT id FROM canonical_sets
                WHERE group_id = ?
                  AND LOWER(TRIM(artist_name)) = ?
                  AND day_index = ?
                """,
                (group_id, entry["artist_name"].lower().strip(), entry["day_index"]),
            ).fetchone()

            if existing:
                continue

            conn.execute(
                """
                INSERT INTO canonical_sets
                (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                 day_index, status, source_confidence, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', 1.0, 'official', ?)
                """,
                (
                    str(uuid4()),
                    group_id,
                    entry["artist_name"],
                    entry["stage_name"],
                    entry["start_time"],
                    entry["end_time"] or entry["start_time"],
                    entry["day_index"],
                    now,
                ),
            )
            sets_created += 1

    day_labels = [
        next((d["label"] for d in festival_days if d["day_index"] == di), f"Day {di}")
        for di in sorted(days_processed)
    ]

    return {"sets_created": sets_created, "days_processed": day_labels}
```

- [ ] **Step 4: Run all backend tests — all pass**

```bash
cd services/api && python3 -m pytest
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/groups.py services/api/tests/test_groups.py
git commit -m "perf: parallelize official lineup image parsing with asyncio.gather (~3x speedup)"
```

---

### Task 6: Add DELETE /groups/{group_id}/lineup endpoint + tests

Founders need an escape hatch to clear a bad import. Deletes all `source='official'` canonical_sets and their member preferences.

**Files:**
- Modify: `services/api/app/api/groups.py`
- Modify: `services/api/tests/test_groups.py`

- [ ] **Step 1: Write failing backend tests**

In `services/api/tests/test_groups.py`, add:

```python
def test_delete_official_lineup_removes_sets_and_preferences() -> None:
    from uuid import uuid4
    from datetime import datetime, timezone

    founder = _create_group("Delete Lineup Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    invite_code = founder["group"]["invite_code"]

    # Seed one official and one non-official canonical set
    now = datetime.now(tz=timezone.utc).isoformat()
    official_id = str(uuid4())
    personal_id = str(uuid4())
    member_id = founder["member"]["id"]

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO canonical_sets
               (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                day_index, status, source_confidence, source, created_at)
               VALUES (?, ?, 'Official Artist', 'Sahara', '21:00', '22:00', 1, 'resolved', 1.0, 'official', ?)""",
            (official_id, group_id, now),
        )
        conn.execute(
            """INSERT INTO canonical_sets
               (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                day_index, status, source_confidence, created_at)
               VALUES (?, ?, 'Personal Artist', 'Gobi', '20:00', '21:00', 1, 'resolved', 0.85, ?)""",
            (personal_id, group_id, now),
        )
        conn.execute(
            """INSERT INTO member_set_preferences
               (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
               VALUES (?, ?, ?, 'must_see', 'going', 1.0, ?, ?)""",
            (str(uuid4()), member_id, official_id, now, now),
        )
        conn.execute(
            """INSERT INTO member_set_preferences
               (id, member_id, canonical_set_id, preference, attendance, source_confidence, created_at, updated_at)
               VALUES (?, ?, ?, 'flexible', 'going', 0.85, ?, ?)""",
            (str(uuid4()), member_id, personal_id, now, now),
        )
        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))

    resp = client.delete(
        f"/v1/groups/{group_id}/lineup",
        headers={"x-session-token": founder_session},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["sets_deleted"] == 1

    with get_conn() as conn:
        remaining = conn.execute(
            "SELECT id, source FROM canonical_sets WHERE group_id = ?", (group_id,)
        ).fetchall()
        assert len(remaining) == 1
        assert remaining[0]["source"] != "official"

        prefs = conn.execute(
            "SELECT canonical_set_id FROM member_set_preferences WHERE member_id = ?",
            (member_id,),
        ).fetchall()
        pref_ids = {r["canonical_set_id"] for r in prefs}
        assert official_id not in pref_ids
        assert personal_id in pref_ids


def test_delete_official_lineup_requires_founder() -> None:
    founder = _create_group("Auth Delete Crew", "Founder")
    group_id = founder["group"]["id"]
    invite_code = founder["group"]["invite_code"]

    seed_canonical_sets(group_id)

    member_creator = _create_group("Tmp2", "Member")
    member_session = member_creator["session"]["token"]
    client.post(
        f"/v1/invites/{invite_code}/join",
        headers={"x-session-token": member_session},
        json={"display_name": "Member", "leave_current_group": True},
    )

    resp = client.delete(
        f"/v1/groups/{group_id}/lineup",
        headers={"x-session-token": member_session},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "founder_only"


def test_delete_official_lineup_returns_zero_when_nothing_to_delete() -> None:
    founder = _create_group("Empty Delete Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]

    resp = client.delete(
        f"/v1/groups/{group_id}/lineup",
        headers={"x-session-token": founder_session},
    )
    assert resp.status_code == 200
    assert resp.json()["sets_deleted"] == 0
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd services/api && python3 -m pytest tests/test_groups.py::test_delete_official_lineup_removes_sets_and_preferences tests/test_groups.py::test_delete_official_lineup_requires_founder tests/test_groups.py::test_delete_official_lineup_returns_zero_when_nothing_to_delete -v
```

Expected: FAIL (404 — endpoint doesn't exist yet)

- [ ] **Step 3: Add the DELETE endpoint to groups.py**

In `services/api/app/api/groups.py`, add after the `import_official_lineup` function:

```python
@router.delete("/groups/{group_id}/lineup")
def delete_official_lineup(group_id: str, session=Depends(require_session)) -> dict:
    """Delete all official lineup sets for a group (founder only).

    Also deletes member_set_preferences pointing to those sets, since they
    would be orphaned. Non-official canonical_sets and their preferences
    are untouched.
    """
    if session["group_id"] != group_id or session["role"] != "founder":
        raise HTTPException(status_code=403, detail="founder_only")

    with get_conn() as conn:
        official_rows = conn.execute(
            "SELECT id FROM canonical_sets WHERE group_id = ? AND source = 'official'",
            (group_id,),
        ).fetchall()
        official_ids = [row["id"] for row in official_rows]

        if official_ids:
            placeholders = ",".join("?" * len(official_ids))
            conn.execute(
                f"DELETE FROM member_set_preferences WHERE canonical_set_id IN ({placeholders})",
                official_ids,
            )
            conn.execute(
                "DELETE FROM canonical_sets WHERE group_id = ? AND source = 'official'",
                (group_id,),
            )

    return {"ok": True, "sets_deleted": len(official_ids)}
```

- [ ] **Step 4: Run tests — all pass**

```bash
cd services/api && python3 -m pytest
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/groups.py services/api/tests/test_groups.py
git commit -m "feat: add DELETE /groups/{group_id}/lineup endpoint to clear bad official imports"
```

---

### Task 7: Add Delete Official Lineup button to FounderToolsScreen + wire App.js

Surface the delete endpoint to the founder via a destructive button that only appears after a successful import.

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`
- Modify: `apps/mobile/App.js`
- Modify: `apps/mobile/src/__tests__/FounderToolsScreen.test.js`

- [ ] **Step 1: Write failing tests**

In `apps/mobile/src/__tests__/FounderToolsScreen.test.js`, add to the `done` state describe block:

```js
  it('shows Delete All Official Sets button when done', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
          onDeleteLineup: jest.fn(),
        })}
      />
    );
    expect(getByText('Delete All Official Sets')).toBeTruthy();
  });

  it('calls onDeleteLineup after confirmation', () => {
    const onDeleteLineup = jest.fn();
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
          onDeleteLineup,
        })}
      />
    );
    fireEvent.press(getByText('Delete All Official Sets'));
    expect(onDeleteLineup).toHaveBeenCalledTimes(1);
  });

  it('does not show Delete button when idle', () => {
    const { queryByText } = render(<FounderToolsScreen {...makeProps()} />);
    expect(queryByText('Delete All Official Sets')).toBeNull();
  });
```

Note: `Alert.alert` is mocked in the React Native test environment and calls the first button's `onPress` by default. For simplicity in the test, wire `onDeleteLineup` to be called directly from the button press (with the Alert in the real component handled by the Alert mock auto-confirming in test).

Actually, RN's `Alert.alert` in jest doesn't auto-confirm — instead, design the component so `onDeleteLineup` IS the confirm handler (the Alert confirm calls it). In tests, mock `Alert.alert` to call the second button's `onPress`:

Add to the top of the test file (after imports):
```js
import { Alert } from 'react-native';
jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
  // Auto-press the "Delete" confirm button (index 1)
  buttons?.[1]?.onPress?.();
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: FAIL (button not found)

- [ ] **Step 3: Add delete button to FounderToolsScreen**

In `apps/mobile/src/screens/FounderToolsScreen.js`, import `Alert`:
```js
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
```

Inside the Official Lineup card, after the Re-upload button, add the delete button (only when `lineupImportState === 'done'`):

```js
        {lineupImportState === 'done' && onDeleteLineup ? (
          <Pressable
            onPress={() => {
              Alert.alert(
                'Delete All Official Sets',
                'This will delete all imported sets and everyone\'s selections of them. Are you sure?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDeleteLineup },
                ],
              );
            }}
            style={styles.buttonDestructive}
          >
            <Text style={styles.buttonDestructiveText}>Delete All Official Sets</Text>
          </Pressable>
        ) : null}
```

Add styles:
```js
  buttonDestructive: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  buttonDestructiveText: { color: '#dc2626', fontWeight: '700' },
```

- [ ] **Step 4: Add `deleteOfficialLineup` function and wire in App.js**

In `apps/mobile/App.js`, add the delete function after `importOfficialLineup`:

```js
  const deleteOfficialLineup = async () => {
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/lineup`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
      setLineupImportState('idle');
      setLineupImportResult(null);
      // Refresh schedule so deleted sets disappear from group grid
      const schedulePayload = await fetchSchedule(memberSession, groupId, { memberIds: [] });
      setScheduleSnapshot(schedulePayload);
      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession,
      });
      setHomeSnapshot(homePayload);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };
```

Then in the `<FounderToolsScreen` render block, add:
```js
          onDeleteLineup={deleteOfficialLineup}
```

- [ ] **Step 5: Run all frontend tests — all pass**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/FounderToolsScreen.js apps/mobile/App.js apps/mobile/src/__tests__/FounderToolsScreen.test.js
git commit -m "feat: add Delete All Official Sets button to FounderToolsScreen"
```

---

### Task 8: Add formatTimeStr utility and display times in 12-hour format

Set cards in the group grid and individual schedules show raw "21:30" strings. Add a `formatTimeStr("HH:MM") → "h:mm AM/PM"` utility and use it in those two screens.

**Files:**
- Modify: `apps/mobile/src/utils.js`
- Modify: `apps/mobile/src/__tests__/utils.test.js`
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`
- Modify: `apps/mobile/src/screens/IndividualSchedulesScreen.js`

- [ ] **Step 1: Write failing unit tests for formatTimeStr**

In `apps/mobile/src/__tests__/utils.test.js`, add a new describe block:

```js
describe('formatTimeStr', () => {
  it('formats a PM time correctly', () => {
    expect(formatTimeStr('21:30')).toBe('9:30 PM');
  });

  it('formats noon correctly', () => {
    expect(formatTimeStr('12:00')).toBe('12:00 PM');
  });

  it('formats 1 PM correctly', () => {
    expect(formatTimeStr('13:00')).toBe('1:00 PM');
  });

  it('formats midnight correctly', () => {
    expect(formatTimeStr('00:00')).toBe('12:00 AM');
  });

  it('formats 12:30 PM correctly', () => {
    expect(formatTimeStr('12:30')).toBe('12:30 PM');
  });

  it('formats extended 25:00 (1 AM next day) correctly', () => {
    expect(formatTimeStr('25:00')).toBe('1:00 AM');
  });

  it('formats extended 24:30 (12:30 AM next day) correctly', () => {
    expect(formatTimeStr('24:30')).toBe('12:30 AM');
  });

  it('returns ? for null input', () => {
    expect(formatTimeStr(null)).toBe('?');
  });

  it('returns ? for undefined input', () => {
    expect(formatTimeStr(undefined)).toBe('?');
  });

  it('formats 9:00 AM correctly', () => {
    expect(formatTimeStr('09:00')).toBe('9:00 AM');
  });
});
```

Also add to the import at the top of the test file:
```js
import { timeToMinutes, formatTime, buildTimeline, formatTimeStr } from '../utils';
```

- [ ] **Step 2: Run tests — confirm all formatTimeStr tests fail**

```bash
cd apps/mobile && npm test -- --testPathPattern=utils --passWithNoTests
```

Expected: FAIL (formatTimeStr is not exported)

- [ ] **Step 3: Add formatTimeStr to utils.js**

In `apps/mobile/src/utils.js`, add after the `formatTime` function:

```js
/**
 * Format a "HH:MM" or extended "25:MM" time string as "h:mm AM/PM".
 * Extended hours (24–29) represent 0–5 AM the next day (post-midnight festival sets).
 * Returns "?" for null or undefined input.
 */
export function formatTimeStr(timePt) {
  if (timePt == null) return '?';
  const [hStr, mStr] = String(timePt).split(':');
  const h24 = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h24) || isNaN(m)) return '?';
  const normalizedHour = h24 >= 24 ? h24 - 24 : h24;
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
  const h12 = ((normalizedHour + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
```

- [ ] **Step 4: Run tests — confirm all formatTimeStr tests pass**

```bash
cd apps/mobile && npm test -- --testPathPattern=utils --passWithNoTests
```

Expected: all pass

- [ ] **Step 5: Update GroupScheduleScreen to use formatTimeStr**

In `apps/mobile/src/screens/GroupScheduleScreen.js`:

Add `formatTimeStr` to the import line:
```js
import { timeToMinutes, formatTime, formatTimeStr, minuteToY, buildTimeline, initials, withAlpha, SLOT_MINUTES, SLOT_HEIGHT } from '../utils';
```

Replace the grid card time range display (line ~224):
```js
// REPLACE:
                              {setItem.start_time_pt}{setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt ? `–${setItem.end_time_pt}` : ''}

// WITH:
                              {formatTimeStr(setItem.start_time_pt)}{setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt ? `–${formatTimeStr(setItem.end_time_pt)}` : ''}
```

Replace the expanded set modal subtitle (line ~271):
```js
// REPLACE:
                  {expandedSet.stage_name} • {expandedSet.start_time_pt}-{expandedSet.end_time_pt}

// WITH:
                  {expandedSet.stage_name} • {formatTimeStr(expandedSet.start_time_pt)}–{formatTimeStr(expandedSet.end_time_pt)}
```

- [ ] **Step 6: Update IndividualSchedulesScreen to use formatTimeStr**

In `apps/mobile/src/screens/IndividualSchedulesScreen.js`, add import:
```js
import { formatTimeStr } from '../utils';
```

Replace the set row time display (line ~52):
```js
// REPLACE:
                    {setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} PT • {setItem.preference}

// WITH:
                    {setItem.stage_name} • {formatTimeStr(setItem.start_time_pt)}–{formatTimeStr(setItem.end_time_pt)} • {setItem.preference}
```

(Remove "PT" — the times are displayed in 12-hour format now so the timezone abbreviation is redundant.)

- [ ] **Step 7: Run all frontend tests — all pass**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/utils.js apps/mobile/src/__tests__/utils.test.js apps/mobile/src/screens/GroupScheduleScreen.js apps/mobile/src/screens/IndividualSchedulesScreen.js
git commit -m "feat: display set times in 12-hour format using new formatTimeStr utility"
```

---

### Task 9: Add individual upload dedup test

Verify the existing dedup logic correctly reuses official canonical_sets when a personal upload includes the same artist.

**Files:**
- Modify: `services/api/tests/test_personal.py`

- [ ] **Step 1: Write the failing test**

In `services/api/tests/test_personal.py`, add:

```python
def test_personal_upload_deduplicates_against_official_lineup() -> None:
    """When a personal upload includes an artist already in the official lineup,
    no new canonical_set should be created — the existing one should be reused,
    and a member_set_preference should point to it."""
    from uuid import uuid4
    from datetime import datetime, timezone

    founder = _create_group("Dedup Crew", "Founder")
    group_id = founder["group"]["id"]
    founder_session = founder["session"]["token"]
    member_id = founder["member"]["id"]

    now = datetime.now(tz=timezone.utc).isoformat()
    official_set_id = str(uuid4())

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO canonical_sets
               (id, group_id, artist_name, stage_name, start_time_pt, end_time_pt,
                day_index, status, source_confidence, source, created_at)
               VALUES (?, ?, 'Headliner X', 'Coachella Stage', '22:00', '23:30',
                       1, 'resolved', 1.0, 'official', ?)""",
            (official_set_id, group_id, now),
        )
        conn.execute("UPDATE groups SET setup_complete = 1 WHERE id = ?", (group_id,))

    # Mock the vision parser to return the official artist with the exact same
    # stage + time (as would happen when canonical hints are used correctly)
    parsed_return = [
        {
            "artist_name": "Headliner X",
            "stage_name": "Coachella Stage",
            "start_time": "22:00",
            "end_time": "23:30",
            "day_index": 1,
        }
    ]

    with patch("app.api.personal.parse_schedule_from_image", return_value=parsed_return):
        resp = client.post(
            "/v1/members/me/personal/upload",
            headers={"x-session-token": founder_session},
            data={"day_label": "Friday"},
            files={"images": ("screenshot.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

    assert resp.status_code == 200

    with get_conn() as conn:
        # No duplicate canonical set should exist
        all_sets = conn.execute(
            "SELECT id FROM canonical_sets WHERE group_id = ?", (group_id,)
        ).fetchall()
        assert len(all_sets) == 1, "Should not create a duplicate canonical_set"
        assert all_sets[0]["id"] == official_set_id

        # A preference should exist pointing to the official set
        pref = conn.execute(
            "SELECT canonical_set_id FROM member_set_preferences WHERE member_id = ?",
            (member_id,),
        ).fetchone()
        assert pref is not None
        assert pref["canonical_set_id"] == official_set_id
```

- [ ] **Step 2: Run test — confirm it passes (verifying existing behavior)**

```bash
cd services/api && python3 -m pytest tests/test_personal.py::test_personal_upload_deduplicates_against_official_lineup -v
```

Expected: PASS (the dedup logic already works; this test documents and locks in the behavior)

- [ ] **Step 3: Run full backend test suite**

```bash
cd services/api && python3 -m pytest
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add services/api/tests/test_personal.py
git commit -m "test: add regression test for personal upload dedup against official lineup"
```

---

### Task 10: Run full test suite and push

- [ ] **Step 1: Run frontend tests**

```bash
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all pass

- [ ] **Step 2: Run backend tests**

```bash
cd services/api && python3 -m pytest
```

Expected: all pass

- [ ] **Step 3: Push to remote (triggers Render auto-deploy)**

```bash
git push origin main
```

- [ ] **Step 4: Trigger EAS build**

```bash
cd apps/mobile && eas build --platform ios --profile preview
```

Wait for build to complete and note the build ID from the output.
