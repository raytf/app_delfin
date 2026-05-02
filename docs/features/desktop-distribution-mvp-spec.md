# Desktop Distribution MVP Spec — Gate 1 Approved

> Gate 1 spec for making Delfin installable by student testers as a normal desktop app. This feature is documented under `docs/features/` because it is an independent, cross-cutting delivery track rather than the next numbered product phase.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 approved — ready for implementation |
| **Approval date** | 2026-04-22 |
| **Revised on** | 2026-05-01 (see revision section below) |
| **Approver** | Human reviewer |
| **Bundle identifier** | `com.delfin.desktop` |
| **Target platforms** | Windows x64, macOS x64, macOS arm64, Linux x64 |
| **Packaging decision** | ~~Native Electron installers with a bundled frozen Python sidecar~~ → llama-server pre-built binary (first-run download) + separate TTS sidecar; see revision |
| **Model delivery** | First-run download (llama-server binary + GGUF model + TTS assets) |
| **Inference scope** | CPU-only for MVP; CUDA/Metal as stretch goal |
| **Deferred by approval** | Docker, full CI/CD publishing, auto-update implementation |

## Revision — 2026-05-01

### What changed and why

The original approved approach (freeze the Python sidecar with PyInstaller) was revised after discovering that `litert-lm-api-nightly` — the core inference engine — publishes no `win_amd64` wheel and is explicitly Windows-WSL-only by Google. PyInstaller freezing a Linux-only C extension cannot produce a native Windows executable; the WSL2 split would persist even in a "packaged" build.

**Research finding:** `llama.cpp` landed Gemma 4 GGUF support in April 2026 and publishes pre-built `llama-server` binaries for Windows x64, macOS arm64/x64, and Linux x64. Replacing LiteRT-LM with `llama-server` eliminates the WSL2 requirement at the source.

### Decision: Option A — llama-server binary sidecar

| Axis | Old decision | New decision |
|---|---|---|
| Inference engine | LiteRT-LM (Python, Linux/Mac only) | llama-server binary (C++, all platforms) |
| Sidecar delivery | PyInstaller-frozen Python bundle | Pre-built binary downloaded at first run |
| TTS | Unified Python sidecar (kokoro-onnx) | Investigate Piper TTS binary or frozen kokoro-onnx separately |
| Installer size | ~500 MB (frozen Python stack) | ~50 MB (binary only; model downloaded separately) |
| GPU | Deferred | CPU-first; CUDA/Metal detection as stretch goal |

### Benchmark prerequisite

Before finalising the backend switch, an empirical benchmark comparing LiteRT-LM vs llama-server on the Gemma 4 E2B model is required. LiteRT-LM is reportedly more optimised for Gemma 4; the benchmark spec is at `docs/features/inference-benchmarking-spec.md`.

### Implementation sub-specs

The original monolithic execution track is now split into three focused specs:

| Spec | Scope |
|---|---|
| [`distribution-backend-migration-spec.md`](distribution-backend-migration-spec.md) | Replace LiteRT-LM with llama-server; TTS sidecar investigation |
| [`distribution-packaging-spec.md`](distribution-packaging-spec.md) | electron-builder config, first-run download, installers, GPU stretch |
| [`distribution-cicd-spec.md`](distribution-cicd-spec.md) | GitHub Actions matrix builds, artifact publishing, distribution recommendations |

## Goal

Allow students on the supported desktop platforms to download, install, and run Delfin without manually installing Node.js, Python, or a virtual environment, while preserving local-first inference and first-run model download.

## Why this lives in `docs/features/`

- This work does not fit the existing numbered phase sequence, because Phase 7 is already assigned to memory.
- The implementation will cut across Electron packaging, sidecar runtime, model bootstrap UX, and release tooling.
- `docs/SPEC.md` should remain the global source of truth for stable architecture and contracts; this file is the scoped feature plan that can later feed updates back into `docs/SPEC.md` once implemented.
- The repo already has multiple standalone feature specs in `docs/`; introducing `docs/features/` is the cleanest place for future independent tracks.

## Scope

### Docs
- Create this spec: `docs/features/desktop-distribution-mvp-spec.md`
- Update `AGENTS.md` documentation map so the new feature-spec location is discoverable

### Planned implementation files
- `package.json` — add packaging/build scripts and `electron-builder` distribution config
- `src/main/index.ts` — packaged-runtime startup flow, writable path setup, first-run bootstrap orchestration
- `src/main/sidecar/*` — packaged sidecar resolution, launch, health/progress handling
- `src/preload/index.ts` — expose any model bootstrap IPC needed by the renderer
- `src/shared/types.ts` / `src/shared/schemas.ts` — model bootstrap types and validation if new IPC channels are added
- `src/renderer/App.tsx` and setup-related renderer components — first-run setup/download UI
- `scripts/build-sidecar.mjs` — freeze sidecar into a platform-specific executable
- `scripts/run-sidecar.mjs` — prefer bundled runtime in packaged mode and preserve dev-mode venv behavior
- `sidecar/delfin-sidecar.spec` or equivalent freezer config — PyInstaller packaging instructions
- `sidecar/server.py`, `sidecar/inference/engine.py`, `sidecar/tts.py` — writable cache/model path handling for packaged runs
- Packaging metadata/assets required by `electron-builder` for Windows, macOS, and Linux targets

## Out of scope

- Dockerized sidecar deployment
- GPU-enabled packaged builds
- Windows arm64 or Linux arm64 targets
- Bundling Gemma or Kokoro weights directly inside the installer
- Full CI/CD release automation in the MVP milestone
- Automatic updates in the MVP milestone
- Installer size optimization
- App store distribution (Mac App Store, Microsoft Store, Snap, Flatpak)

## Current codebase facts this spec builds on

- `electron-builder` is already present in `package.json`
- The current sidecar launcher depends on `sidecar/.venv` and a local Python interpreter
- Gemma is already downloaded lazily through `huggingface_hub` in `sidecar/inference/engine.py`
- Kokoro assets are currently downloaded by `scripts/download-models.mjs`
- The app already communicates with the sidecar over `ws://localhost:8321/ws`

## Proposed solution

> **Note:** The solution below reflects the 2026-05-01 revision. See the Revision section above for context.

### Inference strategy
- **Primary (macOS, Linux, Windows + WSL2):** LiteRT-LM via the existing Python sidecar — fastest option, Gemma-4-optimised, stateful KV cache
- **Fallback (Windows without WSL2):** llamafile (Mozilla AI, llama.cpp-based) — single binary, works natively on Windows, no Python required; somewhat slower than LiteRT-LM
- `INFERENCE_BACKEND=litert|llamafile` env var selects the path; `sidecarBridge.ts` delegates to the appropriate client
- The llamafile binary and GGUF model are downloaded by `npm run setup:llamafile` (`scripts/setup-llamafile.mjs`) into `llamafile/bin/` and `llamafile/models/`
- For packaged distribution: download assets to `app.getPath('userData')` on first launch; do not bundle inside the installer

### TTS strategy
- Investigate whether Piper TTS (pre-built cross-platform binary) can replace the Python `kokoro-onnx` pipeline
- If Piper TTS voice quality is acceptable, ship it as a second downloaded binary alongside llama-server
- If not, freeze `kokoro-onnx` + `fastapi` as a minimal Python TTS sidecar using PyInstaller (Linux/Mac/Windows separately in CI)
- Decision deferred until the TTS investigation track in `distribution-backend-migration-spec.md`

### Model strategy
- Do not ship Gemma or TTS model files inside installers
- On first launch, detect missing assets and show an in-app setup/download screen
- Store all downloaded assets in OS-writable user directories under `app.getPath('userData')`
- Use a manifest file to track which versions of each asset are present

### Runtime strategy
- Keep the existing WebSocket-based renderer ↔ main IPC protocol **unchanged** — `wsClient.ts`, `sidecarBridge.ts`, and all renderer code require zero modifications
- On the llamafile path, a lightweight Node.js WebSocket proxy (`scripts/llamafile-proxy.mjs`) sits between Electron and llamafile: it speaks the identical sidecar WebSocket protocol inbound and translates to llamafile's REST/SSE API outbound
- Electron main selects which process to spawn via `INFERENCE_BACKEND=litert|llamafile`; both paths present the same WebSocket interface on the same port
- In development mode, `npm run dev:full` continues to use the Python sidecar via `.venv` (no change for contributors)
- CPU-only for MVP; CUDA (Windows/Linux) and Metal (macOS) are stretch goals once CPU path is stable

## Execution track map

The implementation is split across three sub-specs. This file remains the overarching decision record.

| Track | Spec | Goal |
|---|---|---|
| **DM0–DM3** — backend migration | [`distribution-backend-migration-spec.md`](distribution-backend-migration-spec.md) | Add llamafile as an additive fallback backend for Windows (no WSL2); LiteRT-LM remains primary on macOS/Linux/WSL2 |
| **DP0–DP3** — packaging | [`distribution-packaging-spec.md`](distribution-packaging-spec.md) | electron-builder config, first-run download, installers |
| **DC0–DC2** — CI/CD | [`distribution-cicd-spec.md`](distribution-cicd-spec.md) | GitHub Actions matrix builds and distribution channel |

## Interface contract

### 1. Sidecar runtime resolution

Electron main must support two sidecar execution modes:

- `dev` — launch via the existing venv-based Python flow
- `bundled` — launch a packaged sidecar executable from the app resources directory

Proposed internal runtime config:

- `mode: 'dev' | 'bundled'`
- `command: string`
- `args: string[]`
- `cwd: string`

### 2. Model bootstrap contract

If model/bootstrap UI is implemented in the renderer, the following IPC additions are the approved default contract:

| Direction | Channel | Payload |
|---|---|---|
| Renderer → Main | `models:get-status` | — |
| Main → Renderer | `models:status` | `{ ready: boolean, missing: ModelAssetId[], downloadInProgress: boolean }` |
| Renderer → Main | `models:download` | `{ assets?: ModelAssetId[] }` |
| Main → Renderer | `models:download-progress` | `{ asset: ModelAssetId, receivedBytes: number, totalBytes?: number, percent?: number }` |
| Main → Renderer | `models:download-complete` | `{ asset: ModelAssetId }` |
| Main → Renderer | `models:download-error` | `{ asset?: ModelAssetId, message: string }` |

Approved shared type:

- `type ModelAssetId = 'gemma-model' | 'kokoro-model' | 'kokoro-voices'`

### 3. Writable path contract

Packaged builds must write all mutable assets into user-local storage.

Approved path policy:

- Electron app data root: `app.getPath('userData')`
- LiteRT cache: under user data, passed via `LITERT_CACHE_DIR`
- Hugging Face cache: under user data, passed via `HF_HOME`
- Kokoro files: under user data, passed via `KOKORO_MODEL_PATH` and `KOKORO_VOICES_PATH`

Potential packaged-runtime env vars passed from Electron to the sidecar:

- `DELFIN_USER_DATA_DIR`
- `HF_HOME`
- `LITERT_CACHE_DIR`
- `KOKORO_MODEL_PATH`
- `KOKORO_VOICES_PATH`

### 4. Packaging output contract

MVP distribution artifacts must target:

- Windows x64 → NSIS installer `.exe`
- macOS x64 → `.dmg`
- macOS arm64 → `.dmg`
- Linux x64 → `.AppImage`
- Linux x64 `.deb` is optional for MVP if AppImage lands first

## Acceptance criteria

- A student can install Delfin on each supported target platform without installing Node.js, Python, or creating a venv
- The packaged app launches the bundled sidecar rather than looking for `sidecar/.venv`
- On a clean machine with no model cache, first launch shows a clear setup/download flow instead of failing silently
- After setup completes, the packaged app can complete one real inference turn end-to-end
- Downloaded model/cache files are stored in a writable user-local location
- Existing development commands still work for contributors
- Packaging commands generate installable artifacts for each MVP target
- Manual clean-machine smoke tests pass on Windows x64, macOS x64, macOS arm64, and Linux x64

## Risks and open questions

1. **Gemma 4 GGUF quality vs LiteRT-LM**: GGUF Q4_K_M quantisation may produce lower quality outputs or slower throughput than LiteRT-LM's native format. The inference benchmarking spec (`inference-benchmarking-spec.md`) must be run and reviewed before the backend migration is finalised.
2. **TTS backend decision**: Piper TTS may not match Kokoro voice quality; the TTS investigation in `distribution-backend-migration-spec.md` resolves this. The migration may need a fallback path.
3. **llama-server API stability**: llama.cpp uses build numbers (not semantic versions); downstream API changes are possible. Pin to a tested build number and test on upgrade.
4. **Hugging Face access friction**: GGUF model downloads from `ggml-org` do not require login or license acceptance (unlike the gated LiteRT model). This is an improvement over the original plan, but network failures still need graceful UX.
5. **Code signing and notarization**: MVP is testable without signing. macOS Gatekeeper will block unsigned apps on clean machines unless the user explicitly allows them. Windows Defender SmartScreen shows a warning for unsigned `.exe` installers. Both are deferred to the hardening track in `distribution-packaging-spec.md`.
6. **espeak-ng path**: the current WSL2 espeak-ng binary patch in `sidecar/tts.py` becomes irrelevant if TTS moves to Piper. If kokoro-onnx is retained, a proper data-path solution is needed in the frozen bundle.

## Verification checklist for implementation

Sub-spec checklists are definitive. This high-level checklist covers the end-to-end milestone:

- [ ] Inference benchmark shows llama-server is acceptable vs LiteRT-LM (see `inference-benchmarking-spec.md`)
- [ ] TTS backend decision is made (Piper or frozen kokoro-onnx)
- [ ] Packaged Electron app can launch llama-server and complete one real prompt on all three target platforms
- [ ] First-run download flow works on a clean machine with no existing model cache
- [ ] `npm run dev:full` still works for contributors using the original Python sidecar
- [ ] Windows x64 NSIS installer installs and launches successfully
- [ ] macOS x64 and arm64 DMG installs and launches successfully
- [ ] Linux x64 AppImage launches successfully
- [ ] CI/CD produces platform artifacts automatically on push to a release branch
