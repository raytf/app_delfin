# Benchmark Setup Guide

This guide walks through setting up both backends and running the benchmark
on your Windows machine (WSL2 for LiteRT, native PowerShell for llamafile).

---

## Overview

| Backend | Where to run | Setup command |
|---|---|---|
| **LiteRT-LM** | WSL2 Ubuntu terminal | `npm run setup` (existing sidecar) |
| **llamafile** | Windows PowerShell or any platform | `npm run setup:llamafile` |

Run each backend in its own environment, then compare the CSV output files.

---

## Part 1 — LiteRT-LM benchmark (WSL2)

### 1.1 Start the sidecar

In a WSL2 Ubuntu terminal:

```bash
cd /path/to/app_delfin
npm run dev:sidecar
```

Leave this terminal open. The sidecar listens on `0.0.0.0:8321` and is
reachable from WSL2 at `localhost:8321`.

### 1.2 Find the sidecar PID (for memory tracking)

In a second WSL2 terminal:

```bash
pgrep -f "uvicorn" -a
# or
pgrep -f "server.py" -a
```

Note the PID — pass it via `--sidecar-pid` for RSS memory tracking.

### 1.3 Run the benchmark

The npm script uses the sidecar virtualenv automatically — no separate `pip install` needed:

```bash
npm run benchmark:litert
```

To pass extra flags (e.g. `--sidecar-pid` for RSS tracking):

```bash
node scripts/run-benchmark.mjs --backend litert --sidecar-pid <PID_FROM_STEP_1.2> --runs 5
```

Results are written to `results/benchmark-litert-linux-gemma-4-e2b-litert-<timestamp>.json`
and appended to `results/summary-<date>.csv`.

---

## Part 2 — llamafile benchmark

### 2.1 Download the binary and model (one-time setup)

Run this once from the repo root — works on Windows PowerShell, macOS, and Linux:

```bash
npm run setup:llamafile
```

This downloads:
- The llamafile binary into `llamafile/bin/` (~30 MB)
- The Gemma 4 E2B GGUF model into `llamafile/models/` (~3 GB)

The script is **idempotent** — running it again skips files already present.

> **Configuring version or model:** Override via `.env` before running:
>
> ```
> LLAMAFILE_VERSION=0.10.1
> LLAMAFILE_MODEL_FILE=google_gemma-4-E2B-it-IQ4_NL.gguf
> ```
>
> See `.env.example` for all available llamafile env vars.

### 2.2 Start the llamafile server

In one terminal window (keep it open):

```bash
npm run dev:llamafile
```

This starts `llamafile --server --host 127.0.0.1 --port 8080 --ctx-size 8192 --no-mmap`.

Wait for the message: `llama server listening at http://127.0.0.1:8080`

Model loading typically takes 15–60 seconds on first run.

> **Changing the port:** Set `LLAMAFILE_PORT=<port>` in `.env` before running.

### 2.3 Find the llamafile PID (for memory tracking)

In another terminal:

```bash
# Linux / WSL2 / macOS
pgrep -f "llamafile" -a

# Windows PowerShell
Get-Process llamafile | Select-Object Id, Name
```

Note the PID — pass it via `--sidecar-pid`.

### 2.4 Run the benchmark

The npm script uses the sidecar virtualenv automatically — no separate `pip install` needed:

```bash
npm run benchmark:llamafile
```

To pass extra flags (e.g. `--sidecar-pid` for RSS tracking):

```bash
node scripts/run-benchmark.mjs --backend llamafile --sidecar-pid <PID_FROM_STEP_2.3> --runs 5
```

Results are written to `results/benchmark-llamafile-<platform>-gemma-4-e2b-IQ4_NL-<timestamp>.json`
and appended to `results/summary-<date>.csv`.

---

## Part 3 — Auto-launch mode (optional)

Instead of starting the server with `npm run dev:llamafile`, the benchmark
can manage the server process itself. In auto-launch mode `--sidecar-pid` is
unnecessary — the benchmark tracks the spawned process's PID automatically.

```bash
python scripts/benchmark/run.py \
  --backend llamafile \
  --llamafile-bin llamafile/bin/llamafile-0.10.1 \
  --llamafile-model llamafile/models/google_gemma-4-E2B-it-IQ4_NL.gguf \
  --runs 5 \
  --scenarios s1,s2,s3
```

On Windows PowerShell, replace the binary name with `llamafile-0.10.1.exe`.

---

## Part 4 — Reading the results

### Console output (during run)

```
── Scenario s1: text-only ──
  [warmup]   TTFT=430ms  22.1tok/s  total=3200ms  tokens=~64 (excluded from stats)
  [run  1]   TTFT=310ms  24.3tok/s  total=2800ms  tokens=~68
  [run  2]   TTFT=295ms  25.1tok/s  total=2750ms  tokens=~71
  ...

Summary (mean ± std, warmup excluded):
Scenario               TTFT (ms)        Tok/s          Total (ms)       RSS (MB)
──────────────────────────────────────────────────────────────────────────────────
s1: text-only          305.0±8.2        24.7±0.4       2775.0±25.1      3950.0±30.2
s2: vision-slide       890.0±15.0       21.3±0.6       4100.0±40.0      4020.0±18.5
s3: multi-turn-text    320.0±12.0       23.8±0.5       2900.0±35.0      3960.0±22.0
```

### JSON output

One file per run: `results/benchmark-<backend>-<platform>-<model>-<timestamp>.json`

Contains raw per-run data, per-turn breakdown for S3, and computed stats.

### CSV output

`results/summary-<date>.csv` — one row per backend × scenario. Run the LiteRT
benchmark and the llamafile benchmark on the same day and they land in the
same CSV file for easy side-by-side comparison in Excel or Google Sheets.

---

## npm convenience scripts

| Command | Equivalent |
|---|---|
| `npm run setup:llamafile` | Download binary + GGUF model |
| `npm run dev:llamafile` | Start llamafile server on port 8080 |
| `npm run benchmark:litert` | `run.py --backend litert --runs 5` |
| `npm run benchmark:llamafile` | `run.py --backend llamafile --runs 5` |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Backend unreachable` | Check the server is running; confirm host:port matches |
| `Binary not found` | Run `npm run setup:llamafile` first |
| `Model not found` | Run `npm run setup:llamafile` — model download may have failed |
| Slow download (~3 GB) | Normal for first run; script resumes if interrupted (atomic .part file) |
| Gemma 4 not supported | The llamafile version is too old — bump `LLAMAFILE_VERSION` in `.env` |
| RSS shows N/A | Pass `--sidecar-pid` with the correct PID |
| Very low tok/s on Windows | Expected for CPU inference; check no other heavy process is running |
| S2 vision scenario fails | Ensure the GGUF model includes the vision encoder (multimodal GGUF) |
| Port conflict on 8080 | Set `LLAMAFILE_PORT=<other>` in `.env` and pass `--llamafile-host localhost:<other>` |
