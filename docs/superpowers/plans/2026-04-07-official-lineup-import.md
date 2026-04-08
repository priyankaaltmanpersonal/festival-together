# Official Lineup Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the group founder to upload the 3 official Coachella day graphics, seeding the full lineup as canonical sets. Individual members can skip screenshot upload and browse/tap from the full grid. Personal screenshot parsing is augmented with canonical hints. Grid gets a "hide unattended" toggle.

**Architecture:** New Alembic migration adds `source` column to `canonical_sets`. New endpoint `POST /v1/groups/{group_id}/lineup/import` parses official graphics via a new Claude Vision prompt. Home endpoint gains `has_official_lineup` field. Mobile adds upload UI in FounderToolsScreen, a "Browse Full Lineup" path in SetupScreen's upload step, and a hide-unattended toggle in GroupScheduleScreen.

**Tech Stack:** Python/FastAPI, Alembic, Claude Vision (claude-sonnet-4-6), React Native (Expo), expo-image-picker, Jest.

---

## File Map

| File | Change |
|------|--------|
| `services/api/alembic/versions/003_add_canonical_sets_source.py` | New migration: source column |
| `services/api/app/core/llm_parser.py` | New `_OFFICIAL_LINEUP_PROMPT` + `parse_official_lineup_from_image()` function; augment existing `parse_schedule_from_image` with optional hints |
| `services/api/app/api/groups.py` | New `POST /groups/{group_id}/lineup/import` endpoint; add `has_official_lineup` to home response |
| `services/api/app/api/schedule.py` | Include `source` field in set response items |
| `services/api/app/api/personal.py` | Fetch official canonical sets before parse; pass as hints to llm_parser |
| `apps/mobile/App.js` | New `importOfficialLineup()` function; thread `hasOfficialLineup` and `onBrowseFullLineup` props |
| `apps/mobile/src/screens/FounderToolsScreen.js` | Upload Official Lineup UI section |
| `apps/mobile/src/screens/SetupScreen.js` | Accept `hasOfficialLineup` + `onBrowseFullLineup` props; render skip button |
| `apps/mobile/src/screens/GroupScheduleScreen.js` | Hide-unattended toggle |
| `apps/mobile/src/__tests__/GroupScheduleScreen.test.js` | Hide-unattended toggle test |

---

## Task 1: Alembic Migration — `source` Column on `canonical_sets`

**Files:**
- Create: `services/api/alembic/versions/003_add_canonical_sets_source.py`

- [ ] **Step 1: Create the migration file**

```python
# services/api/alembic/versions/003_add_canonical_sets_source.py
"""Add source column to canonical_sets table.

Revision ID: 003
Revises: 002
Create Date: 2026-04-07
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "canonical_sets" not in inspector.get_table_names():
        return
    existing = [c["name"] for c in inspector.get_columns("canonical_sets")]
    if "source" not in existing:
        op.add_column(
            "canonical_sets",
            sa.Column("source", sa.Text(), nullable=False, server_default="member"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "canonical_sets" not in inspector.get_table_names():
        return
    existing = [c["name"] for c in inspector.get_columns("canonical_sets")]
    if "source" in existing:
        op.drop_column("canonical_sets", "source")
```

- [ ] **Step 2: Verify migration runs without error (local)**

```bash
cd services/api && .venv/bin/alembic upgrade head
```

Expected: `Running upgrade 002 -> 003, Add source column to canonical_sets table` (or `INFO  [alembic.runtime.migration] Running upgrade ...`)

- [ ] **Step 3: Commit**

```bash
git add services/api/alembic/versions/003_add_canonical_sets_source.py
git commit -m "chore: add Alembic migration for canonical_sets.source column"
git push
```

---

## Task 2: Official Lineup Vision Parser

**Files:**
- Modify: `services/api/app/core/llm_parser.py`

- [ ] **Step 1: Add the official lineup prompt constant**

In `llm_parser.py`, after `_VISION_PROMPT`, add:

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

Rules:
- Extract ALL performers shown in the grid — this is a complete schedule, not a personal selection
- Stage names come from the column headers at the top of the grid image
- Times are shown as bullets or in a time range (e.g. "9:05–10:35" → start=09:05, end=10:35)
- Ignore decorative elements, logos, mountain/landscape art, and footer text
- Return ONLY a valid JSON array, no markdown fences, no explanation
- Omit any artist where you cannot determine start_time
"""
```

- [ ] **Step 2: Add `parse_official_lineup_from_image()` function**

After the existing `parse_schedule_from_image` function, add:

```python
def parse_official_lineup_from_image(
    image_bytes: bytes,
    festival_days: list[dict],
) -> list[dict]:
    """Parse the complete official Coachella lineup graphic using Claude vision.

    Extracts all artists from the full schedule grid (not just selected ones).
    Reads the day from the image text itself ("FRIDAY" / "SATURDAY" / "SUNDAY").

    Args:
        image_bytes: Compressed JPEG bytes.
        festival_days: List of {day_index, label} dicts from group config.

    Returns:
        List of dicts: {artist_name, stage_name, start_time, end_time, day_index}.
    """
    client = _get_client()
    if client is None:
        logger.warning("ANTHROPIC_API_KEY not set — skipping official lineup parse")
        return []

    prompt = _OFFICIAL_LINEUP_PROMPT.format(
        festival_days_json=json.dumps(festival_days),
    )

    image_b64 = base64.standard_b64encode(image_bytes).decode()

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        if not response.content:
            raise RuntimeError("Vision API returned empty content")
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            raise RuntimeError(f"Official lineup parser returned non-list: {type(parsed)}")
    except json.JSONDecodeError as e:
        logger.error(f"Official lineup parser returned invalid JSON: {e}")
        raise RuntimeError(f"Official lineup parser returned invalid JSON: {e}") from e
    except RuntimeError:
        raise
    except Exception as e:
        logger.error(f"Official lineup parse failed: {e}")
        raise RuntimeError(f"Vision API call failed: {e}") from e

    # Build day_label → day_index map
    day_map: dict[str, int] = {
        day.get("label", "").upper(): day.get("day_index", 1)
        for day in festival_days
    }

    results = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        artist = (entry.get("artist_name") or "").strip()
        stage = normalize_stage((entry.get("stage_name") or ""))
        start = (entry.get("start_time") or "").strip()
        end = entry.get("end_time")
        if end:
            end = str(end).strip()
        day_index = entry.get("day_index")
        if not isinstance(day_index, int):
            continue  # skip entries where day couldn't be determined
        if not artist or not stage or not start:
            continue
        results.append({
            "artist_name": artist,
            "stage_name": stage,
            "start_time": start,
            "end_time": end,
            "day_index": day_index,
        })

    logger.info(f"parse_official_lineup_from_image returned {len(results)} sets")
    return results
```

- [ ] **Step 3: Add `canonical_hints` parameter to `parse_schedule_from_image`**

Find `_VISION_PROMPT` and at the end of the string, add a `{canonical_hints_section}` placeholder:

```python
_VISION_PROMPT = """\
You are extracting a user's personally selected festival performances from a mobile app screenshot.
...
- If no selected performances found, return []
{canonical_hints_section}"""
```

Update `parse_schedule_from_image` signature and prompt formatting:

```python
def parse_schedule_from_image(
    image_bytes: bytes,
    day_label: str,
    festival_days: list[dict],
    canonical_hints: list[dict] | None = None,
) -> list[dict]:
    """Parse a festival schedule screenshot using Claude vision.
    ...
    Args:
        ...
        canonical_hints: Optional list of {artist_name, stage_name, start_time_pt, end_time_pt}
                         dicts from the official lineup for this day. When provided, the model
                         cross-references these against the screenshot highlights.
    ...
    """
    ...
    hints_section = ""
    if canonical_hints:
        lines = "\n".join(
            f"- {h['artist_name']} | {h['stage_name']} | {h['start_time_pt']}–{h.get('end_time_pt', '?')}"
            for h in canonical_hints
        )
        hints_section = (
            f"\n\nKnown official sets for this day (use as reference):\n{lines}\n"
            "Cross-reference these against what's visually selected in the screenshot. "
            "Prefer matching a known set name over re-reading small text."
        )

    prompt = _VISION_PROMPT.format(
        festival_days_json=json.dumps(festival_days),
        day_label=effective_day_label,
        canonical_hints_section=hints_section,
    )
```

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add services/api/app/core/llm_parser.py
git commit -m "feat: add official lineup vision parser and canonical hints support"
git push
```

---

## Task 3: Official Lineup Import Endpoint

**Files:**
- Modify: `services/api/app/api/groups.py`

- [ ] **Step 1: Add imports at top of groups.py**

At the top of `groups.py`, add to existing imports:

```python
import logging
from fastapi import File, UploadFile
from app.core.image_utils import validate_and_compress, ImageValidationError
from app.core.llm_parser import parse_official_lineup_from_image
```

Add `logger = logging.getLogger(__name__)` after the import block if not already present.

- [ ] **Step 2: Add the import endpoint**

At the bottom of `groups.py`, add:

```python
@router.post("/groups/{group_id}/lineup/import")
async def import_official_lineup(
    group_id: str,
    images: list[UploadFile] = File(...),
    session=Depends(require_session),
) -> dict:
    """Import the official festival lineup from graphic images (founder only).

    Accepts up to 3 official day lineup images. Parses all artists using
    Claude Vision and seeds canonical_sets with source='official'.
    Skips duplicates (same artist + day already exists for group).
    """
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

    all_parsed: list[dict] = []
    days_processed: set[int] = set()

    for image in images:
        raw = await image.read()
        try:
            compressed = validate_and_compress(raw)
        except ImageValidationError as e:
            logger.warning(f"Official lineup image validation failed: {e}")
            continue

        try:
            parsed = parse_official_lineup_from_image(compressed, festival_days)
            logger.info(f"Official lineup parse: {len(parsed)} sets from {image.filename}")
            all_parsed.extend(parsed)
            for entry in parsed:
                days_processed.add(entry["day_index"])
        except Exception as e:
            logger.error(f"Official lineup parse failed for {image.filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Parse failed: {e}")

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

- [ ] **Step 3: Register the new router in main.py**

The lineup endpoint is on the `groups_router` which is already registered. No change needed to `main.py`.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add services/api/app/api/groups.py
git commit -m "feat: add POST /groups/{group_id}/lineup/import endpoint"
git push
```

---

## Task 4: `has_official_lineup` in Home Response

**Files:**
- Modify: `services/api/app/api/groups.py`

- [ ] **Step 1: Add the query in member_home()**

In `groups.py`, find `member_home()`. Inside the `with get_conn() as conn:` block, after the existing queries, add:

```python
has_official_lineup = conn.execute(
    "SELECT 1 FROM canonical_sets WHERE group_id = ? AND source = 'official' LIMIT 1",
    (member["group_id"],),
).fetchone() is not None
```

- [ ] **Step 2: Add to the return dict**

In the `return` statement of `member_home()`, update the `"group"` key:

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
},
```

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add services/api/app/api/groups.py
git commit -m "feat: add has_official_lineup to home response"
git push
```

---

## Task 5: `source` Field in Schedule Response

**Files:**
- Modify: `services/api/app/api/schedule.py`

- [ ] **Step 1: Include source in the SELECT query**

In `group_schedule()`, find the `canonical_sets` SELECT query. Add `source` to it:

```python
canonical_sets = conn.execute(
    """
    SELECT id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status, source
    FROM canonical_sets
    WHERE group_id = ?
    ORDER BY day_index, start_time_pt, stage_name
    """,
    (group_id,),
).fetchall()
```

- [ ] **Step 2: Include source in the set dict**

In the `schedule_sets.append(...)` block, add:

```python
"source": row["source"] if "source" in row.keys() else "member",
```

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add services/api/app/api/schedule.py
git commit -m "feat: include source field in group schedule response"
git push
```

---

## Task 6: Smarter Personal Screenshot Parsing

**Files:**
- Modify: `services/api/app/api/personal.py`

- [ ] **Step 1: Fetch canonical hints before the parse loop**

In `personal.py`, find the "Phase 2: Claude vision parse" section. After `effective_day_label` is computed but before the `for idx, upload in enumerate(images):` loop, add:

```python
# Fetch official canonical sets for this day to use as parsing hints
effective_day_index = next(
    (d["day_index"] for d in festival_days
     if d.get("label", "").upper() == effective_day_label.upper()),
    festival_days[0]["day_index"] if festival_days else 1,
)
with get_conn() as conn:
    hint_rows = conn.execute(
        """
        SELECT artist_name, stage_name, start_time_pt, end_time_pt
        FROM canonical_sets
        WHERE group_id = ? AND day_index = ? AND source = 'official'
        ORDER BY start_time_pt
        """,
        (member["group_id"], effective_day_index),
    ).fetchall()
canonical_hints = [
    {
        "artist_name": row["artist_name"],
        "stage_name": row["stage_name"],
        "start_time_pt": row["start_time_pt"],
        "end_time_pt": row["end_time_pt"],
    }
    for row in hint_rows
] or None
```

- [ ] **Step 2: Pass hints to the parser**

Find the `parse_schedule_from_image` call:

```python
parsed = parse_schedule_from_image(compressed, effective_day_label, festival_days)
```

Replace with:

```python
parsed = parse_schedule_from_image(
    compressed, effective_day_label, festival_days, canonical_hints=canonical_hints
)
```

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add services/api/app/api/personal.py
git commit -m "feat: augment personal screenshot parsing with official lineup hints"
git push
```

---

## Task 7: `importOfficialLineup` in App.js

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Import pickImages and uploadImages**

At the top of `App.js`, verify `pickImages` and `uploadImages` are already imported from `./src/services/uploadImages`. If not, add:

```js
import { pickImages, uploadImages } from './src/services/uploadImages';
```

- [ ] **Step 2: Add lineupImportState state**

In the state declarations section, add:

```js
const [lineupImportState, setLineupImportState] = useState('idle'); // 'idle' | 'uploading' | 'done' | 'error'
const [lineupImportResult, setLineupImportResult] = useState(null); // { sets_created, days_processed }
```

- [ ] **Step 3: Add the importOfficialLineup function**

After the `loadIndividual` function, add:

```js
const importOfficialLineup = async () => {
  try {
    const uris = await pickImages(3);
    if (!uris) return; // user cancelled
    setLineupImportState('uploading');
    const result = await uploadImages(
      apiUrl,
      `/v1/groups/${groupId}/lineup/import`,
      memberSession,
      uris,
    );
    setLineupImportResult(result);
    setLineupImportState('done');
    // Refresh home snapshot so has_official_lineup updates
    const homePayload = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/home',
      method: 'GET',
      sessionToken: memberSession,
    });
    setHomeSnapshot(homePayload);
    // Refresh schedule so newly seeded sets appear
    const schedulePayload = await fetchSchedule(memberSession, groupId, { memberIds: [] });
    setScheduleSnapshot(schedulePayload);
  } catch (err) {
    setLineupImportState('error');
    setError(friendlyError(err instanceof Error ? err.message : String(err)));
  }
};
```

- [ ] **Step 4: Thread props to FounderToolsScreen**

Find the `FounderToolsScreen` render in `App.js`. Add the new props:

```jsx
<FounderToolsScreen
  inviteCode={inviteCode}
  groupName={homeSnapshot?.group?.name}
  onOpenSchedule={() => setActiveView('group')}
  onImportLineup={importOfficialLineup}
  lineupImportState={lineupImportState}
  lineupImportResult={lineupImportResult}
/>
```

- [ ] **Step 5: Thread hasOfficialLineup and onBrowseFullLineup to SetupScreen**

Find the `SetupScreen` render. Add:

```jsx
<SetupScreen
  ...existing props...
  hasOfficialLineup={Boolean(homeSnapshot?.group?.has_official_lineup)}
  onBrowseFullLineup={finishUploadFlow}
/>
```

- [ ] **Step 6: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add apps/mobile/App.js
git commit -m "feat: add importOfficialLineup function and thread lineup props"
git push
```

---

## Task 8: FounderToolsScreen Upload UI

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`

- [ ] **Step 1: Update props and add the lineup section**

Replace the entire `FounderToolsScreen.js` with:

```js
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  lineupImportState = 'idle',
  lineupImportResult = null,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Founder Controls</Text>
        <Text style={styles.helper}>Group: {groupName || 'n/a'}</Text>
        <Text style={styles.helper}>Invite code: {inviteCode || 'n/a'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Official Lineup</Text>
        <Text style={styles.helper}>
          Upload the 3 official day graphics to seed the full schedule for your group.
          Members can then browse and tap artists directly without uploading screenshots.
        </Text>

        {lineupImportState === 'uploading' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={styles.helper}>Parsing lineup… this may take 15–30 seconds.</Text>
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
        ) : null}

        <Pressable
          onPress={onImportLineup}
          disabled={lineupImportState === 'uploading'}
          style={[styles.buttonPrimary, lineupImportState === 'uploading' && styles.buttonDisabled]}
        >
          <Text style={styles.buttonPrimaryText}>
            {lineupImportState === 'done' ? 'Re-upload to Add Missing Sets' : 'Upload Official Lineup'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Back to Group View</Text>
        <Pressable onPress={onOpenSchedule} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>Open Group Schedule</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8,
  },
  label: { fontWeight: '700', color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successBox: {
    backgroundColor: C.successBg || '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.successBorder || '#86efac',
  },
  successText: { color: C.success || '#16a34a', fontWeight: '700', fontSize: 13 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonPrimaryText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add apps/mobile/src/screens/FounderToolsScreen.js
git commit -m "feat: add Upload Official Lineup section to FounderToolsScreen"
git push
```

---

## Task 9: SetupScreen — "Browse Full Lineup" Path

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`

- [ ] **Step 1: Add props to SetupScreen**

In `SetupScreen`'s props destructuring, add:

```js
export function SetupScreen({
  ...existing props...,
  hasOfficialLineup,
  onBrowseFullLineup,
}) {
```

- [ ] **Step 2: Add the Browse button in the upload_all_days step**

In the `upload_all_days` step block, after the existing `<ActionButton label="Skip This Day" .../>`, add:

```jsx
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

- [ ] **Step 3: Add the divider styles to makeStyles**

In `makeStyles`, add:

```js
orDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
orLine: { flex: 1, height: 1, backgroundColor: C.cardBorder },
orText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
```

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add apps/mobile/src/screens/SetupScreen.js
git commit -m "feat: add Browse Full Lineup skip path to SetupScreen upload step"
git push
```

---

## Task 10: Group Grid — Hide Unattended Sets Toggle

**Files:**
- Modify: `apps/mobile/src/screens/GroupScheduleScreen.js`
- Test: `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`

- [ ] **Step 1: Write the failing test**

Open `apps/mobile/src/__tests__/GroupScheduleScreen.test.js`. Add:

```js
it('hide-unattended toggle filters out sets with attendee_count 0', () => {
  const sets = [
    {
      id: 'set-1', artist_name: 'Attended Artist', stage_name: 'Coachella Stage',
      start_time_pt: '20:00', end_time_pt: '21:00', day_index: 1,
      attendee_count: 1, attendees: [{ member_id: 'me', display_name: 'Me', preference: 'must_see', chip_color: '#f00' }],
      popularity_tier: 'low',
    },
    {
      id: 'set-2', artist_name: 'Unattended Artist', stage_name: 'Coachella Stage',
      start_time_pt: '21:30', end_time_pt: '22:30', day_index: 1,
      attendee_count: 0, attendees: [],
      popularity_tier: 'none',
    },
  ];
  const props = makeProps({
    scheduleSnapshot: { sets, stages: ['Coachella Stage'] },
  });
  const { getByText, queryByText } = render(<GroupScheduleScreen {...props} />);

  // Both visible before toggle
  expect(getByText('Attended Artist')).toBeTruthy();
  expect(getByText('Unattended Artist')).toBeTruthy();

  // Tap the "Group only" toggle
  fireEvent.press(getByText('Group only'));

  // Unattended now hidden
  expect(getByText('Attended Artist')).toBeTruthy();
  expect(queryByText('Unattended Artist')).toBeNull();

  // Tap again to disable toggle
  fireEvent.press(getByText('Group only'));
  expect(getByText('Unattended Artist')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/mobile && npm test -- --testPathPattern=GroupScheduleScreen.test --passWithNoTests
```

Expected: FAIL — no "Group only" toggle exists.

- [ ] **Step 3: Add hideUnattended state**

In `GroupScheduleScreen.js`, after the existing `useState` declarations, add:

```js
const [hideUnattended, setHideUnattended] = useState(false);
```

- [ ] **Step 4: Apply the filter**

Find where `filteredSets` is used to build `stageColumns`. Before that, add:

```js
const visibleSets = hideUnattended
  ? filteredSets.filter((s) => s.attendee_count > 0)
  : filteredSets;
```

Replace all uses of `filteredSets` in `stageColumns` and `timeline` with `visibleSets`:

```js
const stageColumns = stages
  .map((stage) => ({
    stage,
    sets: visibleSets
      .filter((item) => item.stage_name === stage)
      .sort(...),
  }));

const timeline = buildTimeline(visibleSets, gridBodyHeight || 0);
```

- [ ] **Step 5: Determine when to show the toggle**

```js
const hasUnattendedSets = filteredSets.some((s) => s.attendee_count === 0);
```

- [ ] **Step 6: Add the toggle button**

In the `filterBar`, on the same row as the DaySelector (or as its own row below it), add:

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

Add styles to `makeStyles`:

```js
toggleRow: { flexDirection: 'row', justifyContent: 'flex-end' },
togglePill: {
  borderWidth: 1,
  borderColor: C.inputBorder,
  borderRadius: 14,
  paddingHorizontal: 10,
  paddingVertical: 4,
  backgroundColor: C.inputBg,
},
togglePillActive: {
  backgroundColor: C.primaryBg,
  borderColor: C.primary,
},
togglePillText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
togglePillTextActive: { color: C.primary, fontWeight: '700' },
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd apps/mobile && npm test -- --testPathPattern=GroupScheduleScreen.test --passWithNoTests
```

Expected: PASS.

- [ ] **Step 8: Final full test run and commit**

```bash
cd apps/mobile && npm test -- --passWithNoTests
git add apps/mobile/src/screens/GroupScheduleScreen.js apps/mobile/src/__tests__/GroupScheduleScreen.test.js
git commit -m "feat: add hide-unattended sets toggle to group grid"
git push
```
