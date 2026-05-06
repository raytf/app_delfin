# Benchmark Setup Guide

This guide walks through setting up the benchmark backends and running them on
your Windows machine (WSL2 for LiteRT, native PowerShell for native backends).

---

## Overview

| Backend                 | Where to run                       | Setup command                                                                                       |
| ----------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| **LiteRT-LM**           | WSL2 Ubuntu terminal               | `npm run setup` (existing sidecar)                                                                  |
| **LiteRT-LM C++ proxy** | Native Windows PowerShell          | `npm run setup:litert-cpp` (builds bridge, installs Piper voice, copies/downloads model)            |
| **llamafile**           | Windows PowerShell or any platform | Download manually (see Part 2). `npm run setup:llamafile` was **removed** 2026-05-03.              |

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

> **Note (2026-05-03):** The `npm run setup:llamafile`, `npm run dev:llamafile`, and `npm run benchmark:llamafile` convenience scripts have been **removed**. llamafile is retained only for benchmark comparison via the Python harness. Follow the manual steps below.

### 2.1 Download the binary and model (one-time, manual)

Download llamafile and the GGUF model manually:

```powershell
# PowerShell — download llamafile 0.10.1 (example; adjust version as needed)
Invoke-WebRequest -Uri "https://github.com/mozilla-ai/llamafile/releases/download/0.10.1/llamafile-0.10.1.exe" -OutFile "llamafile\bin\llamafile-0.10.1.exe"

# Download Gemma 4 E2B GGUF model from HuggingFace (~3 GB)
# https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-IQ4_NL.gguf
```

### 2.2 Start the llamafile server

In one terminal window (keep it open):

```powershell
.\llamafile\bin\llamafile-0.10.1.exe --server --host 127.0.0.1 --port 8080 --ctx-size 8192 --no-mmap -m llamafile\models\google_gemma-4-E2B-it-IQ4_NL.gguf
```

Wait for the message: `llama server listening at http://127.0.0.1:8080`

Model loading typically takes 15–60 seconds on first run.

### 2.3 Find the llamafile PID (for memory tracking)

```powershell
# Windows PowerShell
Get-Process llamafile | Select-Object Id, Name
```

Note the PID — pass it via `--sidecar-pid`.

### 2.4 Run the benchmark

```bash
python scripts/benchmark/run.py --backend llamafile --llamafile-host localhost:8080 --sidecar-pid <PID_FROM_STEP_2.3> --runs 5 --scenarios s1,s2,s3
```

Results are written to `results/benchmark-llamafile-<platform>-gemma-4-e2b-IQ4_NL-<timestamp>.json`
and appended to `results/summary-<date>.csv`.

---

## Part 3 — LiteRT-LM C++ proxy benchmark (research)

The LiteRT C++ benchmark talks to the same Delfin sidecar WebSocket protocol as
the Python sidecar. Start `scripts/litert-cpp-proxy.mjs` first; it expects
`LITERT_CPP_BIN` to point at a JSONL/stdio bridge built on top of the LiteRT-LM
C++ Conversation API. The upstream `litert_lm_main` demo binary is useful for
build smoke tests but is not a drop-in Delfin bridge by itself.

```powershell
$Env:LITERT_CPP_BIN = "D:\path\to\delfin_litert_bridge.exe"
$Env:LITERT_CPP_MODEL = "D:\path\to\gemma-4-E2B-it.litertlm"
npm run dev:litert-cpp
```

In another terminal:

```powershell
npm run benchmark:litert-cpp
```

Current native C++ bridge status: text-only scenarios are validated, but S2
vision is blocked until `delfin_litert_bridge.exe` translates Delfin's base64
image blobs into LiteRT-LM C++ image inputs. Until that lands, run only S1/S3:

```powershell
node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s3'
```

To pass extra flags:

```powershell
node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios s1,s2,s3
```

Results are written to `results/benchmark-litert-cpp-<platform>-gemma-4-e2b-litert-cpp-<timestamp>.json`
and appended to `results/summary-<date>.csv`.

---

## Part 4 — Auto-launch mode (optional)

Instead of starting the llamafile server manually, the benchmark can manage the server process itself. In auto-launch mode `--sidecar-pid` is unnecessary — the benchmark tracks the spawned process's PID automatically.

```bash
python scripts/benchmark/run.py \
  --backend llamafile \
  --llamafile-bin llamafile/bin/llamafile-0.10.1.exe \
  --llamafile-model llamafile/models/google_gemma-4-E2B-it-IQ4_NL.gguf \
  --runs 5 \
  --scenarios s1,s2,s3
```

On Linux/macOS, omit the `.exe` extension from the binary name.

---

## Part 5 — Reading the results

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

> **Note (2026-05-03):** `npm run setup:llamafile`, `npm run dev:llamafile`, and `npm run benchmark:llamafile` have been **removed**. Use the Python harness directly for llamafile benchmarks (see Part 2).

| Command                        | Equivalent                             |
| ------------------------------ | -------------------------------------- |
| `npm run benchmark:litert`     | `run.py --backend litert --runs 5`     |
| `npm run benchmark:litert-cpp` | `run.py --backend litert-cpp --runs 5` |
| llamafile (manual)             | See Part 2 — run `run.py --backend llamafile --llamafile-host localhost:8080 ...` directly |

---

## Troubleshooting

| Symptom                                                  | Fix                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Backend unreachable`                                    | Check the server is running; confirm host:port matches                               |
| `Binary not found`                                       | Download the llamafile binary manually (see Part 2.1)                                |
| `Model not found`                                        | Download the GGUF model manually (see Part 2.1)                                      |
| `Raw litert_lm_main is not yet a drop-in Delfin sidecar` | Point `LITERT_CPP_BIN` at the Delfin JSONL bridge, not the upstream demo CLI         |
| Slow download (~3 GB)                                    | Normal for first run; script resumes if interrupted (atomic .part file)              |
| Gemma 4 not supported                                    | The llamafile binary version is too old — download a newer release manually          |
| RSS shows N/A                                            | Pass `--sidecar-pid` with the correct PID                                            |
| Very low tok/s on Windows                                | Expected for CPU inference; check no other heavy process is running                  |
| S2 vision scenario fails with llamafile                  | Ensure the GGUF model includes the vision encoder (multimodal GGUF)                  |
| S2 vision scenario fails with LiteRT C++                 | Expected until C++ bridge image/blob support lands; use `--scenarios 's1,s3'`        |
| Port conflict on 8080                                    | Set `LLAMAFILE_PORT=<other>` in `.env` and pass `--llamafile-host localhost:<other>` |
