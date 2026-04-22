# Delfin — Gemma 4-Powered Local Study Assistant

A live, voice-first study assistant that understands your screen context — fully local, private, and with no API token costs. Delfin captures the foreground window, sends the screenshot plus optional voice input to **Gemma 4 via LiteRT-LM**, and streams explanations back inside an Electron sidebar.

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

## Quickstart

> **Prerequisites:** [Node.js 20+](https://nodejs.org/) and [Python 3.12+](https://www.python.org/downloads/). On Windows you also need [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) because the inference sidecar only runs on Linux.

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup          # creates .env, sets up Python venv, downloads TTS models (~340 MB)
```

### Default local workflow (Linux / macOS)

```bash
npm run dev:full       # starts everything — sidecar + Electron app
```

### Windows + WSL2 workflow

Because LiteRT-LM requires Linux, Windows developers run the **sidecar in WSL2** and the **Electron frontend in PowerShell**. WSL2 automatically forwards `localhost:8321` to Windows, so the frontend connects without any extra configuration.

**Terminal 1 — WSL2:**
```bash
cd app_delfin
npm run dev:sidecar    # or: cd sidecar && .venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8321
```

**Terminal 2 — Windows PowerShell:**
```powershell
cd app_delfin
npm run dev            # starts Electron + Vite only; connects to the WSL2 sidecar
```

A sidebar window will appear; start a session, name it, then ask questions by voice or text while Delfin watches the active window.

> **No model or Python environment yet?** Use `npm run dev:mock` instead to run the Electron UI against the mock sidecar.

---

## Setup details

`npm run setup` performs the full first-run setup:

1. **`npm run init:env`** — copies `.env.example` → `.env` if needed
2. **`npm run setup:sidecar`** — creates `sidecar/.venv` and installs Python dependencies
3. **`npm run download:models`** — downloads Kokoro TTS assets into `sidecar/`
4. **`npm run check:env`** — warns about missing or suspicious environment values

After that, the normal day-to-day command is just:

```bash
npm run dev:full
```

### Environment variables

The defaults are sensible for most machines. Common settings you may want to change:

| Variable | Default | When to change |
|---|---|---|
| `SIDECAR_WS_URL` | `ws://localhost:8321/ws` | WSL2 usually forwards `localhost` automatically, so this rarely needs changing |
| `LITERT_BACKEND` | `CPU` | Set to `GPU` on supported machines |
| `MODEL_REPO` | `litert-community/gemma-4-E2B-it-litert-lm` | Switch to the E4B variant on 32 GB machines |
| `VOICE_ENABLED` | `true` | Disable always-on voice input if you only want text prompts |
| `TTS_ENABLED` | `true` | Disable spoken playback entirely |
| `TTS_BACKEND` | `kokoro` | Use `web-speech` for browser-only speech output or `mlx` on Apple Silicon |
| `LITERT_AUDIO_BACKEND` | `CPU` | Currently kept on CPU in practice; documented for consistency |

See [`.env.example`](.env.example) for the full reference.

### Manual sidecar setup

If `npm run setup:sidecar` fails, you can create the venv manually:

```bash
cd sidecar
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt   # Linux / macOS
# or: .venv\Scripts\pip install -r requirements.txt   # Windows
```

---

## Running the app

| Command | What it does |
|---|---|
| `npm run dev:full` | Starts the real FastAPI sidecar and the Electron app together (Linux / macOS) |
| `npm run dev:mock` | Starts the mock sidecar and Electron app for UI development |
| `npm run dev` | Starts Electron + Vite only (use on Windows while sidecar runs in WSL2) |
| `npm run dev:sidecar` | Starts just the real Python sidecar |

### Windows + WSL2: run in two terminals

1. **WSL2 terminal** — start the sidecar:
   ```bash
   cd app_delfin
   npm run dev:sidecar
   ```
2. **PowerShell terminal** — start the Electron frontend:
   ```powershell
   cd app_delfin
   npm run dev
   ```

WSL2 automatically forwards `localhost:8321` to Windows, so the frontend connects without changing `SIDECAR_WS_URL`.

### Run the sidecar separately

```bash
cd sidecar
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8321
```

Verify it is healthy:

```bash
curl http://localhost:8321/health
```

### Verify your environment

```bash
bash scripts/setup-check.sh        # Linux / macOS
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
Electron Main (Node.js)  ←→  WebSocket ws://localhost:8321/ws  ←→  Python FastAPI sidecar
                                                                        └── LiteRT-LM + Gemma 4
```

| Layer | Technology |
|---|---|
| Desktop framework | Electron 41+ via electron-vite |
| Renderer | React 19, TypeScript, Tailwind CSS 4 |
| State management | Zustand 5 |
| Validation | Zod 4 |
| Inference engine | LiteRT-LM |
| Model | Gemma 4 E2B by default, with E4B as the larger-machine option |
| API server | FastAPI + uvicorn |
| Voice input | `@ricky0123/vad-web` (Silero VAD in the renderer) |
| TTS | kokoro-onnx / mlx-audio / Web Speech fallback |

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
├── scripts/           # setup, env checks, model downloads, sidecar runner, mock sidecar
├── docs/              # spec, phase plans, and design notes
├── .env.example
├── README.md
└── STATUS.md
```

---

## Development

### Scripts

| Script | Description |
|---|---|
| `npm run setup` | First-run setup for env, Python venv, and TTS assets |
| `npm run dev:full` | Run sidecar + Electron together |
| `npm run dev:mock` | Run mock sidecar + Electron |
| `npm run dev` | Run Electron + Vite only |
| `npm run dev:sidecar` | Run the real sidecar only |
| `npm run build` | Build the Electron app and validate VAD runtime assets |
| `npm run build:sidecar` | Freeze the Python sidecar into a standalone binary (Linux / macOS only) |
| `npm test` | Run Vitest unit tests |
| `npm run check:env` | Validate expected `.env` values |
| `npm run check:vad-runtime` | Verify packaged VAD/ONNX runtime files |
| `npm run electron:dist` | Build + freeze sidecar + package into a single installer (Linux / macOS) |
| `npm run electron:dist:win` | Build and package the Electron shell only (Windows — sidecar must be provided externally) |

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

### Packaging for distribution

| Command | Platform | What it does |
|---|---|---|
| `npm run electron:dist` | Linux / macOS | Build, freeze the sidecar, and package everything into a single installer |
| `npm run electron:dist:win` | Windows | Build and package the Electron shell **only** (skips the sidecar freeze) |

The `electron:dist` workflow bundles a frozen sidecar binary because LiteRT-LM runs natively on Linux. On Windows, the sidecar is **not bundled** — it must be provided externally. See [Packaging for Windows](#packaging-for-windows) below.

---

## Packaging for Windows

**Does every Windows user need WSL2?** Not in the packaged build — the distribution MVP spec introduces an **Ollama backend** for native Windows inference.

LiteRT-LM (the default engine) only runs on Linux and macOS. For packaged Windows builds, the sidecar switches to an Ollama HTTP backend that talks to a locally installed Ollama instance. This eliminates the WSL2 requirement for end users.

| Option | User experience | Trade-off | Status |
|---|---|---|---|
| **A. WSL2 bridge (dev)** | Run the sidecar inside WSL2, Electron on Windows host | Works today with zero code changes; requires WSL2 setup | ✅ Supported for development |
| **B. Ollama backend (packaged)** | Install Ollama on Windows, run the packaged Electron app | One-click installer after Ollama is installed; no WSL2 needed | 🚧 Spec complete — see `docs/features/desktop-distribution-mvp-spec.md` |
| **C. LiteRT-LM native Windows** | Wait for LiteRT-LM to ship Windows support | Zero backend changes when available | ❌ Blocked on upstream |

### Development workflow on Windows (Option A — WSL2)

1. Build the Electron shell on Windows (PowerShell):
   ```powershell
   npm install
   npm run electron:dist:win   # skips sidecar freeze; produces .exe installer
   ```
2. Run the sidecar in WSL2 and the frontend in PowerShell (see [Windows + WSL2 workflow](#windows--wsl2-workflow) above).

### Planned native Windows workflow (Option B — Ollama)

The `docs/features/desktop-distribution-mvp-spec.md` describes the full plan. In short:
1. The packaged sidecar on Windows uses `INFERENCE_BACKEND=ollama` and connects to `http://localhost:11434`.
2. The first-run bootstrap checks for Ollama and guides the user to install it (or run `ollama pull gemma4:e2b`) if missing.
3. The renderer-side WebSocket contract is identical — no UI changes are needed to switch backends.
4. TTS remains server-side Kokoro (ONNX) on Windows.

Until the Ollama backend is implemented, the WSL2 bridge remains the only supported development path on Windows.

---

## WSL2 notes

If you’re developing inside WSL2:

- **Sidecar URL:** WSL2 automatically forwards `localhost:8321` to Windows, so `SIDECAR_WS_URL` can usually stay as `ws://localhost:8321/ws`. If it fails, replace `localhost` with your WSL2 IP (`wsl hostname -I`).
- **Window capture:** run the Electron frontend in PowerShell (not inside WSL2) so `desktopCapturer` uses the native Windows APIs. If you run Electron inside WSL2 it may fall back to full-screen capture.
- **espeak-ng patching:** the Kokoro pipeline patches the baked-in espeak-ng path automatically on Linux/WSL2.

---

## Documentation

- [`docs/README.md`](docs/README.md) — full documentation index with lifecycle status for every spec, phase, and feature doc
- [`docs/SPEC.md`](docs/SPEC.md) — architecture, protocols, IPC channels, and coding rules
- [`STATUS.md`](STATUS.md) — per-file implementation status against the codebase
