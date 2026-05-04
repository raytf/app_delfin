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
| **LiteRT-LM C++** | Windows x64 / macOS arm64 / Linux x64 | Native LiteRT-LM via a JSONL bridge (`native/litert-cpp-bridge/`) wrapped by a Node WebSocket proxy. Same KV-cache, vision, and audio-input parity as the Python sidecar, plus Piper-backed sentence-level TTS. `npm run setup:litert-cpp` consumes CI-built bridge artifacts by default; backend developers can pass `--source-build` to rebuild from source.                          |
| ~~llamafile~~     | _Removed_                                           | Mozilla's single-file llama.cpp server. Previously the recommended Windows-without-WSL2 fallback. **Superseded by the LiteRT-LM C++ backend.** The `setup:llamafile`, `dev:llamafile`, and `benchmark:llamafile` npm scripts have been removed. The standalone Python benchmark adapter (`scripts/benchmark/backends/llamafile.py`) is retained for comparison runs only. |

For the LiteRT-LM C++ path, the C++ source tree and Bazel/MSVC toolchain are needed only by backend developers or CI. Normal setup uses the prebuilt `delfin-litert-bridge-windows-x64`, `delfin-litert-bridge-macos-arm64`, or `delfin-litert-bridge-linux-x64` workflow artifact and then downloads only the `.litertlm` model/TTS assets.

---

## Setup by platform

Full per-OS setup & validation guides:

- [macOS guide](docs/features/backend/testing-guide-macos.md)
- [Linux / WSL2 guide](docs/features/backend/testing-guide-linux.md)
- [Windows guide (WSL2 + native)](docs/features/backend/testing-guide-windows.md)

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

### Windows native (LiteRT-LM C++ backend)

For a fresh native-Windows clone, `npm run setup:litert-cpp` is now the one-shot
setup command. It initializes `.env`, stages the native bridge, ensures the
Gemma 4 `.litertlm` model, bootstraps the repo-local Piper runtime,
installs/activates the default Piper voice, and prints a step-by-step summary.

Bridge provisioning is automatic: existing `bin\` files are reused first, then
the script downloads the latest successful GitHub Actions artifact via `gh`.
It does **not** fall back to local source builds unless you pass `--source-build`
or `--bridge-source build`.

**Prerequisites:**

- [Node.js 20+](https://nodejs.org/)
- Python 3.12+ for the repo-local Piper runtime
- GitHub CLI (`winget install --id GitHub.cli -e`, then `gh auth login`) for CI artifact download
- Optional for backend source builds: [Git](https://git-scm.com/) on PATH, Bazelisk, Visual Studio 2022 Build Tools with **Desktop development with C++**, Python 3.13, and Java with `JAVA_HOME` set, per upstream LiteRT-LM Windows prerequisites

If you are using the local source-build fallback, open **Developer PowerShell
for VS 2022** or **x64 Native Tools Command Prompt for VS 2022**. If Bazel
reports symlink permission errors, reopen that shell with **Run as administrator**.

For the source-build fallback, verify MSVC is visible:

```powershell
where.exe cl
cl
```

`where.exe cl` must resolve to `Hostx64\x64\cl.exe`. If it lists `Hostx86\x86\cl.exe` instead, your shell is initialized for x86; reopen the **x64 Native Tools** shell or run `Launch-VsDevShell.ps1 -Arch amd64 -HostArch amd64`.

Clone Delfin, install Node dependencies, then run the one-shot setup:

```powershell
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup:litert-cpp
```

For source-build-only validation, give Bazel a short output root before the
first build. The setup script looks for LiteRT-LM in the parent folder by
default, so pre-clone/configure it like this:

```powershell
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

The script is idempotent and accepts `--source-build`, `--bridge-source auto|release|artifact|build|existing`, `--repo <owner/repo>`, `--ci-run-id <id>`, `--artifact-name <name>`, `--litert-lm-dir <path>`, `--skip-build`, `--no-piper`, `--no-model`, `--install-prereqs`, and `--dry-run`. Run with `--help` for the full list.

If you already have a successful CI run for `.github/workflows/build-litert-cpp-bridge.yml`, you can skip the local Bazel/MSVC build and use the Windows artifact helpers instead:

- Install GitHub CLI first if needed: `winget install --id GitHub.cli -e`
- Restart PowerShell so `gh` is on PATH

<augment_code_snippet mode="EXCERPT">
````powershell
gh auth login
npm run download:ci-bridge:windows
npm run test:ci-bridge:windows -- --SkipBenchmark
````
</augment_code_snippet>

`npm run test:ci-bridge:windows` can also download a specific run for you via `-- --DownloadArtifact --RunId <id>`. Omit `-- --SkipBenchmark` to run the full `benchmark:litert-cpp` sweep after the `/health` smoke check.

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

> **Note on TTS:** `npm run dev:litert-cpp` bypasses the Python sidecar's Kokoro TTS. `npm run setup:litert-cpp` now bootstraps a repo-local pinned `piper-tts` runtime plus a default Piper voice and writes the `PIPER_*` env vars automatically. If Piper is disabled or fails, the renderer falls back to browser Web Speech automatically.

---

## What `npm run setup` does

1. **`npm run init:env`** — copies `.env.example` → `.env` if needed
2. **`npm run setup:sidecar`** — creates `sidecar/.venv` and installs Python dependencies (including `httpx`, `psutil` for benchmarking)
3. **`npm run download:models`** — downloads Kokoro TTS assets into `sidecar/` (~340 MB)
4. **`npm run check:env`** — warns about missing or suspicious environment values

`npm run setup:litert-cpp` is separate and is the recommended one-shot path for the LiteRT-LM C++ backend. On Windows x64, macOS arm64, and Linux x64 it reuses existing `bin/` bridge files, otherwise downloads the matching CI artifact via `gh`; source builds are opt-in via `--source-build` for backend developers. It also bootstraps a repo-local pinned `piper-tts` runtime plus default Piper voice and copies or downloads the `.litertlm` model into `models/`.

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
| `LITERT_CPP_BRIDGE_REPO` | unset                               | Optional `owner/repo` override for `setup:litert-cpp` bridge Release/artifact lookup               |
| `LITERT_CPP_TTS_BACKEND` | `none`                               | Set to `piper` to enable off-Python speech on `npm run dev:litert-cpp`                            |
| `LITERT_CPP_TTS_SOFT_MIN_CHARS` / `LITERT_CPP_TTS_SOFT_MAX_CHARS` | `80` / `180` | Tune partial Piper flushes for long text without punctuation; completed sentences always flush first |
| `PIPER_MODEL`    | unset                                       | Usually managed by `npm run voice:use -- <voice-name>` for LiteRT C++ Piper voices               |

See [`.env.example`](.env.example) for the full reference including LiteRT-LM C++ backend options. The `LLAMAFILE_*` variables are kept for the deprecated benchmark-comparison path only.

---

## Running the app

| Command                  | What it does                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev:full`       | Starts the LiteRT sidecar + Electron together (macOS / Linux / WSL2)                                                                  |
| `npm run dev:sidecar`    | Starts just the LiteRT sidecar (WSL2 terminal)                                                                                        |
| `npm run dev:litert-cpp` | Starts the LiteRT-LM C++ backend WebSocket proxy on the Delfin sidecar port; `setup:litert-cpp` prepares the optional Piper runtime/voice |

| `npm run dev:mock`       | Starts the mock sidecar + Electron (UI development, no inference)                                                                     |
| `npm run dev`            | Starts Electron + Vite only (when sidecar is already running separately)                                                              |

### Piper voice helpers

| Command | What it does |
| --- | --- |
| `npm run voice:list` | Lists local Piper voices under `models/piper` and shows detected sample rates |
| `npm run voice:use -- en_US-hfc_female-medium` | Updates `.env` to use an installed Piper voice |
| `npm run voice:install -- en/en_US/hfc_female/medium --use` | Downloads a voice from `rhasspy/piper-voices`, reads its sample rate, and switches `.env` |

`npm run setup:litert-cpp` bootstraps the repo-local `piper-tts` runtime, installs/activates the default voice, and writes `PIPER_BIN` plus the active `PIPER_MODEL` / `PIPER_CONFIG` / `PIPER_SAMPLE_RATE`; Piper voice switching only affects `npm run dev:litert-cpp`. `PIPER_SAMPLE_RATE` is optional when the selected `.onnx.json` config contains `audio.sample_rate`.

### Verify the sidecar is healthy

```bash
curl http://localhost:8321/health    # LiteRT sidecar / LiteRT-LM C++ proxy

```

### Verify your environment

```bash
bash scripts/setup-check.sh        # Linux / macOS / WSL2
npm run setup-check:windows       # Windows PowerShell
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
│   └── windows/       # PowerShell helpers for setup checks and CI bridge artifact download/test
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
| `npm run setup:litert-cpp`     | One-shot setup for the LiteRT-LM C++ backend (CI bridge artifact by default, repo-local Piper runtime + voice, model)  |
| `npm run setup-check:windows`  | Windows environment + bridge/model sanity check                                               |
| `npm run download:ci-bridge:windows` | Download the latest successful Windows bridge artifact into `bin/`                       |
| `npm run test:ci-bridge:windows` | Start the downloaded bridge via `dev:litert-cpp`, wait for `/health`, and optionally benchmark |

| `npm run dev:full`             | Run LiteRT sidecar + Electron together                                                       |
| `npm run dev:mock`             | Run mock sidecar + Electron (no inference needed)                                            |
| `npm run dev`                  | Run Electron + Vite only                                                                     |
| `npm run dev:sidecar`          | Run the LiteRT sidecar only                                                                  |
| `npm run dev:litert-cpp`       | Run the LiteRT-LM C++ backend WebSocket proxy with optional Piper TTS                         |

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
