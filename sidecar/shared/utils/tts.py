"""Shared helpers for incremental TTS sentence buffering."""

from __future__ import annotations

import re

from sidecar.tts.pipeline import split_sentences


def normalize_tts_text(text: str) -> str:
    """Collapse whitespace for stable incremental sentence detection."""
    return " ".join(text.split())


def drain_complete_tts_sentences(buffer: str) -> tuple[list[str], str]:
    """Return completed sentences and the remaining incomplete tail."""
    collapsed = normalize_tts_text(buffer)
    if not collapsed:
        return [], ""

    sentences = split_sentences(collapsed)
    if not sentences:
        return [], collapsed

    ends_with_sentence_punctuation = bool(re.search(r"[.!?][\"')\]]*$", collapsed))
    if ends_with_sentence_punctuation:
        return sentences, ""

    if len(sentences) == 1:
        return [], sentences[0]

    return sentences[:-1], sentences[-1]
