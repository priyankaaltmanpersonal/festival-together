from __future__ import annotations

import io

from PIL import Image

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG"


class ImageValidationError(ValueError):
    pass


def validate_and_compress(image_bytes: bytes, max_dimension: int = 1500) -> bytes:
    """Validate image type and size, then compress to max_dimension longest side.

    Returns JPEG bytes ready for Vision API upload.
    Raises ImageValidationError with a machine-readable code on failure.

    Size is checked before any decoding so oversized payloads are rejected
    without allocating large intermediate buffers.
    """
    if len(image_bytes) > MAX_FILE_BYTES:
        raise ImageValidationError("file_too_large")

    if not (image_bytes[:3] == _JPEG_MAGIC or image_bytes[:4] == _PNG_MAGIC):
        raise ImageValidationError("unsupported_format")

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise ImageValidationError("unreadable_image") from exc

    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()
