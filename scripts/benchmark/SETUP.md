# Benchmark Setup Guide

This guide walks through setting up both backends and running the benchmark
on your Windows machine (WSL2 for LiteRT, native PowerShell for llamafile).

---

## Overview

| Backend | Where to run | What to install |
|---|---|---|
| **LiteRT-LM** | WSL2 Ubuntu terminal | Nothing new — use existing sidecar |
| **llamafile** | Windows PowerShell | `llama-server.exe` + GGUF model |

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

### 1.3 Install benchmark dependencies

```bash
# Inside WSL2 — you can use the sidecar venv or a separate one
source sidecar/.venv/bin/activate
pip install httpx psutil pillow   # websockets is already installed
```

### 1.4 Run the benchmark

```bash
# From the repo root, inside WSL2
python scripts/benchmark/run.py \
  --backend litert \
  --sidecar-pid <PID_FROM_STEP_1.2> \
  --runs 5 \
  --scenarios s1,s2,s3 \
  --model-name gemma-4-e2b-litert \
  --output results
```

Results are written to `results/benchmark-litert-linux-gemma-4-e2b-litert-<timestamp>.json`
and appended to `results/summary-<date>.csv`.

---

## Part 2 — llamafile benchmark (Windows PowerShell)

### 2.1 Download llama-server for Windows

llamafile and llama-server are both based on llama.cpp. Either works;
`llama-server.exe` from the official llama.cpp releases is the simplest option.

1. Go to: https://github.com/ggerganov/llama.cpp/releases/latest
2. Download the Windows CPU build: `llama-<build>-bin-win-cpu-x64.zip`
3. Extract — find `llama-server.exe` inside the `bin/` folder
4. Place it somewhere permanent, e.g. `C:\tools\llama-server.exe`

> **Tip:** For Gemma 4 support, use build **b4631 or later** (April 2026+).
> Check the release notes for "gemma4" to confirm.

**Alternative — llamafile (single universal executable):**

1. Go to: https://github.com/Mozilla-Ocho/llamafile/releases/latest
2. Download `llamafile-<version>.exe` (Windows build)
3. Place it at e.g. `C:\tools\llamafile.exe`

### 2.2 Download the Gemma 4 E2B GGUF model

In PowerShell (or your browser):

```powershell
# Using huggingface-hub CLI (pip install huggingface-hub)
huggingface-cli download ggml-org/gemma-4-E2B-it-GGUF `
  gemma-4-E2B-it-IQ4_NL.gguf `
  --local-dir C:\models
```

Or download directly from:
https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF

Recommended quantisation for benchmarking:
- `gemma-4-E2B-it-IQ4_NL.gguf` — ~3.0 GB, good quality/size trade-off
- `gemma-4-E2B-it-Q8_K.gguf`   — ~5.3 GB, near-lossless (slower download)

Use the same quantisation for both a LiteRT comparison and a llamafile run
to keep the comparison meaningful. Note that LiteRT uses its own internal
format (not GGUF), so quantisation levels are not directly equivalent.

### 2.3 Start llama-server

In one PowerShell window:

```powershell
C:\tools\llama-server.exe `
  --model C:\models\gemma-4-E2B-it-IQ4_NL.gguf `
  --host 127.0.0.1 `
  --port 8080 `
  --ctx-size 8192 `
  --no-mmap
```

Wait for the message: `llama server listening at http://127.0.0.1:8080`

Model loading typically takes 15–60 seconds on first run.

### 2.4 Install benchmark dependencies (Windows Python)

In a second PowerShell window:

```powershell
# Requires Python 3.10+ installed natively on Windows
pip install websockets httpx psutil pillow
```

### 2.5 Find the llama-server PID (for memory tracking)

```powershell
Get-Process llama-server | Select-Object Id, Name
```

Note the `Id` value — pass it via `--sidecar-pid`.

### 2.6 Run the benchmark

```powershell
# From the repo root in PowerShell
python scripts\benchmark\run.py `
  --backend llamafile `
  --llamafile-host localhost:8080 `
  --sidecar-pid <PID_FROM_STEP_2.5> `
  --runs 5 `
  --scenarios s1,s2,s3 `
  --model-name gemma-4-e2b-IQ4_NL `
  --output results
```

Results are written to `results\benchmark-llamafile-windows-gemma-4-e2b-IQ4_NL-<timestamp>.json`
and appended to `results\summary-<date>.csv`.

---

## Part 3 — Auto-launch mode (optional)

Instead of starting the server manually, the benchmark can manage it:

```powershell
python scripts\benchmark\run.py `
  --backend llamafile `
  --llamafile-bin C:\tools\llama-server.exe `
  --llamafile-model C:\models\gemma-4-E2B-it-IQ4_NL.gguf `
  --runs 5 `
  --scenarios s1,s2,s3
```

In auto-launch mode, `--sidecar-pid` is unnecessary — the benchmark tracks
the spawned process's PID automatically.

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

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Backend unreachable` | Check the server is running; confirm host:port matches |
| `llama-server` exits immediately | Wrong binary for your OS, or missing model path |
| Gemma 4 not supported | Update to llama.cpp build b4631 or later |
| RSS shows N/A | Pass `--sidecar-pid` with the correct PID |
| Very low tok/s on Windows | Expected for CPU inference; check no other heavy process is running |
| S2 vision scenario fails on llamafile | Ensure the GGUF model includes the vision encoder (multimodal GGUF) |
