"""Benchmark result aggregation, JSON/CSV output, and console summary."""

from __future__ import annotations

import csv
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------

class Reporter:
    """Accumulates scenario results and writes JSON + CSV output files.

    The CSV is written in append mode so you can run litert and llamafile
    benchmarks separately and get a single file for side-by-side comparison.
    """

    def __init__(
        self,
        output_dir: str | Path,
        backend: str,
        model_name: str,
        runs_per_scenario: int,
        sysinfo: dict,
    ) -> None:
        self.output_dir = Path(output_dir)
        self.backend = backend
        self.model_name = model_name
        self.runs_per_scenario = runs_per_scenario
        self.sysinfo = sysinfo
        self.timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self._scenarios: dict[str, dict] = {}

    def add_scenario(
        self,
        scenario_id: str,
        scenario_name: str,
        all_runs: list[list[dict]],
    ) -> None:
        """Record results for one scenario.

        Args:
            all_runs: One entry per run. Each entry is a list of per-turn dicts.
                      The first run (index 0) is the warmup and is stored but
                      excluded from statistics.
        """
        warmup_turns = all_runs[0] if all_runs else []
        measured_runs = all_runs[1:]

        # Aggregate per-turn metrics into a single dict per run
        measured_agg = [_aggregate_turns(run_turns) for run_turns in measured_runs]
        stats = _compute_stats(measured_agg)

        # For multi-turn scenarios, also store per-turn breakdown
        per_turn_stats: list[dict] | None = None
        if measured_runs and len(measured_runs[0]) > 1:
            num_turns = len(measured_runs[0])
            per_turn_stats = []
            for t_idx in range(num_turns):
                turn_runs = [run[t_idx] for run in measured_runs if t_idx < len(run)]
                per_turn_stats.append({
                    "turn_index": t_idx + 1,
                    "turn_text_preview": (turn_runs[0].get("turn_text_preview", "") if turn_runs else ""),
                    "stats": _compute_stats(turn_runs),
                })

        self._scenarios[scenario_id] = {
            "name": scenario_name,
            "warmup": _aggregate_turns(warmup_turns),
            "runs": measured_agg,
            "stats": stats,
            **({"per_turn_stats": per_turn_stats} if per_turn_stats else {}),
        }

    def write(self) -> tuple[Path, Path]:
        """Write JSON and CSV files. Returns (json_path, csv_path)."""
        self.output_dir.mkdir(parents=True, exist_ok=True)

        platform_slug = self.sysinfo.get("platform", "unknown").lower()
        stem = f"benchmark-{self.backend}-{platform_slug}-{self.model_name}-{self.timestamp}"
        json_path = self.output_dir / f"{stem}.json"
        csv_path = self.output_dir / f"summary-{self.timestamp[:8]}.csv"  # date-only, shared across runs today

        # JSON
        output = {
            "meta": {
                "backend": self.backend,
                "model": self.model_name,
                "runs_per_scenario": self.runs_per_scenario,
                "warmup_excluded_from_stats": True,
                "timestamp": self.timestamp,
                "system": self.sysinfo,
            },
            "scenarios": self._scenarios,
        }
        json_path.write_text(json.dumps(output, indent=2, default=str))

        # CSV — append so separate backend runs land in the same file
        write_header = not csv_path.exists()
        with csv_path.open("a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if write_header:
                writer.writerow([
                    "backend", "platform", "model", "scenario",
                    "ttft_ms_mean", "ttft_ms_std",
                    "throughput_tok_s_mean", "throughput_tok_s_std",
                    "total_turn_ms_mean", "total_turn_ms_std",
                    "peak_rss_mb_mean",
                    "output_tokens_mean",
                    "n_runs",
                ])
            for sid, data in self._scenarios.items():
                s = data["stats"]
                writer.writerow([
                    self.backend,
                    self.sysinfo.get("platform", "?"),
                    self.model_name,
                    sid,
                    _fmt(s, "ttft_ms", "mean"),
                    _fmt(s, "ttft_ms", "std"),
                    _fmt(s, "throughput_tokens_per_sec", "mean"),
                    _fmt(s, "throughput_tokens_per_sec", "std"),
                    _fmt(s, "total_turn_ms", "mean"),
                    _fmt(s, "total_turn_ms", "std"),
                    _fmt(s, "peak_rss_mb", "mean"),
                    _fmt(s, "output_token_count", "mean"),
                    s.get("ttft_ms", {}).get("n", "?") if isinstance(s.get("ttft_ms"), dict) else "?",
                ])

        return json_path, csv_path

    def print_summary(self) -> None:
        """Print a human-readable summary table to stdout."""
        cols = f"{'Scenario':<22} {'TTFT (ms)':<16} {'Tok/s':<14} {'Total (ms)':<16} {'RSS (MB)':<12}"
        print(cols)
        print("─" * len(cols))
        for sid, data in self._scenarios.items():
            s = data["stats"]
            label = f"{sid}: {data['name']}"
            print(
                f"{label:<22} "
                f"{_stat_str(s.get('ttft_ms')):<16} "
                f"{_stat_str(s.get('throughput_tokens_per_sec')):<14} "
                f"{_stat_str(s.get('total_turn_ms')):<16} "
                f"{_stat_str(s.get('peak_rss_mb')):<12}"
            )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NUMERIC_KEYS = [
    "ttft_ms",
    "throughput_tokens_per_sec",
    "total_turn_ms",
    "output_token_count",
    "peak_rss_mb",
]


def _aggregate_turns(turns: list[dict]) -> dict:
    """Collapse a list of per-turn dicts into a single dict by averaging numerics."""
    if not turns:
        return {}
    if len(turns) == 1:
        return {k: v for k, v in turns[0].items() if k != "output_text_preview"}

    result: dict = {}
    for key in _NUMERIC_KEYS:
        values = [t[key] for t in turns if t.get(key) is not None]
        result[key] = round(statistics.mean(values), 2) if values else None

    # Preserve first turn's text preview for reference
    result["turn_text_preview"] = turns[0].get("turn_text_preview", "")
    return result


def _compute_stats(runs: list[dict]) -> dict:
    """Compute mean/std/min/max for each numeric metric across a list of runs."""
    if not runs:
        return {}

    stats: dict = {}
    for key in _NUMERIC_KEYS:
        values = [r[key] for r in runs if r.get(key) is not None]
        if not values:
            stats[key] = None
            continue
        mean = statistics.mean(values)
        std = statistics.stdev(values) if len(values) > 1 else 0.0
        stats[key] = {
            "mean": round(mean, 2),
            "std": round(std, 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "n": len(values),
        }
    return stats


def _fmt(stats: dict, metric: str, field: str) -> str:
    entry = stats.get(metric)
    if not isinstance(entry, dict):
        return "N/A"
    val = entry.get(field)
    return f"{val:.1f}" if val is not None else "N/A"


def _stat_str(entry: dict | None) -> str:
    if not isinstance(entry, dict):
        return "N/A"
    mean = entry.get("mean")
    std = entry.get("std")
    if mean is None:
        return "N/A"
    return f"{mean:.1f}±{std:.1f}" if std is not None else f"{mean:.1f}"
