from __future__ import annotations

import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


def extract_text_from_image(image_bytes: bytes) -> str | None:
    """Send image bytes to Google Cloud Vision TEXT_DETECTION.

    Returns the extracted text string, or None if the API key is not
    configured, the image contains no text, or any error occurs.

    The API key is sent as a request header (x-goog-api-key) so it never
    appears in URLs, server logs, or exception messages.
    """
    if not settings.google_vision_api_key:
        return None

    try:
        payload = {
            "requests": [
                {
                    "image": {"content": base64.b64encode(image_bytes).decode()},
                    "features": [{"type": "TEXT_DETECTION", "maxResults": 1}],
                }
            ]
        }
        response = httpx.post(
            _VISION_URL,
            json=payload,
            headers={"x-goog-api-key": settings.google_vision_api_key},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        annotations = data.get("responses", [{}])[0].get("textAnnotations", [])
        if not annotations:
            logger.info("Vision API returned no text annotations for this image")
            return None
        return annotations[0].get("description")
    except Exception as exc:
        logger.warning("Vision API call failed: %s", exc)
        return None
