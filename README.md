# Screen Copilot

A local, privacy-first AI desktop sidebar that captures your screen and explains what it sees — powered by Gemma 4 via LiteRT-LM, running entirely on-device with no cloud, no login, and no API costs.

**Primary demo: Lecture Slide Explainer** — point the sidebar at any lecture slide to get a plain-English summary, jargon explanations, and quiz questions, streamed in real time.

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

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 20+ | For Electron + Vite |
| Python | 3.12+ | For the FastAPI sidecar |
| pip / venv | bundled with Python | Used by the sidecar setup script |

Run the setup checker at any time to verify your environment:

```bash
bash scripts/setup-check.sh        # Linux / macOS
.\scripts\setup-check.ps1          # Windows PowerShell
```

---

## Setup

### 1. Clone and install frontend dependencies

```bash
git clone <repo-url>
cd screen-copilot
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and adjust the values for your machine. The defaults work for most setups — the only thing you may need to change is `SIDECAR_WS_URL` on WSL2 (replace `localhost` with the WSL2 IP from `hostname -I`).

Key variables:

| Variable | Default | Description |
|---|---|---|
| `MODEL_REPO` | `litert-community/gemma-4-E2B-it-litert-lm` | HuggingFace model repo |
| `MODEL_FILE` | `gemma-4-E2B-it.litertlm` | Model filename inside the repo |
| `SIDECAR_PORT` | `8321` | Port the sidecar listens on |
| `SIDECAR_WS_URL` | `ws://localhost:8321/ws` | WebSocket URL used by Electron |
| `LITERT_BACKEND` | `CPU` | Inference backend (`CPU`, `GPU`) |
| `TTS_ENABLED` | `false` | Enable text-to-speech readback |

See `.env.example` for the full list with documentation.

### 3. Set up the Python sidecar

```bash
npm run setup:sidecar
```

This creates a Python 3.12 virtual environment in `sidecar/.venv` and installs all Python dependencies. You only need to run this once (or after updating `sidecar/requirements.txt`).

To install manually:

```bash
cd sidecar
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

---

## Running the app

### Start everything (recommended)

```bash
npm run dev:full
```

This launches the Python sidecar and the Electron + Vite dev server together. Their output is labelled and colour-coded in the same terminal. Press **Ctrl-C** to stop both.

### Start Electron only (with mock sidecar)

Useful when iterating on the UI without needing the real model:

```bash
# Terminal 1 — mock sidecar (no model required)
node scripts/mock-sidecar.js

# Terminal 2 — Electron + Vite
npm run dev
```

### Start the real sidecar separately

```bash
cd sidecar
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8321
```

Verify it is running:

```bash
curl http://localhost:8321/health
# → {"status":"ok","model_loaded":true,...}
```

---

## Development

### Test the WebSocket protocol manually

```bash
# Install wscat globally if needed
npm i -g wscat

wscat -c ws://localhost:8321/ws
# Then type:
{"text": "Summarize this slide", "preset_id": "lecture-slide"}
```

### Project structure

```
screen-copilot/
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
├── scripts/           # Dev utilities (setup check, mock sidecar)
├── demo-content/      # Sample lecture slides for testing
├── docs/              # Architecture spec and phase implementation plans
├── .env.example       # Environment variable reference (copy to .env)
└── package.json
```

### Build for production

```bash
npm run build
```

---

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — full architecture spec, WebSocket protocol, IPC channel table, and cross-cutting coding rules.
- [`docs/phases/`](docs/phases/) — phase-by-phase implementation plans.
