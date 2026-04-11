"""LiteRT-LM engine loader with CPU/GPU try-fallback and pre-warm."""

import logging
import os

from dotenv import load_dotenv
from huggingface_hub import hf_hub_download
import litert_lm

load_dotenv()

logger = logging.getLogger(__name__)


def load_engine() -> tuple[litert_lm.Engine, str]:
    """Download (if needed) and load the LiteRT-LM engine.

    Returns:
        (engine, active_backend) where active_backend is "CPU" or "GPU".
    """
    model_repo = os.environ["MODEL_REPO"]
    model_file = os.environ["MODEL_FILE"]
    requested_backend = os.environ.get("LITERT_BACKEND", "CPU").upper()
    cache_dir = os.environ.get("LITERT_CACHE_DIR", "/tmp/litert-cache")

    logger.info("Downloading model %s / %s …", model_repo, model_file)
    model_path = hf_hub_download(repo_id=model_repo, filename=model_file)
    logger.info("Model path: %s", model_path)

    backend = (
        litert_lm.Backend.GPU if requested_backend == "GPU" else litert_lm.Backend.CPU
    )

    if requested_backend == "GPU":
        try:
            logger.info("Attempting GPU backend …")
            engine = litert_lm.Engine(
                model_path,
                backend=litert_lm.Backend.GPU,
                vision_backend=litert_lm.Backend.GPU,
                audio_backend=litert_lm.Backend.CPU,
                cache_dir=cache_dir,
            )
            engine.__enter__()
            logger.info("GPU backend loaded successfully.")
            return engine, "GPU"
        except Exception as exc:
            logger.warning("GPU backend failed (%s) — falling back to CPU.", exc)

    # CPU path (default or fallback)
    engine = litert_lm.Engine(
        model_path,
        backend=litert_lm.Backend.CPU,
        vision_backend=litert_lm.Backend.CPU,
        audio_backend=litert_lm.Backend.CPU,
        cache_dir=cache_dir,
    )
    engine.__enter__()
    logger.info("CPU backend loaded successfully.")
    return engine, "CPU"


def pre_warm(engine: litert_lm.Engine) -> None:
    """Send a throwaway prompt to warm up model caches."""
    logger.info("Pre-warming engine …")
    try:
        with engine.create_conversation() as conv:
            conv.send_message("hello")
        logger.info("Pre-warm complete.")
    except Exception as exc:
        logger.warning("Pre-warm failed (non-fatal): %s", exc)
