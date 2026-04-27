"""LiteRT-LM engine runtime with CPU/GPU try-fallback and pre-warm."""

from __future__ import annotations

import logging

from huggingface_hub import hf_hub_download
import litert_lm

from sidecar.config import SidecarConfig

logger = logging.getLogger(__name__)


class LiteRTInferenceRuntime:
    """Loads, warms, and closes the LiteRT-LM runtime."""

    def __init__(self, config: SidecarConfig) -> None:
        self._config = config
        self.engine: litert_lm.Engine | None = None
        self.active_backend = "CPU"

    def load(self) -> tuple[litert_lm.Engine, str]:
        """Download and load the LiteRT-LM engine."""
        logger.info("Downloading model %s / %s ...", self._config.model.repo, self._config.model.file)
        model_path = hf_hub_download(
            repo_id=self._config.model.repo,
            filename=self._config.model.file,
        )
        logger.info("Model path: %s", model_path)

        requested_backend = self._config.inference.backend.upper()

        if requested_backend == "GPU":
            try:
                logger.info("Attempting GPU backend ...")
                self.engine = litert_lm.Engine(
                    model_path,
                    backend=litert_lm.Backend.GPU,
                    vision_backend=litert_lm.Backend.GPU,
                    audio_backend=litert_lm.Backend.CPU,
                    cache_dir=self._config.inference.cache_dir,
                )
                self.engine.__enter__()
                self.active_backend = "GPU"
                logger.info("GPU backend loaded successfully.")
                return self.engine, self.active_backend
            except Exception as exc:
                logger.warning("GPU backend failed (%s) - falling back to CPU.", exc)

        self.engine = litert_lm.Engine(
            model_path,
            backend=litert_lm.Backend.CPU,
            vision_backend=litert_lm.Backend.CPU,
            audio_backend=litert_lm.Backend.CPU,
            cache_dir=self._config.inference.cache_dir,
        )
        self.engine.__enter__()
        self.active_backend = "CPU"
        logger.info("CPU backend loaded successfully.")
        return self.engine, self.active_backend

    def pre_warm(self) -> None:
        """Send a throwaway prompt to warm up model caches."""
        if self.engine is None:
            raise RuntimeError("Cannot pre-warm before the engine is loaded.")

        logger.info("Pre-warming engine ...")
        try:
            with self.engine.create_conversation() as conversation:
                conversation.send_message("hello")
            logger.info("Pre-warm complete.")
        except Exception as exc:
            logger.warning("Pre-warm failed (non-fatal): %s", exc)

    def close(self) -> None:
        """Close the engine if it was loaded."""
        if self.engine is not None:
            self.engine.__exit__(None, None, None)
