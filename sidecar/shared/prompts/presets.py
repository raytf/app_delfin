"""Registry mapping preset_id to system prompt string."""

from sidecar.shared.prompts.generic_screen import SYSTEM_PROMPT as GENERIC_PROMPT
from sidecar.shared.prompts.lecture_slide import SYSTEM_PROMPT as LECTURE_PROMPT

PRESETS: dict[str, str] = {
    "lecture-slide": LECTURE_PROMPT,
    "generic-screen": GENERIC_PROMPT,
}
