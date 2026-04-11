"""Registry mapping preset_id → system prompt string."""

from .lecture_slide import SYSTEM_PROMPT as LECTURE_PROMPT
from .generic_screen import SYSTEM_PROMPT as GENERIC_PROMPT

PRESETS: dict[str, str] = {
    "lecture-slide": LECTURE_PROMPT,
    "generic-screen": GENERIC_PROMPT,
}
