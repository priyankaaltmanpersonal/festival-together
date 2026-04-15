"""Claude vision-based schedule parser.

Replaces the two-step Google Cloud Vision OCR + Claude text pipeline.
Sends the image directly to Claude Haiku with vision to handle both
list-view screenshots (all artists are user picks) and full grid screenshots
(only highlighted/selected cells are user picks).
"""
from __future__ import annotations

import base64
import json
import logging
from collections import defaultdict
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Maps lowercase stage name variants to canonical Coachella stage names.
_STAGE_ALIASES: dict[str, str] = {
    "main": "Coachella Stage",
    "main stage": "Coachella Stage",
    "coachella": "Coachella Stage",
    "the coachella stage": "Coachella Stage",
    "coachella stage": "Coachella Stage",
    "outdoor": "Outdoor Theatre",
    "outdoor theater": "Outdoor Theatre",
    "outdoor theatre": "Outdoor Theatre",
    "the outdoor theatre": "Outdoor Theatre",
    "sahara stage": "Sahara",
    "sahara tent": "Sahara",
    "gobi tent": "Gobi",
    "gobi stage": "Gobi",
    "mojave tent": "Mojave",
    "mojave stage": "Mojave",
    "sonora stage": "Sonora",
    "yuma stage": "Yuma",
}


def _time_str_to_minutes(t: str) -> int:
    """Convert a HH:MM (including extended 24:MM–29:MM) string to total minutes."""
    if not t:
        return 0
    parts = t.strip().split(":")
    if len(parts) != 2:
        return 0
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return 0


def _detect_anomalies(results: list[dict]) -> list[str]:
    """Return human-readable descriptions of suspicious parse results.

    An empty list means the results look clean.  This function never drops
    or modifies entries — callers use the returned issues to decide whether
    to retry the parse with corrective hints.

    Checks:
    1. Sets starting before 1 PM (13:00) — festival never starts before then;
       most likely a 12:XX AM → 12:XX PM misparse.
    2. Sets with an explicit duration > 4 hours — almost certainly a misread.
    3. Same-stage / same-day overlaps — two artists can't share a stage slot.
    """
    MIN_START = 780    # 13:00 = 1 PM
    MAX_DURATION = 240  # 4 hours

    issues: list[str] = []

    for entry in results:
        artist = entry.get("artist_name", "?")
        start_str = entry.get("start_time") or ""
        end_str = entry.get("end_time") or ""
        start = _time_str_to_minutes(start_str)

        if start_str and start < MIN_START:
            # Suggest the midnight-extended equivalent so the model can self-correct
            try:
                h, m = start_str.split(":")
                suggested = f"{int(h) + 24}:{m}"
            except Exception:
                suggested = "(use extended 24+ format)"
            issues.append(
                f"'{artist}' has start_time {start_str!r} which is before 1 PM — "
                "festival sets never start before 1 PM; this is almost certainly a "
                f"12 AM → 12 PM misparse; did you mean {suggested!r}?"
            )

        if end_str:
            end = _time_str_to_minutes(end_str)
            duration = end - start
            if end > start and duration > MAX_DURATION:
                issues.append(
                    f"'{artist}' has duration {duration} min ({start_str}–{end_str}) "
                    "which exceeds 4 hours — please verify the end time"
                )

    # Same-stage / same-day overlap check
    by_stage_day: dict[tuple, list] = defaultdict(list)
    for entry in results:
        key = (entry.get("day_index"), (entry.get("stage_name") or "").lower().strip())
        by_stage_day[key].append(entry)

    for entries in by_stage_day.values():
        sorted_entries = sorted(
            entries,
            key=lambda e: _time_str_to_minutes(e.get("start_time", "")),
        )
        for i in range(len(sorted_entries) - 1):
            curr = sorted_entries[i]
            nxt = sorted_entries[i + 1]
            curr_end_str = curr.get("end_time") or ""
            if curr_end_str:
                curr_end = _time_str_to_minutes(curr_end_str)
                nxt_start = _time_str_to_minutes(nxt.get("start_time") or "")
                if nxt_start < curr_end:
                    issues.append(
                        f"'{curr['artist_name']}' (ends {curr_end_str}) and "
                        f"'{nxt['artist_name']}' (starts {nxt.get('start_time')}) "
                        f"overlap on stage '{curr.get('stage_name')}' — "
                        "two artists cannot perform on the same stage at the same time; "
                        "check stage column assignments or time values"
                    )

    return issues


def _correction_hints_section(anomalies: list[str]) -> str:
    """Build a prompt addendum describing detected anomalies for a correction retry."""
    lines = "\n".join(f"  - {a}" for a in anomalies)
    return (
        "\n\nCORRECTION REQUIRED — a previous parse of this same image returned "
        "suspicious entries that indicate reading errors:\n"
        f"{lines}\n\n"
        "Please re-examine the image and return a fully corrected JSON array. "
        "Key reminders:\n"
        "  • Festival sets NEVER start before 1:00 PM. If you see '12:XX', it is "
        "midnight (12:XX AM) — output as '24:XX' in extended format.\n"
        "  • Two artists cannot be on the same stage at the same time. Verify "
        "each artist's column header.\n"
        "  • Most sets run 60–90 minutes. A 5+ hour duration is almost always a misread."
    )


def normalize_stage(name: str) -> str:
    """Return the canonical stage name for known aliases, or the stripped input."""
    if not name:
        return name
    stripped = name.strip()
    return _STAGE_ALIASES.get(stripped.lower(), stripped)


def _curfew_for_day(day_label: str) -> str:
    """Return the noise-ordinance curfew end time for a given day label.

    Coachella noise ordinances:
    - Sunday: all music must end by midnight → "24:00" (extended format)
    - Friday / Saturday: music ends by 1:00 AM → "25:00" (extended format)
    """
    if "sunday" in day_label.lower():
        return "24:00"
    return "25:00"


def _apply_curfew_defaults(results: list[dict], festival_days: list[dict]) -> list[dict]:
    """Fill in missing end_times using the noise-ordinance curfew for each day.

    Also replaces end_time when it equals start_time, which the vision model
    sometimes returns for sets whose end time isn't shown in the screenshot.
    """
    day_label_by_index: dict[int, str] = {
        d["day_index"]: d.get("label", "") for d in festival_days
    }
    for entry in results:
        end = entry.get("end_time")
        start = entry.get("start_time", "")
        if not end or end == start:
            label = day_label_by_index.get(entry.get("day_index", -1), "")
            entry["end_time"] = _curfew_for_day(label)
    return results


_VISION_PROMPT = """\
You are extracting a user's personally selected festival performances from a mobile app screenshot.

The screenshot is one of two types:
1. PERSONAL LIST VIEW: Shows only the artists the user has saved/starred — a clean list with artist names, times, and stage names. All visible artists are the user's picks. Extract all of them.
2. FULL GRID WITH HIGHLIGHTS: Shows the complete festival schedule as a grid with many artists, most of which are NOT selected. The user's picks are visually highlighted in a way that would be obvious to any human looking at the screen — use your judgment to determine which cells look selected vs. unselected based on whatever visual treatment the app uses (color, contrast, background, border, etc.). Extract only the artists that appear selected.

For each selected artist, extract:
- artist_name: performer name (string)
- stage_name: stage or venue name (string)
- start_time: 24-hour "HH:MM" format. Times from 12:00AM–5:59AM use "24:MM"–"29:MM" to preserve ordering after midnight (e.g. 1:00AM = "25:00")
- end_time: same format, or null if not shown
- day_index: integer matching the festival day (use the provided festival_days list to resolve day names)

Festival days for this group: {festival_days_json}
This screenshot is for day: {day_label}

Rules:
- Ignore UI chrome, headers, footers, branding, download prompts
- Ignore "Surprise", "TBA", or placeholder entries
- If the same artist appears more than once with identical time/stage, include only once
- Return ONLY a valid JSON array, no markdown fences, no explanation
- If no selected performances found, return []
{canonical_hints_section}"""


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


def _get_client():
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    except Exception as e:
        logger.error(f"Failed to create Anthropic client: {e}")
        return None


def _call_vision_api(client, image_b64: str, prompt: str, max_tokens: int) -> list:
    """Make a single vision API call and return the parsed JSON list.

    Raises RuntimeError on API failure, empty response, or non-JSON output.
    Strips markdown fences if the model wraps its response in them.
    """
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
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
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Vision parser returned invalid JSON: {e}\nRaw: {text[:500]}") from e
    if not isinstance(parsed, list):
        raise RuntimeError(f"Vision parser returned non-list: {type(parsed)}")
    return parsed


def _normalize_personal_entries(
    parsed: list,
    default_day_index: int,
) -> list[dict]:
    """Normalize raw parsed entries from parse_schedule_from_image."""
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
            day_index = default_day_index
        if not artist or not stage or not start:
            continue
        results.append({
            "artist_name": artist,
            "stage_name": stage,
            "start_time": start,
            "end_time": end,
            "day_index": day_index,
        })
    return results


def _normalize_official_entries(parsed: list) -> list[dict]:
    """Normalize raw parsed entries from parse_official_lineup_from_image."""
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
    return results


def parse_schedule_from_image(
    image_bytes: bytes,
    day_label: str,
    festival_days: list[dict[str, Any]],
    canonical_hints: list[dict] | None = None,
) -> list[dict[str, Any]]:
    """Parse a festival schedule screenshot using Claude vision.

    Handles both personal list-view screenshots and full grid screenshots
    with visual highlighting. Returns only the user's selected artists.

    If the initial parse contains suspicious entries (sets before 1 PM,
    same-stage overlaps, or durations > 4 hours), the image is parsed a
    second time with the detected issues fed back to the model as correction
    hints.  The corrected result is returned; no entries are silently dropped.

    Args:
        image_bytes: Compressed JPEG bytes from validate_and_compress.
        day_label: Which day this screenshot covers, e.g. "Friday".
                   If empty, defaults to festival_days[0].label.
        festival_days: List of {day_index, label} dicts from group config.
        canonical_hints: Optional list of {artist_name, stage_name, start_time_pt, end_time_pt}
                         dicts from the official lineup for this day. When provided, the model
                         cross-references these against the screenshot highlights.

    Returns:
        List of dicts: {artist_name, stage_name, start_time, end_time, day_index}.
        Empty list if parsing fails or API key not configured.
    """
    client = _get_client()
    if client is None:
        logger.warning("ANTHROPIC_API_KEY not set — skipping vision parse")
        return []

    effective_day_label = day_label.strip() if day_label and day_label.strip() else (
        festival_days[0]["label"] if festival_days else "Day 1"
    )

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

    image_b64 = base64.standard_b64encode(image_bytes).decode()

    # Build day_label → day_index map
    day_map: dict[str, int] = {
        day.get("label", "").upper(): day.get("day_index", 1)
        for day in festival_days
    }
    default_day_index = (
        day_map.get(effective_day_label.upper(), festival_days[0]["day_index"])
        if festival_days else 1
    )

    try:
        parsed = _call_vision_api(client, image_b64, prompt, max_tokens=4096)
    except RuntimeError as e:
        logger.error(f"Vision parse failed: {e}")
        raise

    results = _normalize_personal_entries(parsed, default_day_index)

    # Detect anomalies and retry once with correction hints if needed
    anomalies = _detect_anomalies(results)
    if anomalies:
        logger.info(
            "parse_schedule_from_image: %d anomaly(ies) detected — retrying with correction hints",
            len(anomalies),
        )
        corrected_prompt = prompt + _correction_hints_section(anomalies)
        try:
            parsed2 = _call_vision_api(client, image_b64, corrected_prompt, max_tokens=4096)
            results = _normalize_personal_entries(parsed2, default_day_index)
        except RuntimeError as e:
            logger.warning("Correction retry failed (%s) — using initial results", e)

    results = _apply_curfew_defaults(results, festival_days)
    logger.info(f"parse_schedule_from_image returned {len(results)} sets")
    return results


def parse_official_lineup_from_image(
    image_bytes: bytes,
    festival_days: list[dict],
) -> list[dict]:
    """Parse the complete official Coachella lineup graphic using Claude vision.

    Extracts all artists from the full schedule grid (not just selected ones).
    Reads the day from the image text itself ("FRIDAY" / "SATURDAY" / "SUNDAY").

    If the initial parse contains suspicious entries (sets before 1 PM,
    same-stage overlaps, or durations > 4 hours), the image is parsed a
    second time with the detected issues fed back to the model as correction
    hints.  The corrected result is returned; no entries are silently dropped.

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
        parsed = _call_vision_api(client, image_b64, prompt, max_tokens=8192)
    except RuntimeError as e:
        logger.error(f"Official lineup parse failed: {e}")
        raise

    results = _normalize_official_entries(parsed)

    # Detect anomalies and retry once with correction hints if needed
    anomalies = _detect_anomalies(results)
    if anomalies:
        logger.info(
            "parse_official_lineup_from_image: %d anomaly(ies) detected — retrying with correction hints",
            len(anomalies),
        )
        corrected_prompt = prompt + _correction_hints_section(anomalies)
        try:
            parsed2 = _call_vision_api(client, image_b64, corrected_prompt, max_tokens=8192)
            results = _normalize_official_entries(parsed2)
        except RuntimeError as e:
            logger.warning("Correction retry failed (%s) — using initial results", e)

    results = _apply_curfew_defaults(results, festival_days)
    logger.info(f"parse_official_lineup_from_image returned {len(results)} sets")
    return results
