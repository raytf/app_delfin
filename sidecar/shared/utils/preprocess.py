"""Image preprocessing: resize base64 blobs to MAX_IMAGE_WIDTH, no disk I/O."""

from __future__ import annotations

import base64
import io

from PIL import Image

from sidecar.config import load_config


def resize_image_blob(b64_str: str) -> str:
    """Resize a base64-encoded image to at most MAX_IMAGE_WIDTH pixels wide."""
    max_width = load_config().inference.max_image_width

    image_bytes = base64.b64decode(b64_str)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    if img.width > max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")
