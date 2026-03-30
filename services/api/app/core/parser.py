from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import re
from typing import Iterable, Sequence


DAY_ALIASES = {
    "DAY 1": 1,
    "FRIDAY": 1,
    "DAY 2": 2,
    "SATURDAY": 2,
    "DAY 3": 3,
    "SUNDAY": 3,
}

TIME_RANGE_RE = re.compile(
    r"(?P<start>\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(?P<end>\d{1,2}:\d{2}\s*(?:AM|PM))",
    re.IGNORECASE,
)
LINE_PATTERNS = [
    re.compile(
        r"^(?P<artist>.+?)\s*\|\s*(?P<stage>.+?)\s*\|\s*(?P<timerange>.+)$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?P<timerange>.+?)\s*\|\s*(?P<artist>.+?)\s*\|\s*(?P<stage>.+)$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?P<artist>.+?)\s*@\s*(?P<stage>.+?)\s+(?P<timerange>.+)$",
        re.IGNORECASE,
    ),
]


@dataclass
class ScreenshotInput:
    source_id: str
    raw_text: str


@dataclass
class ParsedSet:
    artist_name: str
    stage_name: str
    start_time_pt: str
    end_time_pt: str
    day_index: int
    status: str
    source_confidence: float
    source_count: int = 1


@dataclass
class ParseOutcome:
    sets: list[ParsedSet]
    unresolved_count: int


@dataclass
class PersonalMatch:
    canonical_set_id: str
    source_confidence: float


def normalize_token(value: str) -> str:
    value = value.strip().upper()
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _normalize_time(raw_value: str) -> str:
    return datetime.strptime(raw_value.upper().replace(".", ""), "%I:%M %p").strftime("%H:%M")


def _clean_line(line: str) -> str:
    line = line.replace("•", "|").replace("—", "-").replace("–", "-")
    line = re.sub(r"\s+", " ", line)
    return line.strip(" |-")


def _parse_line(line: str, day_index: int) -> ParsedSet | None:
    cleaned = _clean_line(line)
    if not cleaned:
        return None

    for pattern in LINE_PATTERNS:
        match = pattern.match(cleaned)
        if not match:
            continue

        timerange = match.group("timerange")
        time_match = TIME_RANGE_RE.search(timerange)
        if not time_match:
            continue

        artist_name = match.group("artist").strip()
        stage_name = match.group("stage").strip()
        if not artist_name or not stage_name:
            continue

        confidence = 0.62
        if "|" in cleaned:
            confidence += 0.18
        if "@" in cleaned:
            confidence += 0.08

        return ParsedSet(
            artist_name=artist_name,
            stage_name=stage_name,
            start_time_pt=_normalize_time(time_match.group("start")),
            end_time_pt=_normalize_time(time_match.group("end")),
            day_index=day_index,
            status="resolved",
            source_confidence=min(confidence, 0.98),
        )

    return None


def _merge_sets(parsed_sets: Iterable[ParsedSet]) -> ParseOutcome:
    merged: dict[tuple[str, str, str, str, int], ParsedSet] = {}
    unresolved_count = 0

    for item in parsed_sets:
        if item.status != "resolved":
            unresolved_count += 1
            continue

        key = (
            normalize_token(item.artist_name),
            normalize_token(item.stage_name),
            item.start_time_pt,
            item.end_time_pt,
            item.day_index,
        )
        existing = merged.get(key)
        if existing is None:
            merged[key] = item
            continue

        existing.source_count += 1
        existing.source_confidence = min(
            0.99,
            max(existing.source_confidence, item.source_confidence) + 0.04,
        )

    ordered_sets = sorted(
        merged.values(),
        key=lambda item: (item.day_index, item.start_time_pt, normalize_token(item.stage_name)),
    )
    return ParseOutcome(sets=ordered_sets, unresolved_count=unresolved_count)


def parse_canonical_screenshots(screenshots: Sequence[ScreenshotInput]) -> ParseOutcome:
    parsed_sets: list[ParsedSet] = []
    for screenshot in screenshots:
        day_index = 1
        for raw_line in screenshot.raw_text.splitlines():
            cleaned = _clean_line(raw_line)
            day_index = DAY_ALIASES.get(normalize_token(cleaned), day_index)
            parsed = _parse_line(cleaned, day_index)
            if parsed is not None:
                parsed_sets.append(parsed)

    return _merge_sets(parsed_sets)


def parse_personal_screenshots(
    screenshots: Sequence[ScreenshotInput],
    canonical_rows: Sequence,
) -> list[PersonalMatch]:
    canonical_index: dict[tuple[str, str, str, str, int], str] = {}
    canonical_artist_day: dict[tuple[str, int], list] = {}
    for row in canonical_rows:
        key = (
            normalize_token(row["artist_name"]),
            normalize_token(row["stage_name"]),
            row["start_time_pt"],
            row["end_time_pt"],
            row["day_index"],
        )
        canonical_index[key] = row["id"]
        canonical_artist_day.setdefault((key[0], row["day_index"]), []).append(row)

    matches: dict[str, PersonalMatch] = {}
    outcome = parse_canonical_screenshots(screenshots)
    for parsed in outcome.sets:
        key = (
            normalize_token(parsed.artist_name),
            normalize_token(parsed.stage_name),
            parsed.start_time_pt,
            parsed.end_time_pt,
            parsed.day_index,
        )
        canonical_id = canonical_index.get(key)
        confidence = parsed.source_confidence

        if canonical_id is None:
            candidates = canonical_artist_day.get((key[0], parsed.day_index), [])
            if not candidates:
                continue
            candidates = sorted(
                candidates,
                key=lambda row: (
                    row["stage_name"] != parsed.stage_name,
                    abs(_minutes(row["start_time_pt"]) - _minutes(parsed.start_time_pt)),
                ),
            )
            chosen = candidates[0]
            if abs(_minutes(chosen["start_time_pt"]) - _minutes(parsed.start_time_pt)) > 60:
                continue
            canonical_id = chosen["id"]
            confidence = min(0.9, confidence - 0.07)

        existing = matches.get(canonical_id)
        if existing is None or confidence > existing.source_confidence:
            matches[canonical_id] = PersonalMatch(
                canonical_set_id=canonical_id,
                source_confidence=round(confidence, 2),
            )

    return list(matches.values())


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def build_demo_personal_screenshots(
    canonical_rows: Sequence,
    member_id: str,
    screenshot_count: int,
) -> list[ScreenshotInput]:
    if not canonical_rows:
        return []

    seed_value = int(hashlib.sha256(member_id.encode("utf-8")).hexdigest()[:8], 16)
    desired_count = min(len(canonical_rows), max(4, min(12, screenshot_count * 2)))
    stride = 3 + (seed_value % 5)
    start_idx = seed_value % len(canonical_rows)

    selected = []
    seen = set()
    idx = start_idx
    while len(selected) < desired_count and len(seen) < len(canonical_rows):
        if idx not in seen:
            selected.append(canonical_rows[idx])
            seen.add(idx)
        idx = (idx + stride) % len(canonical_rows)

    lines = [
        f"DAY {row['day_index']}\n{row['artist_name']} | {row['stage_name']} | "
        f"{_display_time(row['start_time_pt'])} - {_display_time(row['end_time_pt'])}"
        for row in selected
    ]
    page_size = max(4, min(8, len(lines) // max(1, screenshot_count) or len(lines)))
    overlap = 1
    screenshots: list[ScreenshotInput] = []
    start_idx = 0
    for index in range(screenshot_count):
        chunk = lines[start_idx:start_idx + page_size]
        if not chunk:
            break
        screenshots.append(
            ScreenshotInput(
                source_id=f"personal-demo-{index + 1}",
                raw_text="\n".join(chunk),
            )
        )
        start_idx = min(len(lines), start_idx + max(1, page_size - overlap))
    return screenshots


def _display_time(value: str) -> str:
    return datetime.strptime(value, "%H:%M").strftime("%-I:%M %p")
