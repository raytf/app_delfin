# Delfin — Gemma 4-Powered Local Study Assistant

A live, voice-first study assistant that understands your screen — fully local, private, no API costs. Delfin captures the foreground window, sends the screenshot plus optional voice input to **Gemma 4**, and streams explanations back in an Electron sidebar.

**GitHub:** [github.com/raytf/app_delfin](https://github.com/raytf/app_delfin)

---

## Quick Start

The same five commands work on macOS (arm64), Linux (x64), and Windows (x64):

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup   # seeds .env, downloads bridge artifact + Gemma 4 model, bootstraps Piper TTS, validates .env
npm run dev     # full stack: C++ backend proxy + Electron/Vite
```

**Prerequisites:** [Node.js 20+](https://nodejs.org/), [Python 3.12+](https://www.python.org/downloads/) (dev mode: repo-local Piper TTS), [GitHub CLI](https://cli.github.com/) + `gh auth login`. Windows has extra optional requirements for source builds — see [Windows setup](#windows-x64) below.

---

## What Delfin does

- Capture the current foreground window for every study turn
- Accept **voice-first** questions with always-on VAD, or typed prompts
- Stream Gemma 4 answers token-by-token over WebSocket
- Play back spoken responses with Piper TTS and Web Speech fallback
- Persist named study sessions, screenshots, and conversation history
- Browse, reopen, and delete past sessions from the home screen

---

## Setup

### macOS (arm64) / Linux (x64)

**Prerequisites:** [Node.js 20+](https://nodejs.org/), [Python 3.12+](https://www.python.org/downloads/), [GitHub CLI](https://cli.github.com/)

```bash
brew install gh && gh auth login        # macOS
# or: sudo apt install gh && gh auth login  # Linux
```

```bash
git clone https://github.com/raytf/app_delfin.git
cd app_delfin && npm install
npm run setup
npm run dev
```

> Intel Macs are out of scope — the prebuilt bridge targets arm64 only.

Full guides: [macOS](docs/guides/testing-guide-macos.md) · [Linux / WSL2](docs/guides/testing-guide-linux.md)

---

### Windows (x64)

**Prerequisites:** [Node.js 20+](https://nodejs.org/), Python 3.12+ (dev mode: Piper TTS), [GitHub CLI](https://cli.github.com/) (`winget install --id GitHub.cli -e`, then `gh auth login`)

```powershell
git clone https://github.com/raytf/app_delfin.git
cd app_delfin && npm install
npm run setup
npm run dev
```

`npm run setup` chains three steps: seed `.env` from `.env.example`, run `setup:litert-cpp` (download the prebuilt CI bridge artifact, provision the Gemma 4 model, bootstrap the repo-local Piper TTS runtime, patch `.env`), and validate `.env` keys. It does **not** silently fall back to source builds.

If you already have an artifact from `.github/workflows/build-litert-cpp-bridge.yml`:

```powershell
npm run download:bridge:windows            # download latest artifact into bin/
npm run test:bridge:windows -- --SkipBenchmark   # verify + health-check
```

<details>
<summary>Source build — Bazel + MSVC (backend developers only)</summary>

**Additional prerequisites:** Bazelisk, Visual Studio 2022 Build Tools with **Desktop development with C++**, Python 3.13, Java with `JAVA_HOME` set. Open **x64 Native Tools Command Prompt for VS 2022**. Confirm `where.exe cl` resolves to `Hostx64\x64\cl.exe`; reopen as administrator if Bazel reports symlink permission errors.

```powershell
# Pre-clone LiteRT-LM with a short Bazel output root
cd ..
git clone https://github.com/google-ai-edge/LiteRT-LM.git
cd LiteRT-LM
New-Item -ItemType Directory -Force C:\b | Out-Null
if (-not (Select-String -Path .\.bazelrc -Pattern 'output_user_root' -Quiet)) {
  Add-Content .\.bazelrc "`nstartup --output_user_root=C:/b"
}
bazelisk shutdown
cd ..\app_delfin
npm run setup:litert-cpp -- --source-build
```

`setup:litert-cpp` also accepts `--bridge-source auto|release|artifact|build|existing`, `--repo <owner/repo>`, `--ci-run-id <id>`, `--litert-lm-dir <path>`, `--skip-build`, `--no-piper`, `--no-model`, `--dry-run`. Run with `--help` for the full list.
</details>

**Troubleshooting:**
- **Symlink permission denied** — enable Windows Developer Mode; run from an Administrator VS Developer shell; keep `startup --output_user_root=C:/b` in `LiteRT-LM\.bazelrc`.
- **`SET INCLUDE=msvc_not_found`** — install **Build Tools for Visual Studio 2022 → Desktop development with C++**; confirm `where.exe cl` works.
- **Bazel can't find Visual Studio** — `$env:BAZEL_VS = "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"`.

> **TTS in dev mode:** `npm run dev:backend` uses Piper TTS. `npm run setup` bootstraps the repo-local Piper runtime and writes `PIPER_*` env vars automatically. If Piper fails, the renderer falls back to Web Speech.
>
> **Packaged installer:** Piper is not bundled. On first run the app downloads the Gemma 4 model, a standalone Piper binary (~30 MB), and the default voice (~65 MB) — Python not required on the user's machine.

Full guide: [Windows](docs/guides/testing-guide-windows.md)

---

## Running the app

| Command | What it does |
| --- | --- |
| `npm run dev` | **Primary.** Full stack — C++ backend proxy + Electron/Vite; run `npm run setup` first |
| `npm run dev:frontend` | Electron + Vite only — use when `dev:backend` is already running in another terminal |
| `npm run dev:backend` | C++ backend proxy only (port 8321) |
| `npm run dev:mock` | Mock sidecar + Electron (UI dev, no inference needed) |

### Piper voice management (dev only)

| Command | What it does |
| --- | --- |
| `npm run voice:list` | List installed voices and detected sample rates |
| `npm run voice:use -- en_US-hfc_female-medium` | Switch active voice in `.env` |
| `npm run voice:install -- en/en_US/hfc_female/medium --use` | Download from HuggingFace + switch |

### Verify the backend

```bash
curl http://localhost:8321/health   # check backend is running
bash scripts/setup-check.sh        # full env check (macOS / Linux)
npm run check:windows              # full env check (Windows)
```

---

## Configuration

| Variable | Default | When to change |
| --- | --- | --- |
| `LITERT_BACKEND` | `CPU` | Set to `GPU` (OpenCL on Linux, Metal on macOS) |
| `MODEL_REPO` | `litert-community/gemma-4-E2B-it-litert-lm` | Switch to the E4B variant on 32 GB machines |
| `VOICE_ENABLED` | `true` | Disable always-on VAD for text-only prompts |
| `LITERT_CPP_TTS_BACKEND` | `piper` | Set to `none` to disable Piper and use Web Speech fallback |
| `LITERT_CPP_TTS_SOFT_MIN_CHARS` / `MAX_CHARS` | `80` / `180` | Tune Piper partial flushes for long text without punctuation |
| `PIPER_MODEL` | _(set by setup)_ | Managed by `npm run voice:use`; written automatically by `npm run setup` |
| `SIDECAR_URL` | `http://localhost:8321` | Sidecar base URL; the WebSocket endpoint is derived from it. On WSL2, replace `localhost` with the WSL2 IP |

See [`.env.example`](.env.example) for the full reference.

---

## Development

### Scripts

| Script | Description |
| --- | --- |
| `npm run setup` | **Recommended.** Fresh-clone one-shot: seeds `.env`, runs `setup:litert-cpp`, then validates `.env` |
| `npm run setup:litert-cpp` | Underlying step — CI bridge artifact, model, Piper runtime + voice, patches `.env`. Accepts `--source-build` and other flags |
| `npm run check:windows` | Windows environment + bridge/model sanity check |
| `npm run download:bridge:windows` | Download the latest Windows bridge artifact into `bin/` |
| `npm run test:bridge:windows` | Verify bridge, wait for `/health`, optionally benchmark |
| `npm run benchmark:litert-cpp` | LiteRT-LM C++ benchmark (5 runs) |
| `npm run benchmark:litert-py` | Python sidecar benchmark (deprecated comparison) |
| `npm run build` | Build Electron app and validate VAD runtime assets |
| `npm test` | Vitest unit tests |
| `npm run bridge:build` | Build C++ bridge from source (slow — requires Bazel + LiteRT-LM) |

### Tests

```bash
npm test
```

### Manual WebSocket check

```bash
npm i -g wscat
wscat -c ws://localhost:8321/ws
# Type: {"text": "Summarize this slide", "preset_id": "lecture-slide"}
```

### Production build and releases

```bash
npm run build   # TypeScript → JS + Vite renderer build
npm run dist    # platform installer: NSIS (Windows) / DMG (macOS) / AppImage (Linux)
```

**Versioning:** `npm version patch|minor|major` updates `package.json`, commits `vX.Y.Z`, and creates a git tag. Never manually edit the version field. Current version: **v0.0.1**.

### Updating the LiteRT-LM bridge

Two constants in `scripts/setup-litert-cpp.mjs` pin the bridge build and matching model weights and **must always be bumped together**:

```js
export const LITERT_LM_REF  = '...'   // upstream LiteRT-LM tag (e.g. v0.11.0)
export const MODEL_REVISION = '...'   // HuggingFace commit SHA for the model
```

Procedure when LiteRT-LM ships a new release:

1. Pick the new tag from [LiteRT-LM releases](https://github.com/google-ai-edge/LiteRT-LM/releases).
2. Get the matching model SHA from `https://huggingface.co/api/models/<MODEL_REPO>/commits/main` (the first entry's `id`).
3. Edit both constants in `scripts/setup-litert-cpp.mjs` and commit.
4. Push — `.github/workflows/build-litert-cpp-bridge.yml` rebuilds the bridge artifacts for all three platforms automatically.
5. After CI succeeds, run `npm run setup:litert-cpp` locally. It compares the pinned `LITERT_LM_REF` against `bin/bridge.version` and re-downloads the bridge when they differ — no extra flags needed.

---

## Architecture

Delfin runs Gemma 4 via the **LiteRT-LM C++ bridge** on all supported platforms (Windows x64, macOS arm64, Linux x64). The C++ bridge is a thin inference kernel (JSONL over stdio); the TypeScript sidecar (`sidecar/src/`) is the application layer that spawns the bridge and Piper, manages sessions, and serves the WebSocket protocol. The Python FastAPI sidecar (`sidecar-old/server.py`) is deprecated and retained for developer reference only.

```text
Electron Renderer (React / Zustand)
        ↕  contextBridge (IPC)
Electron Main (Node.js)  ←→  WebSocket :8321  ←→  TypeScript sidecar (sidecar/src/)
                                                      ├── delfin_litert_bridge[.exe] (C++)
                                                      │     └── LiteRT-LM + Gemma 4 E2B/E4B
                                                      └── piper (TTS subprocess)
```

| Layer | Technology |
| --- | --- |
| Desktop framework | Electron 41+ via electron-vite |
| Renderer | React 19, TypeScript, Tailwind CSS 4 |
| State / Validation | Zustand 5 / Zod 4 |
| Inference — primary | LiteRT-LM C++ bridge + TypeScript sidecar (all platforms) |
| Inference — deprecated | LiteRT-LM Python sidecar (`sidecar-old/server.py`) |
| Model | Gemma 4 E2B (default); E4B for 32 GB machines |
| TTS | Piper (primary) / Web Speech (fallback); Kokoro/MLX (deprecated Python path) |
| Voice input | `@ricky0123/vad-web` (Silero ONNX in renderer) |

---

## Project structure

```text
src/
├── main/          # Electron main: capture, IPC, overlay, session persistence
├── preload/       # contextBridge
├── renderer/      # React UI, hooks, stores, waveform/audio utilities
└── shared/        # types, schemas, constants
litert-cpp-bridge/     # C++ JSONL bridge source (primary backend)
sidecar/
└── src/               # TypeScript sidecar — WebSocket server + bridge/TTS orchestration
sidecar-old/           # deprecated Python sidecar (dev reference)
scripts/
└── windows/           # PowerShell helpers
docs/                  # SPEC, feature specs, explanation docs
```

---

## Documentation

- [`docs/README.md`](docs/README.md) — full documentation index with lifecycle status for every spec
- [`docs/SPEC.md`](docs/SPEC.md) — architecture, IPC/WebSocket protocol, env vars, coding rules
- [`STATUS.md`](STATUS.md) — per-file implementation status against the codebase
