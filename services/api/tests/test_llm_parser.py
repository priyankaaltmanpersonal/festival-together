import base64
import io
from unittest.mock import MagicMock, patch

from PIL import Image

from app.core.llm_parser import parse_official_lineup_from_image, parse_schedule_from_image


def _make_test_image_bytes() -> bytes:
    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


FESTIVAL_DAYS = [{"day_index": 1, "label": "Friday"}, {"day_index": 2, "label": "Saturday"}]

MOCK_RESPONSE_JSON = '[{"artist_name":"Lady Gaga","stage_name":"Main Stage","start_time":"23:10","end_time":"24:10","day_index":1}]'


def test_parse_schedule_from_image_returns_structured_sets():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=MOCK_RESPONSE_JSON)]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    assert len(result) == 1
    assert result[0]["artist_name"] == "Lady Gaga"
    assert result[0]["day_index"] == 1


def test_parse_schedule_from_image_uses_image_block():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text="[]")]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    call_args = mock_client.messages.create.call_args
    messages = call_args.kwargs["messages"]
    content = messages[0]["content"]
    image_blocks = [b for b in content if isinstance(b, dict) and b.get("type") == "image"]
    assert len(image_blocks) == 1


def test_parse_schedule_from_image_defaults_day_label_to_first_day():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text='[{"artist_name":"Test","stage_name":"Stage","start_time":"20:00","end_time":null,"day_index":1}]')]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "", FESTIVAL_DAYS)
    assert result[0]["day_index"] == 1


def test_parse_schedule_from_image_no_api_key_returns_empty():
    with patch("app.core.llm_parser._get_client", return_value=None):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    assert result == []


def test_parse_schedule_from_image_handles_malformed_json():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text="```json\n[{\"artist_name\": \"Lady Gaga\"}]\n```")]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    assert result == []


def test_parse_schedule_from_image_includes_hints_in_prompt():
    """canonical_hints should appear in the text block sent to the vision model."""
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="[]")])
    hints = [
        {"artist_name": "Bad Bunny", "stage_name": "Sahara", "start_time_pt": "21:00", "end_time_pt": "22:30"},
    ]
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS, canonical_hints=hints)
    call_args = mock_client.messages.create.call_args
    messages = call_args.kwargs["messages"]
    text_blocks = [b for b in messages[0]["content"] if isinstance(b, dict) and b.get("type") == "text"]
    assert len(text_blocks) == 1
    prompt_text = text_blocks[0]["text"]
    assert "Bad Bunny" in prompt_text
    assert "Sahara" in prompt_text


def test_parse_schedule_from_image_no_hints_does_not_error():
    """Omitting canonical_hints (default None) should work normally."""
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="[]")])
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)
    assert result == []


# ─── parse_official_lineup_from_image ────────────────────────────────────────

OFFICIAL_LINEUP_JSON = (
    '[{"artist_name":"Kendrick Lamar","stage_name":"Coachella Stage",'
    '"start_time":"22:00","end_time":"23:30","day_index":1},'
    '{"artist_name":"Tyler the Creator","stage_name":"Sahara",'
    '"start_time":"20:00","end_time":"21:30","day_index":2}]'
)


def test_parse_official_lineup_from_image_returns_structured_sets():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=OFFICIAL_LINEUP_JSON)]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_official_lineup_from_image(_make_test_image_bytes(), FESTIVAL_DAYS)
    assert len(result) == 2
    kendrick = next(r for r in result if r["artist_name"] == "Kendrick Lamar")
    assert kendrick["stage_name"] == "Coachella Stage"
    assert kendrick["start_time"] == "22:00"
    assert kendrick["day_index"] == 1


def test_parse_official_lineup_from_image_no_api_key_returns_empty():
    with patch("app.core.llm_parser._get_client", return_value=None):
        result = parse_official_lineup_from_image(_make_test_image_bytes(), FESTIVAL_DAYS)
    assert result == []


def test_parse_official_lineup_from_image_filters_entries_missing_day_index():
    """Entries where day_index is not an int should be skipped."""
    json_with_missing_day = (
        '[{"artist_name":"Good Artist","stage_name":"Sahara","start_time":"20:00","end_time":null,"day_index":1},'
        '{"artist_name":"Bad Entry","stage_name":"Gobi","start_time":"19:00","end_time":null,"day_index":null}]'
    )
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=json_with_missing_day)]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_official_lineup_from_image(_make_test_image_bytes(), FESTIVAL_DAYS)
    assert len(result) == 1
    assert result[0]["artist_name"] == "Good Artist"


def test_parse_official_lineup_from_image_filters_entries_missing_required_fields():
    """Entries with no artist_name or start_time should be skipped."""
    json_incomplete = (
        '[{"artist_name":"","stage_name":"Sahara","start_time":"20:00","end_time":null,"day_index":1},'
        '{"artist_name":"Real Artist","stage_name":"Sahara","start_time":"21:00","end_time":null,"day_index":1}]'
    )
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=json_incomplete)]
    )
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_official_lineup_from_image(_make_test_image_bytes(), FESTIVAL_DAYS)
    assert len(result) == 1
    assert result[0]["artist_name"] == "Real Artist"


def test_parse_official_lineup_from_image_strips_markdown_fences():
    """Model wrapping JSON in ```json fences should still be parsed correctly."""
    fenced = f"```json\n{OFFICIAL_LINEUP_JSON}\n```"
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text=fenced)])
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_official_lineup_from_image(_make_test_image_bytes(), FESTIVAL_DAYS)
    assert len(result) == 2


def test_official_lineup_prompt_contains_festival_hours_context():
    """Prompt must include Coachella time-of-day context to prevent AM/PM confusion."""
    from app.core.llm_parser import _OFFICIAL_LINEUP_PROMPT
    prompt = _OFFICIAL_LINEUP_PROMPT.format(festival_days_json="[]")
    assert "12:30 PM" in prompt or "12:30pm" in prompt.lower(), \
        "Prompt must mention festival start time ~12:30 PM"
    assert "1:00 AM" in prompt or "1:00am" in prompt.lower(), \
        "Prompt must mention festival end time ~1:00 AM"
    assert "PM" in prompt, "Prompt must reference PM times explicitly"


# ── Curfew defaults ───────────────────────────────────────────────────────────

def test_curfew_defaults_fills_missing_end_time_friday():
    """Sets with no end_time on Friday should get 25:00 (1 AM curfew)."""
    from app.core.llm_parser import _apply_curfew_defaults
    days = [{"day_index": 1, "label": "Friday"}]
    entries = [{"artist_name": "A", "end_time": None, "day_index": 1}]
    result = _apply_curfew_defaults(entries, days)
    assert result[0]["end_time"] == "25:00"


def test_curfew_defaults_fills_missing_end_time_sunday():
    """Sets with no end_time on Sunday should get 24:00 (midnight curfew)."""
    from app.core.llm_parser import _apply_curfew_defaults
    days = [{"day_index": 3, "label": "Sunday"}]
    entries = [{"artist_name": "B", "end_time": None, "day_index": 3}]
    result = _apply_curfew_defaults(entries, days)
    assert result[0]["end_time"] == "24:00"


def test_curfew_defaults_does_not_override_existing_end_time():
    """Sets that already have an end_time must not be changed."""
    from app.core.llm_parser import _apply_curfew_defaults
    days = [{"day_index": 1, "label": "Friday"}]
    entries = [{"artist_name": "C", "end_time": "23:30", "day_index": 1}]
    result = _apply_curfew_defaults(entries, days)
    assert result[0]["end_time"] == "23:30"


def test_curfew_defaults_saturday_uses_1am():
    """Saturday should use the 1 AM curfew, same as Friday."""
    from app.core.llm_parser import _apply_curfew_defaults
    days = [{"day_index": 2, "label": "Saturday"}]
    entries = [{"artist_name": "D", "end_time": "", "day_index": 2}]
    result = _apply_curfew_defaults(entries, days)
    assert result[0]["end_time"] == "25:00"


def test_curfew_defaults_overrides_when_end_equals_start():
    """When the model returns end_time == start_time, treat it as missing and apply curfew."""
    from app.core.llm_parser import _apply_curfew_defaults
    days = [{"day_index": 2, "label": "Saturday"}]
    entries = [{"artist_name": "Headliner", "start_time": "23:25", "end_time": "23:25", "day_index": 2}]
    result = _apply_curfew_defaults(entries, days)
    assert result[0]["end_time"] == "25:00"


# ── _detect_anomalies ─────────────────────────────────────────────────────────

def test_detect_anomalies_before_1pm_returns_issue():
    """A set starting before 1 PM should produce an anomaly issue string."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Misparse", "stage_name": "Sahara", "start_time": "12:00", "end_time": "13:00", "day_index": 1},
    ]
    issues = _detect_anomalies(entries)
    assert len(issues) == 1
    assert "12:00" in issues[0]
    assert "1 PM" in issues[0]


def test_detect_anomalies_1pm_start_clean():
    """A set starting exactly at 13:00 should produce no anomalies."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Opener", "stage_name": "Gobi", "start_time": "13:00", "end_time": "14:00", "day_index": 1},
    ]
    assert _detect_anomalies(entries) == []


def test_detect_anomalies_over_4_hours_returns_issue():
    """A set with duration > 240 min should produce an anomaly issue string."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Marathon", "stage_name": "Sahara", "start_time": "14:00", "end_time": "19:00", "day_index": 1},
    ]
    issues = _detect_anomalies(entries)
    assert len(issues) == 1
    assert "300 min" in issues[0]


def test_detect_anomalies_exactly_4_hours_clean():
    """A set lasting exactly 4 hours should produce no anomalies."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Long Set", "stage_name": "Sahara", "start_time": "14:00", "end_time": "18:00", "day_index": 1},
    ]
    assert _detect_anomalies(entries) == []


def test_detect_anomalies_same_stage_overlap_returns_issue():
    """Two overlapping sets on the same stage+day should produce an issue."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "First", "stage_name": "Sahara", "start_time": "20:00", "end_time": "21:30", "day_index": 1},
        {"artist_name": "Overlap", "stage_name": "Sahara", "start_time": "21:00", "end_time": "22:00", "day_index": 1},
    ]
    issues = _detect_anomalies(entries)
    assert len(issues) == 1
    assert "First" in issues[0]
    assert "Overlap" in issues[0]


def test_detect_anomalies_non_overlapping_same_stage_clean():
    """Back-to-back sets on the same stage should produce no anomalies."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Set A", "stage_name": "Gobi", "start_time": "18:00", "end_time": "19:00", "day_index": 1},
        {"artist_name": "Set B", "stage_name": "Gobi", "start_time": "19:00", "end_time": "20:00", "day_index": 1},
    ]
    assert _detect_anomalies(entries) == []


def test_detect_anomalies_midnight_set_clean():
    """Extended-format midnight sets (24:00+) are after 1 PM and should not flag."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Headliner", "stage_name": "Coachella Stage", "start_time": "24:00", "end_time": "25:00", "day_index": 1},
    ]
    assert _detect_anomalies(entries) == []


def test_detect_anomalies_different_stages_overlap_clean():
    """Overlapping times on different stages are valid — no issue."""
    from app.core.llm_parser import _detect_anomalies
    entries = [
        {"artist_name": "Artist A", "stage_name": "Sahara", "start_time": "20:00", "end_time": "21:30", "day_index": 1},
        {"artist_name": "Artist B", "stage_name": "Gobi", "start_time": "20:30", "end_time": "21:30", "day_index": 1},
    ]
    assert _detect_anomalies(entries) == []


# ── Anomaly-triggered retry ────────────────────────────────────────────────────

def test_parse_schedule_retries_when_anomalies_detected():
    """When the initial parse has anomalies, the client is called a second time."""
    from unittest.mock import call

    bad_json = '[{"artist_name":"Misparse","stage_name":"Sahara","start_time":"12:00","end_time":"13:00","day_index":1}]'
    good_json = '[{"artist_name":"Misparse","stage_name":"Sahara","start_time":"24:00","end_time":"25:00","day_index":1}]'

    mock_client = MagicMock()
    mock_client.messages.create.side_effect = [
        MagicMock(content=[MagicMock(text=bad_json)]),   # first call — bad result
        MagicMock(content=[MagicMock(text=good_json)]),  # correction retry
    ]
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)

    assert mock_client.messages.create.call_count == 2
    assert result[0]["start_time"] == "24:00"


def test_parse_schedule_no_retry_when_clean():
    """When the initial parse is clean, the client is called exactly once."""
    clean_json = '[{"artist_name":"Lady Gaga","stage_name":"Main Stage","start_time":"21:00","end_time":"22:30","day_index":1}]'

    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text=clean_json)])
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_schedule_from_image(_make_test_image_bytes(), "Friday", FESTIVAL_DAYS)

    assert mock_client.messages.create.call_count == 1
    assert result[0]["artist_name"] == "Lady Gaga"


def test_parse_official_lineup_retries_when_anomalies_detected():
    """Official lineup parser also retries when anomalies are detected."""
    bad_json = '[{"artist_name":"Misparse","stage_name":"Sahara","start_time":"12:00","end_time":"13:00","day_index":1}]'
    good_json = '[{"artist_name":"Misparse","stage_name":"Sahara","start_time":"24:00","end_time":"25:00","day_index":1}]'

    mock_client = MagicMock()
    mock_client.messages.create.side_effect = [
        MagicMock(content=[MagicMock(text=bad_json)]),
        MagicMock(content=[MagicMock(text=good_json)]),
    ]
    with patch("app.core.llm_parser._get_client", return_value=mock_client):
        result = parse_official_lineup_from_image(_make_test_image_bytes(), FESTIVAL_DAYS)

    assert mock_client.messages.create.call_count == 2
    assert result[0]["start_time"] == "24:00"
