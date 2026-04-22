# Desktop Distribution MVP Spec — Gate 1 Approved

> Gate 1 spec for making Delfin installable by student testers as a normal desktop app. This feature is documented under `docs/features/` because it is an independent, cross-cutting delivery track rather than the next numbered product phase.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 approved — ready for implementation |
| **Approval date** | 2026-04-22 |
| **Approver** | Human reviewer |
| **Bundle identifier** | `com.delfin.desktop` |
| **Target platforms** | Windows x64 (native), macOS x64, macOS arm64, Linux x64 |
| **Packaging decision** | Native Electron installers with a bundled frozen Python sidecar |
| **Model delivery** | First-run Hugging Face download (liteRT-LM targets); Ollama `pull` (Windows native fallback) |
| **Inference scope** | CPU-only for MVP |
| **Deferred by approval** | Docker, GPU packaged builds, full CI/CD publishing, auto-update implementation |

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
- `sidecar/inference/ollama_backend.py` — Ollama HTTP client for Windows native fallback (multi-modal image + text)
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
- **liteRT-LM is not available on native Windows** (WSL2 is required). This spec introduces Ollama as the Windows-native inference backend.

## Proposed solution

### Packaging strategy
- Freeze the Python sidecar with PyInstaller into a platform-specific executable or app folder
- Bundle that frozen sidecar inside the Electron app using `electron-builder` resources
- In packaged builds, Electron launches the bundled sidecar instead of a Python venv
- In development, the current `sidecar/.venv` path remains the default

### Model strategy
- Do not ship Gemma or Kokoro model files inside installers
- On first launch, detect missing assets and guide the user through an in-app setup flow
- Store model/cache assets in OS-writable user directories, not inside the installed app bundle

### Runtime strategy
- Keep the existing WebSocket protocol between renderer and sidecar
- Add a packaged-runtime path resolver in Electron main
- Keep CPU as the only packaged inference target for MVP
- Treat auto-update as a follow-up track after packaging is stable

### Windows inference strategy (Ollama fallback)
- **Native Windows** does not support liteRT-LM (it currently requires WSL2).
- On Windows, the sidecar uses an **Ollama HTTP backend** as the inference engine instead of `litert_lm.Engine`.
- The sidecar connects to a local Ollama instance at `http://localhost:11434` (or the env-configured `OLLAMA_HOST`).
- The Ollama backend sends the same `{ text, image_blob, preset_id }` payloads to Ollama’s `/api/generate` or `/api/chat` endpoint and translates the response into the existing WebSocket `type: "content"` / `type: "done"` stream.
- On first launch, the bootstrap flow checks whether Ollama is installed and running; if not, it guides the user to install it (or offers a one-click `ollama pull gemma3:4b` if Ollama is present but the model is missing).
- TTS remains server-side Kokoro (ONNX) on Windows — Ollama replaces only the text-inference layer, not audio generation.

## Execution track map

| Track | Goal | Primary output |
|---|---|---|
| **D0a** — liteRT feasibility spike | Prove LiteRT-LM + current Python deps can be frozen successfully | Working frozen sidecar with `/health` (macOS / Linux) |
| **D0b** — Ollama backend spike | Prove Ollama HTTP backend can replace liteRT-LM on Windows and stream the same WebSocket messages | Working sidecar on Windows x64 native that chats via Ollama |
| **D1** — bundled sidecar runtime | Launch bundled sidecar from packaged Electron builds | Packaged app starts sidecar without Python |
| **D2** — first-run bootstrap UX | Replace manual setup scripts for end users with in-app setup | Download/setup screen with retries |
| **D3** — cross-platform installers | Produce installable artifacts for supported OS targets | NSIS, DMG, AppImage / optional `.deb` |
| **D4** — platform hardening | Reduce student friction on real machines | Permissions/signing/notarization checklist |
| **D5** — release operations | Make shipping repeatable | Release checklist and future CI notes |
| **D6** — auto-update assessment | Decide whether and how to adopt `electron-updater` | Written recommendation or follow-up spec |

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
- `OLLAMA_HOST` (default `http://localhost:11434`)
- `OLLAMA_MODEL` (default `gemma3:4b`)
- `INFERENCE_BACKEND` (`litert` | `ollama`, platform-selected at runtime)

### 4. Ollama backend contract

When `INFERENCE_BACKEND=ollama` (Windows native default), the sidecar must:

1. Query Ollama `/api/tags` on startup to confirm the model is present.
2. If missing, return `{"type": "error", "message": "Ollama model not found. Run: ollama pull <model>"}` over WebSocket on the first turn.
3. On each turn, POST `{ model, messages, stream: true }` to Ollama `/api/chat` or `/api/generate`.
4. Stream partial text back to the renderer as `{"type": "content", "text": "..."}` chunks.
5. Emit `{"type": "done"}` when the Ollama stream closes successfully.
6. Re-use the existing prompt template (from `presets.py`) as the system prompt passed in the first `messages` entry.

The WebSocket message contract visible to the renderer remains **identical** regardless of backend. No renderer changes are required to switch between liteRT-LM and Ollama.

### 5. Packaging output contract

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
- On native Windows, the app detects or guides the user to install Ollama, pulls the default model, and uses the Ollama backend for inference

## Risks and open questions

1. **Freezing LiteRT-LM:** the main technical risk is whether PyInstaller can package `litert-lm-api-nightly` and all native dependencies cleanly on every target OS.
2. **Ollama dependency on Windows:** the Ollama backend requires the user to have Ollama installed and running. We must handle the case where it is missing, outdated, or the model pull fails (network, disk space). The bootstrap UX needs a clear path to install Ollama or switch to liteRT-LM via WSL2.
3. **espeak-ng packaging:** the current WSL2/Linux fix may need to become a proper packaged-data path for frozen sidecar builds.
4. **Hugging Face access friction:** if Gemma download requires license acceptance or login on some machines, the setup UX will need a clear fallback/error path.
5. **Download progress fidelity:** Gemma progress may be coarse if download remains fully inside `huggingface_hub`; Electron-managed progress may be needed later.
6. **Code signing and notarization:** MVP may be testable without full signing, but public-friendly releases will eventually need macOS notarization and Windows code signing.

## Verification checklist for implementation

- [ ] D0a spike produces a frozen sidecar that responds successfully at `/health` on macOS / Linux
- [ ] D0b spike produces a sidecar on Windows that streams a real turn through Ollama over WebSocket
- [ ] Packaged Electron app can launch the bundled sidecar on at least one platform before broad rollout
- [ ] First-run bootstrap works on a clean machine with no existing HF/Kokoro cache
- [ ] One real prompt succeeds in a packaged build after bootstrap completes
- [ ] `npm run dev:full` still works for local development
- [ ] Windows installer installs and launches successfully with Ollama backend
- [ ] macOS x64 and arm64 builds install and launch successfully with liteRT-LM backend
- [ ] Linux x64 AppImage launches successfully with liteRT-LM backend
- [ ] Release checklist and future CI notes are documented before calling the feature ready
