#!/usr/bin/env python3
"""
Delfin Inference Benchmark
==========================

Measures TTFT, throughput, total turn time, and peak RSS across inference
backends. Results are written to JSON and an append-friendly CSV so runs from
different backends and devices land in the same file for comparison.

Backends:
  litert-cpp  Primary — the TypeScript sidecar (sidecar/src/) + LiteRT-LM C++
              bridge. This is the production stack.
  litert      Deprecated — the Python FastAPI sidecar (sidecar-old/). Retained
              for comparison only.
  llamafile   Comparison only — llamafile / llama-server over its OpenAI API.

Quick start — see scripts/benchmark/SETUP.md for full setup instructions.
`node scripts/run-benchmark.mjs` (and the npm scripts) auto-provision the
harness venv; invoking run.py directly requires scripts/benchmark/.venv.

litert-cpp (primary — run with `npm run dev:backend` already running):
    npm run benchmark:litert-cpp

litert (deprecated Python sidecar — run with `npm run dev:sidecar-old` running):
    npm run benchmark:litert-py

llamafile (server already running — pass args through run-benchmark.mjs):
    node scripts/run-benchmark.mjs --backend llamafile --llamafile-host localhost:8080

llamafile (auto-launch — benchmark manages the server process):
    node scripts/run-benchmark.mjs --backend llamafile \\
        --llamafile-bin C:\\tools\\llama-server.exe \\
        --llamafile-model C:\\models\\gemma-4-E2B-it-IQ4_NL.gguf
"""

from __future__ import annotations

import argparse
import asyncio
import os
import socket
import sys
from pathlib import Path

# Ensure the benchmark package root is on sys.path when run as a script
sys.path.insert(0, str(Path(__file__).parent))

# Windows terminals default to cp1252; the console output uses box-drawing
# characters, so force UTF-8 to avoid UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Delfin inference benchmark — LiteRT, LiteRT C++, and llamafile",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    p.add_argument(
        "--backend", required=True, choices=["litert", "litert-cpp", "llamafile"],
        help="Backend to benchmark: litert-cpp (primary — TypeScript sidecar + "
             "C++ bridge), litert (deprecated Python sidecar), llamafile "
             "(comparison only).",
    )

    # LiteRT options
    g_lr = p.add_argument_group("LiteRT options (--backend litert / litert-cpp)")
    g_lr.add_argument(
        "--litert-host", default="localhost:8321", metavar="HOST:PORT",
        help="Host:port of the running Delfin sidecar WebSocket server. "
             "Used by both litert and litert-cpp. Default: localhost:8321",
    )
    g_lr.add_argument(
        "--sidecar-pid", type=int, default=None, metavar="PID",
        help="PID to track for peak RSS. For litert-cpp the model memory lives "
             "in the delfin_litert_bridge child process — find it with "
             "`pgrep -f delfin_litert_bridge` (Linux/macOS) or "
             "`Get-Process delfin_litert_bridge` (PowerShell). For the "
             "deprecated Python sidecar use `pgrep -f server.py`.",
    )

    # llamafile options
    g_ll = p.add_argument_group(
        "llamafile options (--backend llamafile)",
        "Either provide --llamafile-host to connect to a running server, "
        "or --llamafile-bin [+ --llamafile-model] to auto-launch.",
    )
    g_ll.add_argument(
        "--llamafile-host", default="localhost:8080", metavar="HOST:PORT",
        help="Host:port of the llamafile/llama-server HTTP API. "
             "Default: localhost:8080",
    )
    g_ll.add_argument(
        "--llamafile-bin", default=None, metavar="PATH",
        help="Path to llamafile or llama-server binary. "
             "When provided the benchmark auto-launches and shuts down the server.",
    )
    g_ll.add_argument(
        "--llamafile-model", default=None, metavar="PATH",
        help="Path to the GGUF model file (required when auto-launching).",
    )

    # Common options
    g_c = p.add_argument_group("Common options")
    g_c.add_argument(
        "--model-name", default=None, metavar="NAME",
        help="Model label written to output files "
             "(e.g. gemma-4-e2b-litert-cpp, gemma-4-e2b-q4). For litert / "
             "litert-cpp it is derived from the MODEL_REPO env var; for "
             "llamafile from the --llamafile-model filename.",
    )
    g_c.add_argument(
        "--runs", type=int, default=5, metavar="N",
        help="Runs per scenario including warmup. Minimum 2. Default: 5 "
             "(1 warmup + 4 measured).",
    )
    g_c.add_argument(
        "--scenarios", default="s1,s2,s3", metavar="IDs",
        help="Comma-separated scenario IDs. Available: s1, s2, s3. "
             "Default: s1,s2,s3",
    )
    g_c.add_argument(
        "--output", default="results", metavar="DIR",
        help="Directory for output files. Created if absent. Default: results/",
    )
    g_c.add_argument(
        "--device-label", default=None, metavar="LABEL",
        help="Human-friendly device identifier tagged onto every result row "
             "for cross-device comparison (e.g. m1-mbp, ryzen-5800x, "
             "thinkpad-gpu). Defaults to the machine hostname.",
    )

    return p


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main(args: argparse.Namespace) -> None:
    from reporter import Reporter
    from scenarios import build_scenarios
    from sysinfo import collect_sysinfo

    if args.runs < 2:
        print("ERROR: --runs must be at least 2 (1 warmup + 1 measured).")
        sys.exit(1)

    # --- System info ---
    print("═" * 60)
    print("  Delfin Inference Benchmark")
    print("═" * 60)
    print()
    print("Collecting system info …")
    sysinfo = collect_sysinfo()
    device_label = args.device_label or socket.gethostname()
    litert_backend = os.environ.get("LITERT_BACKEND", "").strip()
    print(f"  Device   : {device_label}")
    print(f"  Platform : {sysinfo['platform']} {sysinfo.get('machine', '')}")
    print(f"  CPU      : {sysinfo['cpu']}")
    print(f"  RAM      : {sysinfo['ram_total_gb']} GB")
    print(f"  GPU      : {sysinfo.get('gpu', 'N/A')}")
    if litert_backend:
        print(f"  LiteRT   : {litert_backend}  (LITERT_BACKEND)")
    print()

    # --- Scenario setup ---
    scenario_ids = [s.strip() for s in args.scenarios.split(",") if s.strip()]
    scenarios = build_scenarios(scenario_ids)
    print(f"Scenarios : {', '.join(s.id + ' (' + s.name + ')' for s in scenarios)}")
    print(f"Runs      : {args.runs} total ({args.runs - 1} measured + 1 warmup)")
    print()

    # --- Model name ---
    model_name = args.model_name
    if model_name is None:
        if args.backend in ("litert", "litert-cpp"):
            repo = os.environ.get("MODEL_REPO", "")
            variant = "e4b" if "e4b" in repo.lower() else "e2b"
            model_name = f"gemma-4-{variant}-{args.backend}"
        elif args.llamafile_model:
            model_name = Path(args.llamafile_model).stem[:40]
        else:
            model_name = "gemma-4-e2b-llamafile"

    # --- Backend (lazy import so each backend's deps are only required when used) ---
    if args.backend == "litert":
        from backends.litert import LiteRTBackend
        backend = LiteRTBackend(
            host=args.litert_host,
            sidecar_pid=args.sidecar_pid,
        )
    elif args.backend == "litert-cpp":
        from backends.litert_cpp import LiteRTCppBackend
        backend = LiteRTCppBackend(
            host=args.litert_host,
            sidecar_pid=args.sidecar_pid,
        )
    else:
        from backends.llamafile import LlamafileBackend
        backend = LlamafileBackend(
            host=args.llamafile_host,
            bin_path=args.llamafile_bin,
            model_path=args.llamafile_model,
        )

    reporter = Reporter(
        output_dir=args.output,
        backend=args.backend,
        model_name=model_name,
        runs_per_scenario=args.runs,
        sysinfo=sysinfo,
        device_label=device_label,
        litert_backend=litert_backend,
    )

    async with backend:
        # --- Health check ---
        print(f"Connecting to {args.backend} backend at {backend.url} …")
        if not await backend.health_check():
            print()
            print(f"ERROR: Backend unreachable at {backend.url}")
            print("Make sure the server is running. See scripts/benchmark/SETUP.md")
            sys.exit(1)
        info = await backend.get_info()
        print(f"  OK — {info}")
        print()

        # --- Run scenarios ---
        for scenario in scenarios:
            print(f"── Scenario {scenario.id}: {scenario.name} ──")
            print(f"   {scenario.description}")
            print()

            all_runs: list[list[dict]] = []

            for run_i in range(1, args.runs + 1):
                is_warmup = run_i == 1
                tag = "warmup" if is_warmup else f"run {run_i - 1:>2}/{args.runs - 1}"
                print(f"  [{tag}]  ", end="", flush=True)

                turn_results = await backend.run_scenario(scenario)
                all_runs.append(turn_results)

                _print_run_line(turn_results, is_warmup)

            reporter.add_scenario(scenario.id, scenario.name, all_runs)
            print()

    # --- Output ---
    json_path, csv_path = reporter.write()
    print("Output files:")
    print(f"  JSON : {json_path}")
    print(f"  CSV  : {csv_path}")
    print()
    print("Summary (mean ± std, warmup excluded):")
    print()
    reporter.print_summary()
    print()


def _print_run_line(turn_results: list[dict], is_warmup: bool) -> None:
    """Print a compact one-line summary for a single run."""
    if len(turn_results) == 1:
        t = turn_results[0]
        warmup_note = " (excluded from stats)" if is_warmup else ""
        rss = f"  RSS={t['peak_rss_mb']}MB" if t.get("peak_rss_mb") is not None else ""
        exact = "" if t.get("token_count_exact") else "~"
        print(
            f"TTFT={t['ttft_ms']:.0f}ms  "
            f"{t['throughput_tokens_per_sec']:.1f}tok/s  "
            f"total={t['total_turn_ms']:.0f}ms  "
            f"tokens={exact}{t['output_token_count']}"
            f"{rss}{warmup_note}"
        )
    else:
        # Multi-turn: show per-turn TTFT and average throughput
        tpts = [t["throughput_tokens_per_sec"] for t in turn_results]
        avg_tps = sum(tpts) / len(tpts)
        ttfts = "  ".join(f"t{i+1}={t['ttft_ms']:.0f}ms" for i, t in enumerate(turn_results))
        warmup_note = " (excluded)" if is_warmup else ""
        print(f"{ttfts}  avg={avg_tps:.1f}tok/s{warmup_note}")


if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()
    asyncio.run(main(args))
