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
