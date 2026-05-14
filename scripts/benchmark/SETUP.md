# Benchmark Setup Guide

The benchmark harness measures TTFT, throughput, total turn time, and peak RSS
across inference backends. It writes a JSON file per run plus an append-friendly
CSV, so runs from different backends **and different devices** land in one file
for comparison.

## Backends

| Backend      | What it measures                                         | Status          |
| ------------ | -------------------------------------------------------- | --------------- |
| `litert-cpp` | TypeScript sidecar (`sidecar/src/`) + LiteRT-LM C++ bridge | **Primary**     |
| `litert`     | Deprecated Python FastAPI sidecar (`sidecar-old/`)       | Comparison only |
| `llamafile`  | llamafile / llama-server over its OpenAI-compatible API  | Comparison only |

## The harness venv

`node scripts/run-benchmark.mjs` (and the `npm run benchmark:*` scripts)
auto-create a dedicated `scripts/benchmark/.venv` from
`scripts/benchmark/requirements.txt` on first run — the harness no longer
depends on the deprecated `sidecar-old/` Python environment. You only need
Python 3.10+ on PATH for that one-time bootstrap. To provision it by hand:

```bash
python -m venv scripts/benchmark/.venv
scripts/benchmark/.venv/bin/pip install -r scripts/benchmark/requirements.txt        # Unix
scripts\benchmark\.venv\Scripts\pip install -r scripts\benchmark\requirements.txt    # Windows
```

---

## Part 1 — litert-cpp benchmark (primary)

The production stack: the TypeScript sidecar driving the `delfin_litert_bridge`
C++ kernel.

### 1.1 Start the sidecar

In one terminal (keep it open):

```bash
npm run dev:backend
```

It listens on `localhost:8321` and exposes `/health` + `/ws`.

### 1.2 (Optional) Find the bridge PID for RSS tracking

Model memory lives in the `delfin_litert_bridge` C++ child process, not the
Node sidecar:

```bash
pgrep -f delfin_litert_bridge       # Linux / macOS
Get-Process delfin_litert_bridge    # Windows PowerShell
```

### 1.3 Run the benchmark

```bash
npm run benchmark:litert-cpp
```

To pass extra flags (RSS tracking, scenario subset, device label):

```bash
node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 \
  --sidecar-pid <BRIDGE_PID> --device-label my-laptop
```

Results: `results/benchmark-litert-cpp-<platform>-<model>-<timestamp>.json` plus
one appended row per scenario in `results/summary-<date>.csv`.

---

## Part 2 — Cross-device performance runbook

To compare inference performance across machines — or across CPU vs GPU on one
machine — run the same scenarios on each target and let the shared CSV collect
everything.

### What gets tagged on every row

`run-benchmark.mjs` loads `.env`, so each row in `summary-<date>.csv` carries:

| Column                                | Source                                          |
| -------------------------------------- | ----------------------------------------------- |
| `device_label`                         | `--device-label` (defaults to the hostname)     |
| `platform` / `cpu` / `ram_gb` / `gpu`  | auto-detected (`sysinfo.py`)                     |
| `litert_backend`                       | `LITERT_BACKEND` from `.env` (`CPU` / `GPU`)     |
| `model`                                | derived from `MODEL_REPO` (E2B / E4B)            |
| `backend`                              | `litert-cpp` / `litert` / `llamafile`            |

### Procedure

On **each device**, for **each config** you want to compare:

1. Set the config in `.env` — e.g. `LITERT_BACKEND=CPU` (or `GPU`), and
   `MODEL_REPO` for the model variant under test.
2. Start the sidecar: `npm run dev:backend`.
3. Run with a consistent, descriptive label:

   ```bash
   node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 \
     --device-label "m1-mbp" --scenarios s1,s2,s3
   ```

4. For the next config (e.g. `LITERT_BACKEND=GPU`), update `.env`, **restart**
   the sidecar so it picks up the change, and run again with the **same**
   `--device-label` — the `litert_backend` column keeps the rows distinct.

Keep `--runs` and `--scenarios` identical across devices so the numbers are
comparable. Collect each machine's `results/summary-<date>.csv`, concatenate
them, and pivot by `device_label` × `litert_backend` × `scenario`.

> **Tip:** the per-run JSON embeds the full `sysinfo` block (CPU model, core
> counts, RAM, GPU) under `meta.system` if you need more detail than the CSV.

### Automated sweep (one command, CPU vs GPU)

`npm run benchmark:sweep` automates the per-config loop on a single machine.
It spawns the TypeScript sidecar once per `LITERT_BACKEND` value, waits for the
model to load, benchmarks it, and tears the sidecar down before the next config
— so one command produces a full CPU-vs-GPU comparison without editing `.env`
or restarting anything by hand.

```bash
npm run benchmark:sweep                                    # CPU then GPU, defaults
npm run benchmark:sweep -- --litert-backends CPU,GPU \
  --runs 5 --scenarios s1,s2,s3 --device-label ryzen-5800x
```

The sidecar must **not** already be running — the sweep owns the sidecar
lifecycle so it can control `LITERT_BACKEND` per config. Each config's rows
land in the shared `results/summary-<date>.csv` tagged with its
`litert_backend`. A config that fails to start (e.g. `GPU` on a machine without
a supported GPU) is reported and skipped; the sweep continues.

Options: `--litert-backends`, `--runs`, `--scenarios`, `--device-label`,
`--model-name`, `--ready-timeout` (default 180s for model load). RSS is not
auto-tracked in sweep mode — use Part 1's `--sidecar-pid` against a manually
started sidecar if you need peak memory.

---

## Part 3 — litert benchmark (deprecated Python sidecar)

> The Python sidecar (`sidecar-old/`) is deprecated. Benchmark it only for
> historical comparison against the litert-cpp stack.

### 3.1 Start the deprecated sidecar

```bash
npm run dev:sidecar-old
```

Requires the Python sidecar venv — `npm run setup:sidecar` provisions
`sidecar-old/.venv`. It listens on `localhost:8321`.

### 3.2 Find the sidecar PID (optional, for RSS tracking)

```bash
pgrep -f server.py     # Linux / macOS
Get-Process python     # Windows PowerShell
```

### 3.3 Run the benchmark

```bash
npm run benchmark:litert-py
```

---

## Part 4 — llamafile benchmark (comparison only)

> **Note (2026-05-03):** The `setup:llamafile`, `dev:llamafile`, and
> `benchmark:llamafile` convenience scripts were **removed**. llamafile is
> retained only for comparison via the harness below.

### 4.1 Download the binary and model (one-time, manual)

```powershell
# PowerShell — download llamafile (example version)
Invoke-WebRequest -Uri "https://github.com/mozilla-ai/llamafile/releases/download/0.10.1/llamafile-0.10.1.exe" -OutFile "llamafile\bin\llamafile-0.10.1.exe"
# Gemma 4 E2B GGUF (~3 GB):
# https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-IQ4_NL.gguf
```

### 4.2 Connect to a running server

```powershell
.\llamafile\bin\llamafile-0.10.1.exe --server --host 127.0.0.1 --port 8080 --ctx-size 8192 --no-mmap -m llamafile\models\google_gemma-4-E2B-it-IQ4_NL.gguf
```

Then, in another terminal:

```bash
node scripts/run-benchmark.mjs --backend llamafile --llamafile-host localhost:8080 --runs 5
```

For RSS tracking, pass `--sidecar-pid` (`Get-Process llamafile`).

### 4.3 Auto-launch mode

The harness can manage the server process itself — `--sidecar-pid` is then
unnecessary:

```bash
node scripts/run-benchmark.mjs --backend llamafile \
  --llamafile-bin llamafile/bin/llamafile-0.10.1.exe \
  --llamafile-model llamafile/models/google_gemma-4-E2B-it-IQ4_NL.gguf \
  --runs 5 --scenarios s1,s2,s3
```

On Linux/macOS, omit the `.exe` extension.

---

## Reading the results

### Console output

```
── Scenario s1: text-only ──
  [warmup]   TTFT=430ms  22.1tok/s  total=3200ms  tokens=~64 (excluded from stats)
  [run  1]   TTFT=310ms  24.3tok/s  total=2800ms  tokens=~68
  ...

Summary (mean ± std, warmup excluded):
Scenario               TTFT (ms)        Tok/s          Total (ms)       RSS (MB)
─────────────────────────────────────────────────────────────────────────────────
s1: text-only          305.0±8.2        24.7±0.4       2775.0±25.1      3950.0±30.2
```

### JSON output

One file per run: `results/benchmark-<backend>-<platform>-<model>-<timestamp>.json`.
Contains raw per-run data, the per-turn breakdown for S3, computed stats, and a
`meta` block with `device_label`, `backend`, `litert_backend`, and the full
`system` (sysinfo) block.

### CSV output

`results/summary-<date>.csv` — one row per device × backend × config × scenario,
appended across runs. Columns: `device_label, backend, litert_backend,
platform, cpu, ram_gb, gpu, model, scenario, …metrics…`.

> The CSV is append-only and won't rewrite its header. If you change config or
> the harness adds columns mid-day, delete that day's `summary-*.csv` first.

---

## npm convenience scripts

| Command                        | Equivalent                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| `npm run benchmark:litert-cpp` | `run-benchmark.mjs --backend litert-cpp --runs 5`           |
| `npm run benchmark:litert-py`  | `run-benchmark.mjs --backend litert --runs 5`               |
| `npm run benchmark:sweep`      | `benchmark-sweep.mjs` — auto-sweep `LITERT_BACKEND` (Part 2) |
| llamafile / custom flags       | `node scripts/run-benchmark.mjs --backend … `               |

`run-benchmark.mjs` auto-provisions `scripts/benchmark/.venv` and loads `.env`.

---

## Troubleshooting

| Symptom                                       | Fix                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `Backend unreachable`                         | Confirm the sidecar/server is running and `--litert-host` matches          |
| `Sidecar error: sessionId is required`        | The `bin/` bridge binary is **stale** (pre-refactor). Rebuild it: `npm run download:bridge:windows` or `npm run bridge:build`. The new bridge uses `conversationId`. |
| Benchmark venv fails to bootstrap             | Ensure Python 3.10+ is on PATH, then retry `npm run benchmark:litert-cpp`   |
| Sweep: `A backend is already responding`      | Stop your running sidecar — the sweep manages its own                      |
| Sweep: `sidecar did not become ready`         | Model load exceeded `--ready-timeout`; raise it, or check the dumped log    |
| `RSS shows N/A`                               | Pass `--sidecar-pid` (for litert-cpp, the `delfin_litert_bridge` PID)       |
| `litert_backend` column is blank              | `LITERT_BACKEND` is unset in `.env` — set `CPU` or `GPU`                    |
| Mismatched CSV columns mid-day                | Delete that day's `results/summary-*.csv`; it is append-only               |
| Very low tok/s on Windows                     | Expected for CPU inference; close other heavy processes                    |
| `Binary not found` (llamafile)                | Download the binary manually (Part 4.1)                                    |
| Port conflict on 8080                         | Pass `--llamafile-host localhost:<other>`                                  |
