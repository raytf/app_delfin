# Inference Benchmarking Spec

> Gate 1 spec — implemented.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 approved — implemented |
| **Created** | 2026-05-01 |
| **Implemented** | 2026-05-02 |
| **Type** | Standalone developer script (no app changes) |
| **Output location** | `scripts/benchmark/` |

## Goal

Produce a standalone benchmark script that measures and compares inference performance between the existing LiteRT-LM sidecar (WSL2 Ubuntu) and the new llama-server backend (native Windows/macOS/Linux). Results are saved to structured JSON + CSV files for side-by-side comparison. This data informs the backend migration decision documented in `desktop-distribution-mvp-spec.md`.

## Background

LiteRT-LM is Google's inference engine purpose-built for Gemma 4 and reportedly more optimised than generic GGUF inference. Before committing to llama-server as the production backend, empirical data is needed to quantify the trade-off (if any) in throughput, latency, and memory usage on the same hardware.

The benchmark is designed to run on two shells on the same physical machine:
- **WSL2 Ubuntu** — LiteRT-LM sidecar via the existing `sidecar/.venv`
- **Native Windows/macOS** — llama-server binary downloaded separately

Results from each run are written to `results/` and compared manually.

## Scope

### Files created

- `scripts/benchmark/run.py` — CLI entry point
- `scripts/benchmark/backends/litert.py` — LiteRT adapter (connects to existing FastAPI WebSocket sidecar)
- `scripts/benchmark/backends/llamafile.py` — llamafile/llama-server adapter (connects to OpenAI-compatible REST API)
- `scripts/benchmark/backends/memory.py` — background RSS poller using `psutil`
- `scripts/benchmark/scenarios.py` — test scenario definitions and prompt fixtures; generates a test image with PIL if no asset is present
- `scripts/benchmark/reporter.py` — JSON + CSV result writer
- `scripts/benchmark/sysinfo.py` — platform, CPU, RAM, GPU detection
- `scripts/benchmark/SETUP.md` — setup and usage instructions
- `results/.gitkeep` — create the directory, contents gitignored

### Files modified

- `.gitignore` — added `results/*` with `!results/.gitkeep`
- `package.json` — added `benchmark:litert` and `benchmark:llamafile` npm scripts

## Out of scope

- Automated CI benchmark runs
- In-app performance display (see Future todos below)
- GPU utilisation measurement on macOS (Metal has no public Python instrumentation API)
- Profiling of Electron IPC or WebSocket framing overhead
- Benchmark of TTS pipeline (TTS latency is measured separately in the llama-server adapter once TTS is wired up)

## Metrics

| Metric | Unit | How measured |
|---|---|---|
| **Time to first token (TTFT)** | ms | Wall time from request sent → first token/chunk received |
| **Generation throughput** | tokens / sec | Output tokens ÷ (total generation time − TTFT) |
| **Total turn time** | ms | Wall time from request sent → final `done` / `[DONE]` signal |
| **Peak sidecar RSS** | MB | `psutil.Process(pid).memory_info().rss` sampled every 100 ms during generation |
| **Image encoding time** | ms | For llama-server: TTFT delta vs text-only baseline (S2 TTFT − S1 TTFT). For LiteRT: instrumented directly if sidecar exposes timing headers, otherwise same delta method. |
| **TTS first-chunk latency** | ms | Time from `done` message → first audio chunk; LiteRT sidecar only in initial cut; skip for llama adapter until TTS is wired |
| **GPU utilisation (optional)** | % average | `pynvml` on NVIDIA GPUs; field omitted on CPU-only or Apple Silicon runs |

## Test scenarios

Each scenario runs **5 repetitions** by default (configurable via `--runs N`). The **first run is treated as warmup** and excluded from statistics. Report shows mean ± std dev for all metrics.

| ID | Name | Prompt | Image | Notes |
|---|---|---|---|---|
| **S1** | Text-only | `"Briefly explain the concept of gradient descent in 2 sentences."` | None | Baseline, isolates pure generation speed |
| **S2** | Vision — static slide | `"Summarise this lecture slide in 3 bullet points."` | `assets/test-slide.png` | Measures vision overhead; same image every run |
| **S3** | Multi-turn text | 3 sequential turns sharing a conversation context | None | Each turn measured independently; tests KV cache behaviour |

## Interface contract

### CLI

```
python scripts/benchmark/run.py \
  --backend <litert|llamafile> \
  --litert-host <host:port>         # default: localhost:8321 \
  --llamafile-host <host:port>      # default: localhost:8080 \
  --llamafile-bin <path>            # auto-launch binary (optional) \
  --llamafile-model <path>          # auto-launch model path (optional) \
  --sidecar-pid <PID>               # optional: PID for RSS measurement \
  --runs <N>                        # default: 5 \
  --scenarios <s1,s2,s3>            # default: all \
  --model-name <label>              # informational, written to output \
  --output <path/to/results/>       # default: results/
```

npm convenience scripts (default 5 runs, all scenarios):

```bash
npm run benchmark:litert
npm run benchmark:llamafile
```

See `scripts/benchmark/SETUP.md` for full setup and usage instructions.

### JSON output format

`results/benchmark-{backend}-{platform}-{model}-{ISO8601}.json`

```json
{
  "meta": {
    "backend": "llama",
    "platform": "win32",
    "python_version": "3.12.4",
    "model": "gemma-4-e2b-q4_k_m",
    "runs_per_scenario": 5,
    "warmup_excluded": true,
    "timestamp": "2026-05-01T12:00:00Z",
    "system": {
      "cpu": "AMD Ryzen 9 5900X 12-Core",
      "ram_total_gb": 32,
      "gpu": "NVIDIA GeForce RTX 3080"
    }
  },
  "scenarios": {
    "s1": {
      "name": "text-only",
      "runs": [
        {
          "run_index": 1,
          "warmup": false,
          "ttft_ms": 431,
          "throughput_tokens_per_sec": 19.2,
          "total_turn_ms": 3150,
          "peak_rss_mb": 4087,
          "gpu_util_pct_avg": null
        }
      ],
      "stats": {
        "ttft_ms": { "mean": 445, "std": 18 },
        "throughput_tokens_per_sec": { "mean": 18.8, "std": 0.7 },
        "total_turn_ms": { "mean": 3200, "std": 140 },
        "peak_rss_mb": { "mean": 4100, "std": 25 },
        "gpu_util_pct_avg": null
      }
    },
    "s2": { "..." : "..." },
    "s3": { "..." : "..." }
  }
}
```

### CSV summary format

`results/benchmark-summary-{ISO8601}.csv` — one row per (backend × scenario):

```
backend,platform,model,scenario,ttft_ms_mean,ttft_ms_std,throughput_mean,throughput_std,total_turn_ms_mean,peak_rss_mb_mean
litert,linux,gemma-4-e2b,s1,310,12,24.1,0.9,2800,3950
llama,win32,gemma-4-e2b-q4_k_m,s1,445,18,18.8,0.7,3200,4100
```

## Adapter contracts

### LiteRT adapter (`backends/litert.py`)

Connects to the existing FastAPI WebSocket sidecar (`ws://host/ws`).

- Sends the existing `turn_start` → `image_data` → `prompt` message sequence
- Measures TTFT from `turn_start` send → first `chunk` message received
- Counts output tokens via whitespace-splitting of streamed chunks (approximate) or from a `usage` field if the sidecar exposes it
- Polls `psutil.Process(sidecar_pid).memory_info().rss` every 100 ms

### llamafile adapter (`backends/llamafile.py`)

Connects to llama-server's OpenAI-compatible REST API (`POST /v1/chat/completions` with `stream: true`).

- Sends SSE request and streams `data: {"choices": [{"delta": {"content": "..."}}]}` chunks
- Measures TTFT from POST → first non-empty content delta
- Reads `usage.completion_tokens` from the final `[DONE]` chunk for exact token count
- For vision (S2): encodes image as base64 and sends in the `content` array as `image_url` type

## Acceptance criteria

- [x] `python scripts/benchmark/run.py --backend litert --scenarios s1,s2,s3` completes without error on WSL2 Ubuntu with the LiteRT sidecar running
- [ ] `python scripts/benchmark/run.py --backend llamafile --scenarios s1,s2,s3` completes without error on native Windows with llamafile running
- [ ] JSON output contains all defined metrics for every completed run
- [ ] CSV summary is human-readable and opens correctly in Excel / Google Sheets
- [ ] Warmup run is labelled `"warmup": true` and excluded from stats
- [ ] Script exits with a non-zero code and a clear error message if the backend is unreachable
- [ ] `--sidecar-pid` enables RSS polling; omitting it skips RSS measurement gracefully with a warning
- [ ] Results directory is created automatically if it doesn't exist

## Risks / open questions

1. **Token counting accuracy for LiteRT**: the current sidecar streams raw text chunks with no token count. Whitespace-based approximation will slightly undercount; note this in the output metadata and accept it for comparison purposes.
2. **PID availability**: the LiteRT sidecar is typically already running when the benchmark starts. The user must pass `--sidecar-pid` manually (or look it up). A helper flag `--auto-find-pid <process-name>` is a nice-to-have.
3. **Image encoding isolation for llama-server**: llama-server does not expose per-stage timings. The S2−S1 TTFT delta is a reasonable proxy but includes prompt tokenisation variance. Document this limitation in the output JSON.
4. **Multi-turn context for llama-server**: llama-server is stateless per-request; multi-turn (S3) must send the full conversation history in each request. LiteRT maintains in-session state. The comparison is not perfectly apples-to-apples; note this in the scenario metadata.

## Future todos (app integration)

These are out of scope for this spec but should be considered when the distribution track matures:

- [ ] **Dev stats overlay**: add a collapsible "Performance" panel to the Electron renderer in development builds showing TTFT and throughput for the most recent turn
- [ ] **IPC channel `perf:last-turn-stats`**: Main → Renderer event emitted after each turn completes carrying `{ ttft_ms, throughput_tokens_per_sec, total_turn_ms, peak_rss_mb }`
- [ ] **Session metadata**: optionally attach per-turn perf stats to saved session JSON for offline analysis
- [ ] **In-app benchmark trigger**: a hidden dev keyboard shortcut (e.g. `Ctrl+Shift+B`) that launches a quick 1-run S1+S2 benchmark and writes results to the user data directory
