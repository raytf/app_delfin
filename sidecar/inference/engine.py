# TODO (Phase 1): LiteRT-LM inference engine.
# Loads Gemma 4 E2B/E4B, runs tool-calling, streams tokens via asyncio.Queue.


class InferenceEngine:
    """Placeholder — implemented in Phase 1."""

    def __init__(self) -> None:
        pass

    async def infer(self, text: str, image_b64: str | None = None) -> None:
        raise NotImplementedError("InferenceEngine not yet implemented")
