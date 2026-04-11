"""Unit tests for TTS fallback behavior and sentence splitting."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tts import TTSPipeline, split_sentences


class SplitSentencesTests(unittest.TestCase):
    def test_splits_punctuated_text_into_sentences(self) -> None:
        result = split_sentences("First sentence. Second sentence? Third sentence!")

        self.assertEqual(
            result,
            ["First sentence.", "Second sentence?", "Third sentence!"],
        )

    def test_collapses_whitespace_and_ignores_empty_segments(self) -> None:
        result = split_sentences("  Hello world.\n\n   Another line follows.  ")

        self.assertEqual(result, ["Hello world.", "Another line follows."])

    def test_returns_single_chunk_without_terminal_punctuation(self) -> None:
        self.assertEqual(split_sentences("Explain the slide title"), ["Explain the slide title"])


class TTSPipelineFallbackTests(unittest.TestCase):
    def test_web_speech_backend_uses_renderer_fallback(self) -> None:
        with patch.dict(os.environ, {"TTS_BACKEND": "web-speech"}, clear=False):
            pipeline = TTSPipeline()

        self.assertFalse(pipeline.is_available())
        generated = pipeline.generate("Hello there")
        self.assertEqual(generated.dtype, np.int16)
        self.assertEqual(generated.size, 0)

    def test_unknown_backend_uses_renderer_fallback(self) -> None:
        with patch.dict(os.environ, {"TTS_BACKEND": "definitely-unknown"}, clear=False):
            pipeline = TTSPipeline()

        self.assertFalse(pipeline.is_available())


if __name__ == "__main__":
    unittest.main()