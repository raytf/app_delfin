# Delfin

A live, voice-based study assistant that understands your screen context — fully local, private, and no API token costs. Powered by Gemma 4 via LiteRT-LM, running entirely on-device.

Point Delfin at any lecture slide, textbook page, or study material. Ask questions by voice or text — get plain-English explanations, summaries, and quiz questions streamed back in real time with text-to-speech readback.

**GitHub:** [github.com/raytf/app_delfin](https://github.com/raytf/app_delfin)

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

That's it. A sidebar window will appear on the right side of your screen. Open any lecture slide or study material, then click **Start Studying** and ask a question by voice or text.

> **No model or GPU?** Use `npm run dev:mock` instead of `dev:full` to run the UI against a mock sidecar — no Python, no model download needed.

---

## Setup (detailed)

The quickstart above runs `npm run setup`, which does these steps automatically:

1. **`npm run init:env`** — copies `.env.example` → `.env` (skipped if `.env` already exists)
2. **`npm run setup:sidecar`** — creates a Python 3.12 venv in `sidecar/.venv` and installs dependencies
3. **`npm run download:models`** — downloads Kokoro TTS model files (~340 MB total) into `sidecar/`
4. **`npm run check:env`** — warns about any missing `.env` keys

You only need to run `npm run setup` once. After that, just use `npm run dev:full`.

### Environment variables

The defaults work out of the box for most setups. Edit `.env` only if you need to change something:

| Variable | Default | When to change |
|---|---|---|
| `SIDECAR_WS_URL` | `ws://localhost:8321/ws` | On WSL2: replace `localhost` with your WSL IP (run `hostname -I`) |
| `LITERT_BACKEND` | `CPU` | Set to `GPU` if you have a supported GPU |
| `MODEL_REPO` | `litert-community/gemma-4-E2B-it-litert-lm` | Switch to `E4B` variant on 32 GB machines |
| `TTS_BACKEND` | `kokoro` | Set to `web-speech` to skip Kokoro model downloads |

See [`.env.example`](.env.example) for the full list with documentation.

### Manual sidecar setup (if `npm run setup:sidecar` fails)

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
| `npm run dev:full` | Starts the real sidecar + Electron app together (recommended) |
| `npm run dev:mock` | Starts a mock sidecar + Electron app — no model needed, great for UI work |
| `npm run dev` | Electron + Vite only (run your own sidecar separately) |

All commands show labelled, colour-coded output in one terminal. Press **Ctrl-C** to stop.

### Start the sidecar separately (advanced)

```bash
cd sidecar
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8321
```

Verify it is running:

```bash
curl http://localhost:8321/health
# → {"status":"ok","model_loaded":true,...}
```

### Verify your environment

```bash
bash scripts/setup-check.sh        # Linux / macOS
.\scripts\setup-check.ps1          # Windows PowerShell
```

---

## Architecture

```
Electron Renderer (React / Zustand)
        ↕  contextBridge (IPC)
Electron Main (Node.js)  ←→  WebSocket ws://localhost:8321/ws  ←→  Python FastAPI sidecar
                                                                        └── LiteRT-LM + Gemma 4 E2B
```

| Layer | Technology |
|---|---|
| Desktop framework | Electron 41+ via electron-vite |
| Renderer | React 19, TypeScript, Tailwind CSS 4 |
| State management | Zustand 5 |
| Validation | Zod 4 |
| Inference engine | LiteRT-LM (Python API) |
| Model | Gemma 4 E2B (default) or E4B (32 GB machines) |
| API server | FastAPI + uvicorn |
| TTS | kokoro-onnx (Linux/WSL2), Web Speech API (fallback) |

---

## Project structure

```
delfin/
├── src/
│   ├── main/          # Electron main process (capture, IPC, WebSocket client)
│   ├── preload/       # contextBridge bindings
│   ├── renderer/      # React app (components, Zustand stores)
│   └── shared/        # Shared TypeScript types, Zod schemas, constants
├── sidecar/           # Python FastAPI inference server
│   ├── server.py
│   ├── inference/     # LiteRT-LM engine + image pre-processing
│   ├── prompts/       # Preset prompt templates
│   ├── tts.py
│   └── requirements.txt
├── scripts/           # Dev utilities (setup, mock sidecar, env check)
├── docs/              # Architecture spec and phase implementation plans
├── .env.example       # Environment variable reference (auto-copied to .env)
└── package.json
```

---

## Development

### npm scripts reference

| Script | Description |
|---|---|
| `npm run setup` | One-time setup: init .env, Python venv, download TTS models |
| `npm run dev:full` | Start sidecar + Electron (real model) |
| `npm run dev:mock` | Start mock sidecar + Electron (no model needed) |
| `npm run dev` | Electron + Vite only |
| `npm run build` | Production build (also validates VAD runtime assets) |
| `npm test` | Run Vitest unit tests |
| `npm run check:env` | Warn about missing .env keys |

### Test the WebSocket protocol manually

```bash
npm i -g wscat
wscat -c ws://localhost:8321/ws
# Then type:
{"text": "Summarize this slide", "preset_id": "lecture-slide"}
```

### Build for production

```bash
npm run build
```

---

## WSL2 notes

If you're developing inside WSL2:

- **Sidecar URL:** Replace `localhost` in `SIDECAR_WS_URL` with your WSL2 IP address (run `hostname -I` inside WSL2).
- **Screen capture:** Electron's `desktopCapturer` cannot enumerate Windows windows from inside WSL2. Delfin falls back to full-screen capture automatically.
- **espeak-ng:** The Kokoro TTS pipeline patches the espeak-ng data path on WSL2/Linux automatically. No manual setup needed.

---

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — full architecture spec, WebSocket protocol, IPC channel table, and cross-cutting coding rules.
- [`docs/phases/`](docs/phases/) — phase-by-phase implementation plans.
