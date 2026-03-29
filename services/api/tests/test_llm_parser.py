import base64
import io
from unittest.mock import MagicMock, patch

from PIL import Image

from app.core.llm_parser import parse_schedule_from_image


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
