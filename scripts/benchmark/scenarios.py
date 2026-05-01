"""Benchmark scenario definitions.

Each scenario is a sequence of turns. Single-turn scenarios (S1, S2) measure
one inference call. Multi-turn (S3) measures three sequential calls sharing
conversation context, so KV-cache effects are included.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

ASSETS_DIR = Path(__file__).parent / "assets"


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class Turn:
    text: str
    image_path: Path | None = None


@dataclass
class Scenario:
    id: str
    name: str
    description: str
    turns: list[Turn] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Test image generation
# ---------------------------------------------------------------------------

def _ensure_test_image() -> Path:
    """Return path to the test slide PNG, generating it on first call."""
    path = ASSETS_DIR / "test-slide.png"
    if not path.exists():
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        _generate_test_image(path)
    return path


def _generate_test_image(path: Path) -> None:
    """Generate a simple lecture-slide PNG. Uses Pillow if available,
    falls back to a minimal hand-crafted PNG."""
    try:
        from PIL import Image, ImageDraw  # type: ignore

        img = Image.new("RGB", (1280, 720), color=(240, 240, 252))
        draw = ImageDraw.Draw(img)

        # Header bar
        draw.rectangle([0, 0, 1280, 110], fill=(50, 70, 150))
        draw.text((60, 35), "Lecture 4 — Gradient Descent", fill=(255, 255, 255))

        # Body text
        lines = [
            "Definition:",
            "  An iterative optimisation algorithm that minimises a loss function",
            "  by moving parameters in the direction of the negative gradient.",
            "",
            "Update rule:   θ  ←  θ  −  η · ∇L(θ)",
            "",
            "Variants:",
            "  • Batch GD      — full dataset per step (slow, stable)",
            "  • Stochastic GD — one sample per step  (fast, noisy)",
            "  • Mini-batch GD — small batches         (best of both)",
            "",
            "Key hyperparameter:  learning rate  η",
            "  Too high → diverges.   Too low → very slow convergence.",
        ]
        y = 130
        for line in lines:
            draw.text((60, y), line, fill=(20, 20, 20))
            y += 42

        img.save(path)

    except ImportError:
        # Pillow not available — write the smallest valid white PNG
        w, h = 320, 180
        raw = b"".join(b"\x00" + b"\xff\xff\xff" * w for _ in range(h))
        compressed = zlib.compress(raw)

        def _chunk(tag: bytes, data: bytes) -> bytes:
            body = tag + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        png = (
            b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + _chunk(b"IDAT", compressed)
            + _chunk(b"IEND", b"")
        )
        path.write_bytes(png)


# ---------------------------------------------------------------------------
# Scenario catalogue
# ---------------------------------------------------------------------------

def _s2_turns() -> list[Turn]:
    return [Turn(
        text="This is a lecture slide. Summarise the key points in 3 concise bullet points.",
        image_path=_ensure_test_image(),
    )]


SCENARIOS: dict[str, Scenario] = {
    "s1": Scenario(
        id="s1",
        name="text-only",
        description=(
            "Single turn with text prompt only. Measures baseline generation "
            "throughput and TTFT with no vision overhead."
        ),
        turns=[Turn(
            text=(
                "Explain the concept of gradient descent in 3 sentences, "
                "suitable for a first-year university student."
            ),
        )],
    ),
    "s2": Scenario(
        id="s2",
        name="vision-slide",
        description=(
            "Single turn with a lecture-slide image attached. Measures vision "
            "encoding overhead on top of baseline generation."
        ),
        turns=_s2_turns(),
    ),
    "s3": Scenario(
        id="s3",
        name="multi-turn-text",
        description=(
            "Three sequential text-only turns sharing conversation context. "
            "Each turn is timed independently; KV-cache reuse effects are included."
        ),
        turns=[
            Turn(text="What is machine learning? Answer in exactly one sentence."),
            Turn(text="What are the three main types of machine learning? List them only, no explanations."),
            Turn(text="Give one real-world example of supervised learning in 2 sentences."),
        ],
    ),
}


def build_scenarios(ids: list[str]) -> list[Scenario]:
    unknown = set(ids) - set(SCENARIOS)
    if unknown:
        valid = ", ".join(sorted(SCENARIOS))
        raise ValueError(f"Unknown scenario ID(s): {sorted(unknown)}. Valid: {valid}")
    return [SCENARIOS[sid] for sid in ids]
