"""Text-to-speech pipeline with polymorphic backends."""

from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import sys

import numpy as np

from sidecar.config import SidecarConfig, load_config

logger = logging.getLogger(__name__)

DEFAULT_KOKORO_VOICE = "af_heart"
DEFAULT_KOKORO_SPEED = 1.1


def split_sentences(text: str) -> list[str]:
    """Split model output into speakable sentence-sized chunks."""
    collapsed = " ".join(text.split())
    if not collapsed:
        return []

    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", collapsed)]
    return [sentence for sentence in sentences if sentence]


def _is_apple_silicon() -> bool:
    return sys.platform == "darwin" and platform.machine() == "arm64"


def _patch_espeakng_data_path() -> None:
    """Fix espeakng_loader's hardcoded CI data path on Linux/WSL2."""
    if sys.platform != "linux":
        return

    try:
        import espeakng_loader
    except ImportError:
        return

    lib_path = str(espeakng_loader.get_library_path())
    data_path = str(espeakng_loader.get_data_path())

    short_path = "/tmp/espk"
    if os.path.islink(short_path):
        os.unlink(short_path)
    elif os.path.exists(short_path):
        shutil.rmtree(short_path)
    os.symlink(data_path, short_path)

    old_share = b"/home/runner/work/espeakng-loader/espeakng-loader/espeak-ng/_dynamic/share"
    with open(lib_path, "rb") as file_obj:
        binary = file_obj.read()

    if old_share not in binary:
        os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", lib_path)
        os.environ.setdefault("PHONEMIZER_ESPEAK_DATA_PATH", data_path)
        return

    new_share = b"/tmp/espk"
    padded = new_share + b"\x00" * (len(old_share) - len(new_share))
    patched = binary.replace(old_share, padded, 1)

    with open(lib_path, "wb") as file_obj:
        file_obj.write(patched)

    logger.info("Patched espeakng_loader .so: %s -> %s", old_share.decode(), short_path)
    os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", lib_path)
    os.environ.setdefault("PHONEMIZER_ESPEAK_DATA_PATH", data_path)


class TTSBackend:
    """Unified TTS backend interface."""

    sample_rate: int = 24_000

    def generate(
        self,
        text: str,
        voice: str = DEFAULT_KOKORO_VOICE,
        speed: float = DEFAULT_KOKORO_SPEED,
    ) -> np.ndarray:
        raise NotImplementedError


class MLXBackend(TTSBackend):
    """mlx-audio backend (Apple Silicon GPU via MLX)."""

    def __init__(self) -> None:
        from mlx_audio.tts.generate import load_model  # type: ignore[import-untyped]

        self._model = load_model("mlx-community/Kokoro-82M-bf16")
        self.sample_rate = self._model.sample_rate
        # Warmup: triggers pipeline init (phonemizer, spacy, etc.)
        list(self._model.generate(text="Hello", voice="af_heart", speed=1.0))

    def generate(
        self,
        text: str,
        voice: str = DEFAULT_KOKORO_VOICE,
        speed: float = DEFAULT_KOKORO_SPEED,
    ) -> np.ndarray:
        results = list(self._model.generate(text=text, voice=voice, speed=speed))
        float_pcm = np.concatenate([np.array(result.audio) for result in results])
        clipped = np.clip(float_pcm, -1.0, 1.0)
        return (clipped * 32767).astype(np.int16)


class ONNXBackend(TTSBackend):
    """kokoro-onnx backend (ONNX Runtime, CPU). Auto-downloads from HuggingFace."""

    def __init__(self, config: SidecarConfig) -> None:
        _patch_espeakng_data_path()

        model_path = (config.tts.kokoro_model_path or "").strip()
        voices_path = (config.tts.kokoro_voices_path or "").strip()

        if not model_path or not os.path.isfile(model_path):
            from huggingface_hub import hf_hub_download

            model_path = hf_hub_download("fastrtc/kokoro-onnx", "kokoro-v1.0.onnx")
            logger.info("Auto-downloaded kokoro model: %s", model_path)

        if not voices_path or not os.path.isfile(voices_path):
            from huggingface_hub import hf_hub_download

            voices_path = hf_hub_download("fastrtc/kokoro-onnx", "voices-v1.0.bin")
            logger.info("Auto-downloaded kokoro voices: %s", voices_path)

        from kokoro_onnx import Kokoro

        self._model = Kokoro(model_path=model_path, voices_path=voices_path)
        self.sample_rate = 24_000

    def generate(
        self,
        text: str,
        voice: str = DEFAULT_KOKORO_VOICE,
        speed: float = DEFAULT_KOKORO_SPEED,
    ) -> np.ndarray:
        pcm, sample_rate = self._model.create(text, voice=voice, speed=speed)
        self.sample_rate = sample_rate
        clipped = np.clip(pcm, -1.0, 1.0)
        return (clipped * 32767).astype(np.int16)


class TTSPipeline:
    """Server-side TTS pipeline."""

    def __init__(self, config: SidecarConfig | None = None) -> None:
        self._config = config or load_config()
        requested_backend = self._config.tts.backend.strip().lower()
        self.backend_name = "none"
        self._backend: TTSBackend | None = None
        self.voice = self._config.tts.kokoro_voice.strip() or DEFAULT_KOKORO_VOICE
        self.speed = self._config.tts.kokoro_speed

        if requested_backend == "kokoro":
            self._init_kokoro()
        elif requested_backend == "mlx":
            self._init_mlx()
        elif requested_backend in {"web-speech", "none", ""}:
            logger.info(
                "TTSPipeline disabled on the sidecar (backend=%s). Renderer fallback expected.",
                requested_backend or "none",
            )
        else:
            logger.warning(
                "Unknown TTS_BACKEND=%s. Falling back to renderer TTS.",
                requested_backend,
            )

    def _init_kokoro(self) -> None:
        if _is_apple_silicon():
            try:
                self._backend = MLXBackend()
                self.backend_name = "kokoro-mlx"
                logger.info("TTSPipeline initialised with MLX backend (Apple GPU).")
                self._validate()
                return
            except Exception as exc:
                logger.warning("MLX backend failed (%s), falling back to ONNX.", exc)

        try:
            self._backend = ONNXBackend(self._config)
            self.backend_name = "kokoro-onnx"
            logger.info("TTSPipeline initialised with ONNX backend (CPU).")
            self._validate()
        except Exception as exc:
            logger.warning(
                "Kokoro ONNX initialisation failed (%s). Falling back to renderer TTS.",
                exc,
            )

    def _init_mlx(self) -> None:
        """Initialise MLX backend explicitly (TTS_BACKEND=mlx)."""
        if not _is_apple_silicon():
            logger.warning(
                "TTS_BACKEND=mlx requested but not on Apple Silicon. Falling back to renderer TTS."
            )
            return
        try:
            self._backend = MLXBackend()
            self.backend_name = "kokoro-mlx"
            logger.info("TTSPipeline initialised with MLX backend (Apple GPU).")
            self._validate()
        except Exception as exc:
            logger.warning("MLX backend failed (%s). Falling back to renderer TTS.", exc)

    def _validate(self) -> None:
        """Run a quick synthesis to verify the backend works.""" 
        if self._backend is None:
            return
        test_pcm = self._backend.generate("hello", voice=self.voice, speed=self.speed)
        if len(test_pcm) == 0:
            self._backend = None
            self.backend_name = "none"
            raise RuntimeError("Validation synthesis returned empty audio.")

    @property
    def sample_rate(self) -> int:
        return self._backend.sample_rate if self._backend else 24_000

    def is_available(self) -> bool:
        return self._backend is not None

    def generate(self, text: str) -> np.ndarray:
        """Generate signed 16-bit PCM mono audio for a sentence."""
        sentence = " ".join(text.split())
        if not sentence or not self.is_available():
            return np.array([], dtype=np.int16)

        return self._backend.generate(sentence, voice=self.voice, speed=self.speed)
