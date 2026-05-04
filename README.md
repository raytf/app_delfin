# Delfin — Gemma 4-Powered Local Study Assistant

A live, voice-first study assistant that understands your screen context — fully local, private, and with no API token costs. Delfin captures the foreground window, sends the screenshot plus optional voice input to **Gemma 4**, and streams explanations back inside an Electron sidebar.

Point Delfin at lecture slides, textbook pages, diagrams, or notes. Ask by voice or text, get plain-English explanations in real time, and optionally have the response read back with server-side Kokoro TTS or browser speech fallback.

**GitHub:** [github.com/raytf/app_delfin](https://github.com/raytf/app_delfin)

---

## What Delfin can do today

- Capture the current foreground window for every study turn
- Accept **voice-first** questions with always-on VAD, or typed prompts
- Stream Gemma 4 answers token-by-token over WebSocket
- Play back spoken responses with Kokoro TTS on the Python sidecar, Piper on the LiteRT C++ proxy path, and Web Speech fallback when server audio is unavailable
- Persist named study sessions, saved screenshots, and conversation history
- Browse, reopen, and delete past sessions from the home screen
- Run against either the real sidecar or a mock sidecar for UI work

---

## Inference backends

Delfin runs Gemma 4 locally using one of the following backends depending on your platform:

| Backend           | Platforms                                           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LiteRT-LM**     | macOS, Linux, Windows + WSL2                        | Google's inference engine purpose-built for Gemma 4. Significantly faster than generic GGUF inference, and maintains a KV cache across conversation turns so follow-up questions are near-instant. Used by the Python sidecar.                                                                                                                                                                                                                            |
| **LiteRT-LM C++** | Linux / macOS (arm64) / WSL2 default; Native Windows opt-in | Native LiteRT-LM via a JSONL bridge (`native/litert-cpp-bridge/`) wrapped by a Node WebSocket proxy. Same KV-cache, vision, and audio-input parity as the Python sidecar, plus Piper-backed sentence-level TTS. Default developer environment is Linux / macOS (arm64) / WSL2; `npm run setup:litert-cpp -- --native-windows` produces a native Windows `.exe`. End-user Windows distribution receives a CI-built native binary.                          |
| ~~llamafile~~     | _Removed_                                           | Mozilla's single-file llama.cpp server. Previously the recommended Windows-without-WSL2 fallback. **Superseded by the LiteRT-LM C++ backend.** The `setup:llamafile`, `dev:llamafile`, and `benchmark:llamafile` npm scripts have been removed. The standalone Python benchmark adapter (`scripts/benchmark/backends/llamafile.py`) is retained for comparison runs only. |

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

### Windows native (LiteRT-LM C++ backend, opt-in)

The default LiteRT-LM C++ developer environment on Windows is **WSL2** — see
the WSL2 section above and `native/litert-cpp-bridge/README.md` for the
two-terminal workflow (bridge in WSL2, Electron on Windows). Use this section
only when you need to produce or test a native Windows `.exe` locally without
going through CI. Running `npm run setup:litert-cpp` on Windows without
`--native-windows` prints the WSL2 instructions and exits.

**Prerequisites:**

- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/) on PATH
- [Bazelisk](https://github.com/bazelbuild/bazelisk) — `winget install --id Bazel.Bazelisk -e` (or pass `--install-prereqs` to the setup script)
- Visual Studio 2022 Build Tools with the **Desktop development with C++** workload. Install the bootstrapper with `winget install --id Microsoft.VisualStudio.2022.BuildTools -e`, then open Visual Studio Installer → Modify and confirm **MSVC v143 x64/x86 build tools** plus a Windows 10/11 SDK are selected. MinGW is not supported.
- Python 3.13 and Java with `JAVA_HOME` set, per upstream LiteRT-LM Windows prerequisites

Recommended first build shell: open **Developer PowerShell for VS 2022** or **x64 Native Tools Command Prompt for VS 2022**. If Bazel reports symlink permission errors, reopen that shell with **Run as administrator**.

Before the first build, verify MSVC is visible:

```powershell
where.exe cl
cl
```

`where.exe cl` must resolve to `Hostx64\x64\cl.exe`. If it lists `Hostx86\x86\cl.exe` instead, your shell is initialized for x86; reopen the **x64 Native Tools** shell or run `Launch-VsDevShell.ps1 -Arch amd64 -HostArch amd64`.

Clone Delfin, install Node dependencies, then give Bazel a short output root before the first build. The setup script looks for LiteRT-LM in the parent folder by default, so pre-clone/configure it like this:

```powershell
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install

cd ..
git clone https://github.com/google-ai-edge/LiteRT-LM.git
cd LiteRT-LM
New-Item -ItemType Directory -Force C:\b | Out-Null
if (-not (Select-String -Path .\.bazelrc -Pattern 'output_user_root' -Quiet)) {
  Add-Content .\.bazelrc "`nstartup --output_user_root=C:/b"
}
bazelisk shutdown
cd ..\app_delfin
npm run setup:litert-cpp -- --native-windows   # builds the native Windows bridge, configures Piper TTS, resolves the .litertlm model
```

The script is idempotent and accepts `--litert-lm-dir <path>`, `--skip-build`, `--no-piper`, `--no-model`, `--install-prereqs`, and `--dry-run`. Run with `--help` for the full list.

#### Troubleshooting Windows setup

- **`createSymbolicLinkW failed (permission denied)` / `Cannot create symlink`** — enable Windows Developer Mode, then run setup from an Administrator VS Developer shell. Keep `startup --output_user_root=C:/b` (or `D:/b`) in `LiteRT-LM\.bazelrc`, run `bazelisk shutdown`, and retry.
- **`SET INCLUDE=msvc_not_found` / `vc_installation_error_x64.bat`** — Bazel cannot find Visual C++ Build Tools. Install or modify **Build Tools for Visual Studio 2022** in Visual Studio Installer, select **Desktop development with C++**, reopen a VS Developer shell, and confirm `where.exe cl` works.
- **Bazel still cannot find Visual Studio** — in the same shell, set `BAZEL_VS` to your install path before retrying, for example: `$env:BAZEL_VS = "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"`.

Then start the app in **two PowerShell terminals**:

```powershell
# Terminal 1 — start the LiteRT-LM C++ backend WebSocket proxy on port 8321
npm run dev:litert-cpp
```

```powershell
# Terminal 2 — start Electron + Vite
npm run dev
```

> **Note on TTS:** `npm run dev:litert-cpp` bypasses the Python sidecar's Kokoro TTS. To enable off-Python speech, set `LITERT_CPP_TTS_BACKEND=piper` in `.env` (the setup script already installs the default Piper voice). If Piper is disabled or fails, the renderer falls back to browser Web Speech automatically.

---

## What `npm run setup` does

1. **`npm run init:env`** — copies `.env.example` → `.env` if needed
2. **`npm run setup:sidecar`** — creates `sidecar/.venv` and installs Python dependencies (including `httpx`, `psutil` for benchmarking)
3. **`npm run download:models`** — downloads Kokoro TTS assets into `sidecar/` (~340 MB)
4. **`npm run check:env`** — warns about missing or suspicious environment values

`npm run setup:litert-cpp` is separate and is the recommended path for native Windows. It clones LiteRT-LM (defaulting to the parent folder of this project), builds `delfin_litert_bridge.exe` via Bazel, installs a Piper voice, and copies or downloads the `.litertlm` model into `models/`.

The `setup:llamafile`, `dev:llamafile`, and `benchmark:llamafile` npm scripts have been **removed**. For llamafile benchmark comparison, use the Python harness directly: `python scripts/benchmark/run.py --backend llamafile --llamafile-host localhost:8080 --runs 5 --scenarios s1,s2,s3`.

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
| `LITERT_CPP_TTS_BACKEND` | `none`                               | Set to `piper` to enable off-Python speech on `npm run dev:litert-cpp`                            |
| `PIPER_MODEL`    | unset                                       | Usually managed by `npm run voice:use -- <voice-name>` for LiteRT C++ Piper voices               |

See [`.env.example`](.env.example) for the full reference including LiteRT-LM C++ backend options. The `LLAMAFILE_*` variables are kept for the deprecated benchmark-comparison path only.

---

## Running the app

| Command                  | What it does                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev:full`       | Starts the LiteRT sidecar + Electron together (macOS / Linux / WSL2)                                                                  |
| `npm run dev:sidecar`    | Starts just the LiteRT sidecar (WSL2 terminal)                                                                                        |
| `npm run dev:litert-cpp` | Starts the LiteRT-LM C++ backend WebSocket proxy on the Delfin sidecar port (native Windows); set `LITERT_CPP_TTS_BACKEND=piper` to enable Piper audio |

| `npm run dev:mock`       | Starts the mock sidecar + Electron (UI development, no inference)                                                                     |
| `npm run dev`            | Starts Electron + Vite only (when sidecar is already running separately)                                                              |

### Piper voice helpers

| Command | What it does |
| --- | --- |
| `npm run voice:list` | Lists local Piper voices under `models/piper` and shows detected sample rates |
| `npm run voice:use -- en_US-hfc_female-medium` | Updates `.env` to use an installed Piper voice |
| `npm run voice:install -- en/en_US/hfc_female/medium --use` | Downloads a voice from `rhasspy/piper-voices`, reads its sample rate, and switches `.env` |

Piper voice switching only affects `npm run dev:litert-cpp`. `PIPER_SAMPLE_RATE` is now optional when the selected `.onnx.json` config contains `audio.sample_rate`.

### Verify the sidecar is healthy

```bash
curl http://localhost:8321/health    # LiteRT sidecar / LiteRT-LM C++ proxy

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
Electron Main (Node.js)  ←→  WebSocket  ←→  Inference backend
                                               ├── LiteRT-LM + Gemma 4    (Python sidecar; macOS / Linux / WSL2)
                                               └── LiteRT-LM C++ bridge   (Node proxy + native binary; Windows)

Legacy / deprecated:
                                               └── llamafile + GGUF       (kept only for benchmark comparison)
```

| Layer                       | Technology                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Desktop framework           | Electron 41+ via electron-vite                                                       |
| Renderer                    | React 19, TypeScript, Tailwind CSS 4                                                 |
| State management            | Zustand 5                                                                            |
| Validation                  | Zod 4                                                                                |
| Inference — LiteRT path     | LiteRT-LM (Python sidecar; macOS / Linux / WSL2)                                     |
| Inference — LiteRT C++ path | Node proxy + native LiteRT-LM C++ bridge (Windows; macOS/Linux planned)              |
| Inference — llamafile path  | _Deprecated._ llamafile / llama-server (C++) — benchmark comparison only             |
| Model                       | Gemma 4 E2B (default); E4B for 32 GB machines                                        |
| API server                  | FastAPI + uvicorn (LiteRT sidecar) / Node WebSocket proxy (LiteRT C++)               |
| Voice input                 | `@ricky0123/vad-web` (Silero VAD in the renderer)                                    |
| TTS                         | kokoro-onnx / Piper / mlx-audio / Web Speech fallback                                |

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
├── native/
│   └── litert-cpp-bridge/ # native LiteRT-LM C++ JSONL bridge source (Windows backend)
├── bin/               # built `delfin_litert_bridge.exe` + DLL (gitignored)
├── models/            # `.litertlm` model + Piper voices (gitignored)
├── scripts/           # setup, env checks, model downloads, benchmark runner
├── results/           # benchmark output JSON/CSV (gitignored except .gitkeep)
├── docs/              # SPEC, feature specs (backend/distribution/memory/ui), and design notes
├── .env.example
├── README.md
└── STATUS.md
```

---

## Development

### Scripts

| Script                         | Description                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `npm run setup`                | First-run setup for env, Python venv, and TTS assets (macOS / Linux / WSL2)                  |
| `npm run setup:litert-cpp`     | One-shot setup for the native LiteRT-LM C++ backend on Windows (clone, build, Piper, model)  |

| `npm run dev:full`             | Run LiteRT sidecar + Electron together                                                       |
| `npm run dev:mock`             | Run mock sidecar + Electron (no inference needed)                                            |
| `npm run dev`                  | Run Electron + Vite only                                                                     |
| `npm run dev:sidecar`          | Run the LiteRT sidecar only                                                                  |
| `npm run dev:litert-cpp`       | Run the LiteRT-LM C++ backend WebSocket proxy (native Windows)                               |

| `npm run benchmark:litert`     | Benchmark the LiteRT sidecar (uses sidecar venv automatically)                               |
| `npm run benchmark:litert-cpp` | Benchmark the LiteRT-LM C++ backend on the Delfin sidecar protocol                           |

| `npm run build`                | Build the Electron app and validate VAD runtime assets                                       |
| `npm test`                     | Run Vitest unit tests                                                                        |
| `npm run check:env`            | Validate expected `.env` values                                                              |
| `npm run check:vad-runtime`    | Verify packaged VAD/ONNX runtime files                                                       |

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

- [`docs/README.md`](docs/README.md) — full documentation index with lifecycle status for every feature spec, explanation, and archived doc
- [`docs/SPEC.md`](docs/SPEC.md) — architecture, protocols, IPC channels, and coding rules
- [`STATUS.md`](STATUS.md) — per-file implementation status against the codebase
