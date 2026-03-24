import io

import pytest
from PIL import Image

from app.core.image_utils import ImageValidationError, validate_and_compress


def _make_jpeg_bytes(width=100, height=100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(128, 64, 32)).save(buf, format="JPEG")
    return buf.getvalue()


def _make_png_bytes(width=100, height=100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def test_validate_jpeg_passes():
    result = validate_and_compress(_make_jpeg_bytes())
    assert result[:3] == b"\xff\xd8\xff"  # JPEG magic bytes


def test_validate_png_passes():
    result = validate_and_compress(_make_png_bytes())
    # Output is always JPEG after compression
    assert result[:3] == b"\xff\xd8\xff"


def test_rejects_non_image_bytes():
    with pytest.raises(ImageValidationError, match="unsupported_format"):
        validate_and_compress(b"this is not an image at all")


def test_rejects_oversized_file():
    # Build a valid JPEG header, then pad to 11 MB to exceed the 10 MB limit
    header = _make_jpeg_bytes()
    oversized = header + b"\x00" * (11 * 1024 * 1024)
    with pytest.raises(ImageValidationError, match="file_too_large"):
        validate_and_compress(oversized)


def test_resizes_large_image():
    big = _make_jpeg_bytes(width=4000, height=3000)
    result = validate_and_compress(big, max_dimension=1500)
    img = Image.open(io.BytesIO(result))
    assert max(img.size) <= 1500
