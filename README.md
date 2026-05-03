# Delfin — Gemma 4-Powered Local Study Assistant

A live, voice-first study assistant that understands your screen context — fully local, private, and with no API token costs. Delfin captures the foreground window, sends the screenshot plus optional voice input to **Gemma 4**, and streams explanations back inside an Electron sidebar.

Point Delfin at lecture slides, textbook pages, diagrams, or notes. Ask by voice or text, get plain-English explanations in real time, and optionally have the response read back with server-side Kokoro TTS or browser speech fallback.

**GitHub:** [github.com/raytf/app_delfin](https://github.com/raytf/app_delfin)

---

## What Delfin can do today

- Capture the current foreground window for every study turn
- Accept **voice-first** questions with always-on VAD, or typed prompts
- Stream Gemma 4 answers token-by-token over WebSocket
- Play back spoken responses with Kokoro TTS, with Web Speech fallback when server audio is unavailable
- Persist named study sessions, saved screenshots, and conversation history
- Browse, reopen, and delete past sessions from the home screen
- Run against either the real sidecar or a mock sidecar for UI work

---

## Inference backends

Delfin runs Gemma 4 locally using one of the following backends depending on your platform and development track:

| Backend           | Platforms                       | Why                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LiteRT-LM**     | macOS, Linux, Windows + WSL2    | Google's inference engine purpose-built for Gemma 4. Significantly faster than generic GGUF inference, and maintains a KV cache across conversation turns so follow-up questions are near-instant. No Windows native wheel exists — Windows users need WSL2 or the llamafile fallback. |
| **llamafile**     | Windows (no WSL2), macOS, Linux | Mozilla's single-file server based on llama.cpp. Works natively on all platforms with no Python environment required. Slower than LiteRT-LM on the same hardware, but the only practical option for Windows users who cannot or do not want to use WSL2.                               |
| **LiteRT-LM C++** | Native Windows research track (macOS/Linux planned) | Experimental path to keep LiteRT performance without WSL2. `scripts/litert-cpp-proxy.mjs`, `npm run benchmark:litert-cpp`, the native JSONL bridge source (`native/litert-cpp-bridge/`), and the per-session KV-cache + vision source fix have all landed. Pending: rebuild the Windows binary, re-run the S2 benchmark, validate the lecture-slide app round, and produce native macOS/Linux bridge builds.                                                                                       |

For the LiteRT-LM C++ path, the C++ source tree and Bazel/MSVC toolchain are needed only by developers or CI to build `delfin_litert_bridge.exe`. End users should receive a prebuilt bridge executable in the packaged app and download only the `.litertlm` model/TTS assets at first run.

---

## Setup by platform

### macOS

**Prerequisites:** [Node.js 20+](https://nodejs.org/), [Python 3.12+](https://www.python.org/downloads/)

Uses the LiteRT-LM backend — the fastest option on Apple Silicon and Intel Macs.

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup          # creates .env, sets up Python venv, downloads TTS models (~340 MB)
npm run dev:full       # starts sidecar + Electron app
```

On Apple Silicon, set `TTS_BACKEND=mlx` in `.env` for GPU-accelerated TTS. The default `kokoro` (ONNX/CPU) also works.

---

### Linux

**Prerequisites:** [Node.js 20+](https://nodejs.org/), [Python 3.12+](https://www.python.org/downloads/)

Uses the LiteRT-LM backend.

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup          # creates .env, sets up Python venv, downloads TTS models (~340 MB)
npm run dev:full       # starts sidecar + Electron app
```

---

### Windows with WSL2

**Why WSL2?** The LiteRT-LM Python wheel is only published for Linux — there is no native Windows build. Running the inference sidecar inside WSL2 Ubuntu gives you the same fast LiteRT-LM backend while Electron runs natively on Windows for full window-capture support.

**Prerequisites:**

- [WSL2](https://learn.microsoft.com/windows/wsl/install) with Ubuntu 22.04+
- [Node.js 20+](https://nodejs.org/) installed on **both** Windows and WSL2
- [Python 3.12+](https://www.python.org/downloads/) installed in WSL2

**Terminal 1 — WSL2 Ubuntu (sidecar):**

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup          # creates .env, sets up Python venv, downloads TTS models
```

The sidecar binds to `0.0.0.0` by default so Windows can reach it. If `localhost` does not resolve from Windows, find your WSL2 IP (`hostname -I`) and update `SIDECAR_WS_URL` in `.env`.

```bash
npm run dev:sidecar    # keep this terminal open
```

**Terminal 2 — Windows PowerShell (Electron):**

```powershell
cd D:\_projects\app_delfin   # or wherever you cloned it
npm install
npm run dev                  # starts Electron + Vite only (sidecar is already running in WSL2)
```

> **Why two terminals?** The Electron app needs to run on Windows to access native window enumeration for screen capture. The Python sidecar must run on Linux (WSL2) because LiteRT-LM has no Windows wheel. The two processes communicate over WebSocket — Electron on Windows connects to the sidecar listening in WSL2.

---

### Windows without WSL2

Uses the llamafile backend — a self-contained C++ inference server that runs natively on Windows with no Python required. Performance is somewhat lower than LiteRT-LM but the setup is simpler.

**Prerequisites:** [Node.js 20+](https://nodejs.org/)

```powershell
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup:llamafile   # downloads llamafile binary (~162 MB) + Gemma 4 GGUF model (~3.4 GB)
```

Then in **two terminals**:

**Terminal 1 — start the inference server:**

```powershell
npm run dev:llamafile     # starts llamafile on localhost:8080, keep open
```

**Terminal 2 — start the Electron app:**

```powershell
# Update SIDECAR_WS_URL in .env to point at llamafile:
# SIDECAR_WS_URL=ws://localhost:8080/ws   ← (bridge not yet implemented; see note below)
npm run dev
```

> **Note:** The llamafile backend integration into the Electron IPC bridge is not yet implemented. Currently llamafile is supported for benchmarking only (`npm run benchmark:llamafile`). Full app support is tracked in [`docs/features/distribution-backend-migration-spec.md`](docs/features/distribution-backend-migration-spec.md).

---

## What `npm run setup` does

1. **`npm run init:env`** — copies `.env.example` → `.env` if needed
2. **`npm run setup:sidecar`** — creates `sidecar/.venv` and installs Python dependencies (including `httpx`, `psutil` for benchmarking)
3. **`npm run download:models`** — downloads Kokoro TTS assets into `sidecar/` (~340 MB)
4. **`npm run check:env`** — warns about missing or suspicious environment values

`npm run setup:llamafile` is separate and only needed for the Windows-without-WSL2 path. It downloads the llamafile binary and the Gemma 4 GGUF model into `llamafile/bin/` and `llamafile/models/`.

---

## Environment variables

The defaults are sensible for most machines. Common settings you may want to change:

| Variable         | Default                                     | When to change                                                                                    |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `SIDECAR_WS_URL` | `ws://localhost:8321/ws`                    | On WSL2, replace `localhost` with your WSL2 IP (`hostname -I`) if the Electron app cannot connect |
| `LITERT_BACKEND` | `CPU`                                       | Set to `GPU` on supported machines (OpenCL on Linux, Metal on macOS)                              |
| `MODEL_REPO`     | `litert-community/gemma-4-E2B-it-litert-lm` | Switch to the E4B variant on 32 GB machines                                                       |
| `VOICE_ENABLED`  | `true`                                      | Disable always-on voice input if you only want text prompts                                       |
| `TTS_ENABLED`    | `true`                                      | Disable spoken playback entirely                                                                  |
| `TTS_BACKEND`    | `kokoro`                                    | Use `web-speech` for browser-only speech, or `mlx` on Apple Silicon for GPU TTS                   |

See [`.env.example`](.env.example) for the full reference including llamafile and LiteRT C++ research options.

---

## Running the app

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `npm run dev:full`       | Starts the LiteRT sidecar + Electron together (macOS / Linux / WSL2)     |
| `npm run dev:sidecar`    | Starts just the LiteRT sidecar (WSL2 terminal)                           |
| `npm run dev:llamafile`  | Starts the llamafile server on port 8080 (Windows without WSL2)          |
| `npm run dev:litert-cpp` | Starts the LiteRT C++ research proxy on the Delfin sidecar port          |
| `npm run dev:mock`       | Starts the mock sidecar + Electron (UI development, no inference)        |
| `npm run dev`            | Starts Electron + Vite only (when sidecar is already running separately) |

### Verify the sidecar is healthy

```bash
curl http://localhost:8321/health    # LiteRT sidecar
curl http://localhost:8080/health    # llamafile
```

### Verify your environment

```bash
bash scripts/setup-check.sh        # Linux / macOS / WSL2
.\scripts\setup-check.ps1          # Windows PowerShell
```

---

## Current user flow

1. Launch Delfin and enter your name the first time.
2. Start a named study session from the home screen.
3. Delfin minimizes to a compact overlay and begins listening when voice is enabled.
4. Ask a question by voice or text; the active window is captured automatically.
5. Gemma 4 streams a response back while the renderer updates the conversation live.
6. Audio playback follows when TTS is enabled.
7. Revisit past sessions later from the home screen or the full sessions page.

---

## Architecture

```text
Electron Renderer (React / Zustand)
        ↕  contextBridge (IPC)
Electron Main (Node.js)  ←→  WebSocket  ←→  Inference sidecar
                                               ├── LiteRT-LM + Gemma 4  (macOS / Linux / WSL2)
                                               ├── llamafile + GGUF      (Windows, benchmarking)
                                               └── LiteRT-LM C++ bridge  (native Windows research)
```

| Layer                       | Technology                                                    |
| --------------------------- | ------------------------------------------------------------- |
| Desktop framework           | Electron 41+ via electron-vite                                |
| Renderer                    | React 19, TypeScript, Tailwind CSS 4                          |
| State management            | Zustand 5                                                     |
| Validation                  | Zod 4                                                         |
| Inference — LiteRT path     | LiteRT-LM (Python, Linux/macOS)                               |
| Inference — llamafile path  | llamafile / llama-server (C++, all platforms)                 |
| Inference — LiteRT C++ path | Node proxy + native LiteRT-LM C++ bridge (research)           |
| Model                       | Gemma 4 E2B (default); E4B for 32 GB machines                 |
| API server                  | FastAPI + uvicorn (LiteRT) / built-in HTTP server (llamafile) |
| Voice input                 | `@ricky0123/vad-web` (Silero VAD in the renderer)             |
| TTS                         | kokoro-onnx / mlx-audio / Web Speech fallback                 |

---

## Project structure

```text
.
├── src/
│   ├── main/          # Electron main process, capture, IPC, overlay, session persistence
│   ├── preload/       # contextBridge bindings
│   ├── renderer/      # React UI, hooks, tests, stores, waveform/audio utilities
│   └── shared/        # shared TypeScript types, schemas, constants
├── sidecar/
│   ├── inference/     # LiteRT-LM engine loader + image preprocessing
│   ├── prompts/       # system prompt presets
│   ├── tests/         # sidecar unit tests
│   ├── server.py      # FastAPI app + WebSocket turn handling
│   ├── tts.py         # Kokoro / MLX / fallback TTS pipeline
│   └── requirements.txt
├── llamafile/
│   ├── bin/           # downloaded llamafile binary (gitignored)
│   └── models/        # downloaded GGUF model files (gitignored)
├── native/
│   └── litert-cpp-bridge/ # experimental LiteRT-LM C++ JSONL bridge source
├── scripts/           # setup, env checks, model downloads, benchmark runner
├── results/           # benchmark output JSON/CSV (gitignored except .gitkeep)
├── docs/              # spec, phase plans, and design notes
├── .env.example
├── README.md
└── STATUS.md
```

---

## Development

### Scripts

| Script                         | Description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `npm run setup`                | First-run setup for env, Python venv, and TTS assets (macOS / Linux / WSL2) |
| `npm run setup:llamafile`      | Download llamafile binary + GGUF model (~3.5 GB total, Windows fallback)    |
| `npm run dev:full`             | Run LiteRT sidecar + Electron together                                      |
| `npm run dev:mock`             | Run mock sidecar + Electron (no inference needed)                           |
| `npm run dev`                  | Run Electron + Vite only                                                    |
| `npm run dev:sidecar`          | Run the LiteRT sidecar only                                                 |
| `npm run dev:llamafile`        | Run the llamafile server on port 8080                                       |
| `npm run dev:litert-cpp`       | Run the LiteRT C++ research WebSocket proxy                                 |
| `npm run benchmark:litert`     | Benchmark the LiteRT sidecar (uses sidecar venv automatically)              |
| `npm run benchmark:litert-cpp` | Benchmark the LiteRT C++ proxy on the Delfin sidecar protocol               |
| `npm run benchmark:llamafile`  | Benchmark llamafile (server must be running separately)                     |
| `npm run build`                | Build the Electron app and validate VAD runtime assets                      |
| `npm test`                     | Run Vitest unit tests                                                       |
| `npm run check:env`            | Validate expected `.env` values                                             |
| `npm run check:vad-runtime`    | Verify packaged VAD/ONNX runtime files                                      |

### Tests

```bash
npm test
cd sidecar && .venv/bin/python -m unittest tests/test_tts.py
```

### Manual WebSocket check

```bash
npm i -g wscat
wscat -c ws://localhost:8321/ws
# Then type:
{"text": "Summarize this slide", "preset_id": "lecture-slide"}
```

### Production build

```bash
npm run build
```

---

## Documentation

- [`docs/README.md`](docs/README.md) — full documentation index with lifecycle status for every spec, phase, and feature doc
- [`docs/SPEC.md`](docs/SPEC.md) — architecture, protocols, IPC channels, and coding rules
- [`STATUS.md`](STATUS.md) — per-file implementation status against the codebase
