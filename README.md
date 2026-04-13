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

> **Prerequisites:** [Node.js 20+](https://nodejs.org/) and [Python 3.12+](https://www.python.org/downloads/).

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup          # creates .env, sets up Python venv, downloads TTS models (~340 MB)
npm run dev:full       # starts everything — sidecar + Electron app
```

That’s enough for the default local workflow. A sidebar window will appear; start a session, name it, then ask questions by voice or text while Delfin watches the active window.

> **No model or Python environment yet?** Use `npm run dev:mock` instead of `dev:full` to run the Electron UI against the mock sidecar.

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
| `SIDECAR_WS_URL` | `ws://localhost:8321/ws` | On WSL2, replace `localhost` with your WSL IP if the app cannot connect |
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
| `npm run dev:full` | Starts the real FastAPI sidecar and the Electron app together |
| `npm run dev:mock` | Starts the mock sidecar and Electron app for UI development |
| `npm run dev` | Starts Electron + Vite only |
| `npm run dev:sidecar` | Starts just the real Python sidecar |

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
| `npm test` | Run Vitest unit tests |
| `npm run check:env` | Validate expected `.env` values |
| `npm run check:vad-runtime` | Verify packaged VAD/ONNX runtime files |

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

## WSL2 notes

If you’re developing inside WSL2:

- **Sidecar URL:** replace `localhost` in `SIDECAR_WS_URL` with your WSL2 IP if needed.
- **Window capture:** Electron may fall back to full-screen capture when Windows-native window enumeration is unavailable.
- **espeak-ng patching:** the Kokoro pipeline patches the baked-in espeak-ng path automatically on Linux/WSL2.

---

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — architecture, protocols, IPC channels, and coding rules
- [`docs/phases/`](docs/phases/) — phase-by-phase implementation plans
- [`STATUS.md`](STATUS.md) — current implementation status against the codebase
