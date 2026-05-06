"""Background RSS memory poller for tracking peak sidecar memory during a turn."""

import asyncio

import psutil


class MemoryPoller:
    """Poll a process's RSS in a background task and track the peak value.

    Usage::

        poller = MemoryPoller(pid)
        poller.start()
        # ... do inference ...
        peak_mb = await poller.stop()
    """

    def __init__(self, pid: int, interval: float = 0.1):
        self.pid = pid
        self.interval = interval
        self.peak_mb: float = 0.0
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._poll())

    async def stop(self) -> float:
        """Cancel the polling task and return the peak RSS in MB."""
        if self._task is not None and not self._task.done():
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        return self.peak_mb

    async def _poll(self) -> None:
        try:
            process = psutil.Process(self.pid)
            while True:
                try:
                    rss_mb = process.memory_info().rss / (1024 * 1024)
                    if rss_mb > self.peak_mb:
                        self.peak_mb = rss_mb
                except psutil.NoSuchProcess:
                    break
                await asyncio.sleep(self.interval)
        except asyncio.CancelledError:
            pass
