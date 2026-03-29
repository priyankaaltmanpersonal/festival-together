"""LLM-based schedule parser using Claude Haiku.

Replaces the brittle regex parser for real uploads. Handles any screenshot
format — list view, grid/column view, or any future redesign — by asking
the LLM to interpret the raw OCR text rather than pattern-matching it.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are extracting music festival performance data from OCR text that was scanned from a mobile app or website screenshot.

The screenshot may be in one of several formats:
1. LIST VIEW: Each performance appears as 2-3 consecutive lines:
   Artist Name
   Start Time [- End Time]  (e.g. "9:00PM - 9:55PM" or "11:10PM")
   STAGE NAME

2. GRID/COLUMN VIEW: Stage names appear as column headers across the top.
   Artist names appear in cells with their time ranges below them.
   OCR reads left-to-right across columns, so artists and stages may be
   interleaved. Use context clues to match each artist to their stage column.

3. Any other format a festival app might use.

Extract every distinct artist performance. For each one return:
- artist_name: the performer name (string)
- stage_name: the stage or venue name (string)
- start_time: in "HH:MM" 24-hour format. Times from 12:00AM-5:59AM should
  be represented as "24:MM" through "29:MM" to preserve correct ordering
  after midnight (e.g. 1:00AM = "25:00", 2:30AM = "26:30")
- end_time: in same format, or null if not shown
- day_label: the day of week (e.g. "Friday", "Saturday", "Sunday") or null

Rules:
- Ignore UI chrome, app headers, footers, download prompts, and branding
- Ignore "Surprise" or "TBA" placeholder entries
- If the same artist appears more than once with the same time/stage, include only once
- For grid views, carefully match each artist to the correct stage column header
- Return ONLY a valid JSON array, no markdown fences, no explanation text
- If no performances are found, return []
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


def parse_schedule_with_llm(
    raw_text: str,
    festival_days: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Parse OCR text into structured schedule entries using Claude Haiku.

    Args:
        raw_text: Raw text extracted from a screenshot via Vision API.
        festival_days: Optional list of {day_index, label} dicts from the group
                       config, used to map day names to day_index integers.

    Returns:
        List of dicts with keys: artist_name, stage_name, start_time,
        end_time (or None), day_index (int).
        Empty list if parsing fails or key not configured.
    """
    client = _get_client()
    if client is None:
        logger.warning("ANTHROPIC_API_KEY not set — skipping LLM parse")
        return []

    if not raw_text or not raw_text.strip():
        return []

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Extract all performances from this festival schedule text:\n\n{raw_text}",
                }
            ],
        )
        text = response.content[0].text.strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            logger.error(f"LLM returned non-list: {type(parsed)}")
            return []
    except json.JSONDecodeError as e:
        logger.error(f"LLM returned invalid JSON: {e}")
        return []
    except Exception as e:
        logger.error(f"LLM parse failed: {e}")
        return []

    # Build day label → day_index mapping from festival config
    day_map: dict[str, int] = {}
    if festival_days:
        for day in festival_days:
            label = day.get("label", "")
            idx = day.get("day_index", 1)
            day_map[label.upper()] = idx
            # Also map common abbreviations
            if label.upper().startswith("FRI"):
                day_map["FRI"] = idx
                day_map["FRIDAY"] = idx
            elif label.upper().startswith("SAT"):
                day_map["SAT"] = idx
                day_map["SATURDAY"] = idx
            elif label.upper().startswith("SUN"):
                day_map["SUN"] = idx
                day_map["SUNDAY"] = idx
    if not day_map:
        day_map = {"FRIDAY": 1, "FRI": 1, "SATURDAY": 2, "SAT": 2, "SUNDAY": 3, "SUN": 3}

    results = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        artist = (entry.get("artist_name") or "").strip()
        stage = (entry.get("stage_name") or "").strip()
        start = (entry.get("start_time") or "").strip()
        end = entry.get("end_time")
        if end:
            end = end.strip()

        if not artist or not stage or not start:
            continue

        # Resolve day_index from day_label
        day_label = (entry.get("day_label") or "").strip().upper()
        day_index = 1  # default
        for key, idx in day_map.items():
            if key in day_label or day_label in key:
                day_index = idx
                break

        results.append(
            {
                "artist_name": artist,
                "stage_name": stage,
                "start_time": start,
                "end_time": end,
                "day_index": day_index,
            }
        )

    logger.info(f"LLM parser extracted {len(results)} performances from {len(raw_text)} chars")
    return results
