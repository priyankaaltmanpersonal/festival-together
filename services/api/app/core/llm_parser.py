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
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_VISION_PROMPT = """\
You are extracting a user's selected festival performances from a mobile app screenshot.

The screenshot is one of two types:
1. PERSONAL LIST VIEW: Shows only the artists the user has saved/starred. All visible artists are the user's picks. Extract all of them.
2. FULL GRID WITH HIGHLIGHTS: Shows the complete festival schedule across all stages with time columns. The user's selected artists appear in highlighted, darkened, or visually distinct cells (darker background, different color, bold). Extract ONLY the highlighted/selected artists — ignore all others.

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


def parse_schedule_from_image(
    image_bytes: bytes,
    day_label: str,
    festival_days: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Parse a festival schedule screenshot using Claude vision.

    Handles both personal list-view screenshots and full grid screenshots
    with visual highlighting. Returns only the user's selected artists.

    Args:
        image_bytes: Compressed JPEG bytes from validate_and_compress.
        day_label: Which day this screenshot covers, e.g. "Friday".
                   If empty, defaults to festival_days[0].label.
        festival_days: List of {day_index, label} dicts from group config.

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

    prompt = _VISION_PROMPT.format(
        festival_days_json=json.dumps(festival_days),
        day_label=effective_day_label,
    )

    image_b64 = base64.standard_b64encode(image_bytes).decode()

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
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
        text = response.content[0].text.strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            logger.error(f"Vision parser returned non-list: {type(parsed)}")
            return []
    except json.JSONDecodeError as e:
        logger.error(f"Vision parser returned invalid JSON: {e}")
        return []
    except Exception as e:
        logger.error(f"Vision parse failed: {e}")
        return []

    # Build day_label → day_index map
    day_map: dict[str, int] = {}
    for day in festival_days:
        label = day.get("label", "")
        idx = day.get("day_index", 1)
        day_map[label.upper()] = idx

    default_day_index = (
        day_map.get(effective_day_label.upper(), festival_days[0]["day_index"])
        if festival_days else 1
    )

    results = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        artist = (entry.get("artist_name") or "").strip()
        stage = (entry.get("stage_name") or "").strip()
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

    logger.info(f"parse_schedule_from_image returned {len(results)} sets")
    return results
