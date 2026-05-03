"""Abstract base class for inference backends."""

from abc import ABC, abstractmethod

from scenarios import Scenario


class BaseBackend(ABC):
    """Common interface for LiteRT and llamafile backends."""

    url: str  # human-readable connection string shown in status output

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the backend is reachable and the model is loaded."""

    @abstractmethod
    async def get_info(self) -> str:
        """Return a short status string (backend type, model name, etc.)."""

    @abstractmethod
    async def run_scenario(self, scenario: "Scenario") -> list[dict]:
        """Run all turns in the scenario and return a list of per-turn metric dicts.

        The first call per benchmark session is the warmup run — callers are
        responsible for excluding it from statistics; the backend itself does not
        distinguish warmup from measured runs.

        Returns:
            List of dicts, one per turn, each containing at minimum:
                ttft_ms, throughput_tokens_per_sec, total_turn_ms,
                output_token_count, peak_rss_mb (or None), output_text_preview
        """

    async def __aenter__(self) -> "BaseBackend":
        return self

    async def __aexit__(self, *_) -> None:
        pass
