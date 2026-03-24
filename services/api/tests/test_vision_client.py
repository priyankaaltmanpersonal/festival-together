from unittest.mock import MagicMock, patch

from app.core.vision_client import extract_text_from_image


def test_extract_text_returns_none_without_api_key(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "")
    result = extract_text_from_image(b"\xff\xd8\xff" + b"\x00" * 10)
    assert result is None


def test_extract_text_calls_vision_api_and_returns_text(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "responses": [
            {
                "textAnnotations": [
                    {"description": "DAY 1\nArtist Name | Stage | 12:00 PM - 1:00 PM"}
                ]
            }
        ]
    }
    with patch("app.core.vision_client.httpx.post", return_value=mock_response) as mock_post:
        result = extract_text_from_image(b"\x89PNG\x00" * 10)

    assert result == "DAY 1\nArtist Name | Stage | 12:00 PM - 1:00 PM"
    call_kwargs = mock_post.call_args[1]
    assert "x-goog-api-key" in call_kwargs["headers"]
    assert call_kwargs["headers"]["x-goog-api-key"] == "test-key"
    # API key must NOT appear in the URL
    called_url = mock_post.call_args[0][0]
    assert "test-key" not in called_url


def test_extract_text_returns_none_on_empty_annotations(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"responses": [{}]}
    with patch("app.core.vision_client.httpx.post", return_value=mock_response):
        result = extract_text_from_image(b"\x89PNG\x00" * 10)
    assert result is None


def test_extract_text_returns_none_on_http_error(monkeypatch):
    monkeypatch.setattr("app.core.vision_client.settings.google_vision_api_key", "test-key")
    with patch("app.core.vision_client.httpx.post", side_effect=Exception("network error")):
        result = extract_text_from_image(b"\x89PNG\x00" * 10)
    assert result is None
