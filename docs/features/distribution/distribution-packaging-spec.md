# Distribution — Packaging Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.
> Depends on `distribution-backend-migration-spec.md` tracks DM0–DM3 being complete.

## Gate Resolution

| Field          | Value                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **Status**     | Gate 1 — awaiting approval                                                                                      |
| **Created**    | 2026-05-01                                                                                                      |
| **Revised**    | 2026-05-02 (per-platform backend strategy; llamafile proxy for Windows)                                         |
| **Revised**    | **2026-05-03 (Windows: llamafile → LiteRT-LM C++ — see Per-platform backend strategy revision below)**         |
| **Depends on** | `distribution-backend-migration-spec.md` (DM0–DM3 complete; DM0 now means LiteRT-LM C++ proxy wiring)          |
| **Blocks**     | `distribution-cicd-spec.md` (CI builds the output of this track)                                               |

## Goal

Package Delfin as a native installable desktop application for Windows x64, macOS x64, macOS arm64, and Linux x64. The packaged app must download required binaries and models at first run, launch them automatically, and present a first-run setup screen while downloads are in progress.

---

## Per-platform backend strategy

> **Revised 2026-05-03:** The Windows backend has changed from llamafile to LiteRT-LM C++. The LiteRT-LM C++ bridge passed runtime validation on Windows (text, vision, audio, KV-cache) as of 2026-05-03. The "future state" conditional from the 2026-05-02 revision is now the current state.

### Current strategy (2026-05-03)

| Platform              | Packaged inference backend                    | Sidecar delivery                                                                             |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Windows x64**       | LiteRT-LM C++ + `litert-cpp-proxy.mjs`        | `delfin_litert_bridge.exe` + `libGemmaModelConstraintProvider.dll` bundled as app resources; `.litertlm` model downloaded at first run; Piper voice downloaded at first run |
| **macOS arm64 / x64** | LiteRT-LM (frozen Python sidecar)             | Frozen Python sidecar bundled in installer (PyInstaller)                                     |
| **Linux x64**         | LiteRT-LM (frozen Python sidecar)             | Frozen Python sidecar bundled in installer (PyInstaller)                                     |

The LiteRT-LM C++ source tree, Bazelisk/Bazel, and Visual Studio C++ toolchain are **CI/developer-only** build inputs. End users receive the prebuilt bridge executable and DLL and never need compiler tooling.

`INFERENCE_BACKEND` is set at **build time** by electron-builder (not a user-facing setting):

- Windows builds: `INFERENCE_BACKEND=litert-cpp`
- macOS/Linux builds: `INFERENCE_BACKEND=litert`

**Windows note:** Both WSL2 and non-WSL2 Windows users get the LiteRT-LM C++ backend in the packaged app — no WSL2 requirement. WSL2 users who want the Python sidecar dev path can run from source with `npm run dev:full`.

---

### Previous strategy (2026-05-02, superseded)

~~llamafile + `llamafile-proxy.mjs` on Windows; LiteRT-LM frozen Python sidecar on macOS/Linux. `INFERENCE_BACKEND=llamafile` for Windows builds.~~ Superseded by the 2026-05-03 revision above.

---

## Scope

### Track DP0 — electron-builder configuration

| File                           | Change                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `package.json`                 | Add `build` config block for `electron-builder`; add `npm run dist` and `npm run dist:dir` scripts |
| `build/`                       | New directory: icons and installer assets                                                          |
| `build/icon.png`               | 512×512 app icon (PNG, used for Linux and as source for other formats)                             |
| `build/icon.icns`              | macOS icon set                                                                                     |
| `build/icon.ico`               | Windows icon                                                                                       |
| `build/entitlements.mac.plist` | macOS entitlements (network access, child process execution)                                       |

**electron-builder config shape (inside `package.json`):**

```json
{
  "build": {
    "appId": "com.delfin.desktop",
    "productName": "Delfin",
    "directories": { "output": "dist" },
    "files": ["out/**/*"],
    "extraResources": [
      { "from": "scripts/litert-cpp-proxy.mjs", "to": "litert-cpp-proxy.mjs" },
      { "from": "scripts/litert-cpp-presets.mjs", "to": "litert-cpp-presets.mjs" }
    ],
    "mac": {
      "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
      "icon": "build/icon.icns",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "extraResources": [
        { "from": "sidecar-bin/mac/delfin-sidecar", "to": "delfin-sidecar" }
      ]
    },
    "win": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "icon": "build/icon.ico",
      "extraResources": [
        { "from": "bin/delfin_litert_bridge.exe", "to": "delfin_litert_bridge.exe" },
        { "from": "bin/libGemmaModelConstraintProvider.dll", "to": "libGemmaModelConstraintProvider.dll" }
      ],
      "env": { "INFERENCE_BACKEND": "litert-cpp" }
    },
    "linux": {
      "target": [{ "target": "AppImage", "arch": ["x64"] }],
      "icon": "build/icon.png",
      "category": "Education",
      "extraResources": [
        { "from": "sidecar-bin/linux/delfin-sidecar", "to": "delfin-sidecar" }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowDirChange": true,
      "installerIcon": "build/icon.ico"
    }
  }
}
```

### Track DP1 — first-run download orchestration

On first launch the app checks for required assets and downloads anything missing to `app.getPath('userData')`. Downloads are triggered by the user from a SetupScreen and reported to the renderer via IPC.

#### Assets by platform

> **Revised 2026-05-03:** Windows assets are now `.litertlm` model + Piper voice. The bridge executable and proxy script are bundled inside the installer as `extraResources` (not downloaded at first run).

| Platform      | First-run downloaded assets                                           | Approx size |
| ------------- | --------------------------------------------------------------------- | ----------- |
| Windows       | `gemma-4-E2B-it.litertlm` model + Piper voice (`.onnx` + `tokens.txt`) | ~2 GB     |
| macOS / Linux | `gemma-4-E2B-it.litertlm` model + Kokoro TTS model                   | ~3.5 GB     |

`delfin_litert_bridge.exe`, `libGemmaModelConstraintProvider.dll`, `litert-cpp-proxy.mjs`, and `litert-cpp-presets.mjs` are bundled inside the installer as `extraResources` — not downloaded by the user.

On macOS/Linux the frozen sidecar binary is also bundled inside the installer (no first-run binary download), but the Gemma model is still downloaded at first run to keep installer size small.

#### Download manifest

A JSON manifest is stored at `<userData>/manifest.json`:

```json
{
  "schema": 1,
  "platform": "win32",
  "assets": {
    "litert-cpp-model": {
      "version": "gemma-4-E2B-it-20250501",
      "path": "models/gemma-4-E2B-it.litertlm",
      "sha256": "...",
      "downloaded": false
    },
    "tts-model": {
      "path": "models/tts/",
      "sha256": "...",
      "downloaded": false
    }
  }
}
```

#### Download sources

| Asset                          | Source                                                                    | Platforms     |
| ------------------------------ | ------------------------------------------------------------------------- | ------------- |
| `gemma-4-E2B-it.litertlm`      | HuggingFace: `google/gemma-4-E2B-it-litert-lm` (or mirrored release)     | All           |
| Piper voice `.onnx` + tokens   | HuggingFace: `rhasspy/piper-voices`                                       | Windows       |
| Kokoro TTS model               | HuggingFace: kokoro model repo                                            | macOS / Linux |

#### IPC flow during first run

```
App launch
  └─ Main: check manifest → assets missing
       └─ Main → Renderer: models:status { ready: false, missing: [...] }
            └─ Renderer: show SetupScreen
                 └─ User clicks "Download"
                      └─ Renderer → Main: models:download
                           ├─ Main downloads each asset sequentially
                           ├─ Main → Renderer: models:download-progress { asset, percent, receivedBytes, totalBytes }
                           ├─ Main → Renderer: models:download-complete { asset }
                           └─ All done → Main → Renderer: models:status { ready: true }
                                └─ Main: spawn backend (llamafile or frozen sidecar)
                                     └─ Renderer: navigate to HomeScreen
```

#### Files modified / created

| File                                          | Change                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `src/main/index.ts`                           | First-run check before window show; gate backend spawn on asset readiness |
| `src/main/sidecar/assetManager.ts`            | New: reads/writes manifest, downloads assets, verifies checksums          |
| `src/main/ipc/handlers.ts`                    | Add handlers for `models:get-status` and `models:download`                |
| `src/renderer/features/setup/SetupScreen.tsx` | New: download progress UI shown on first run                              |
| `src/renderer/navigation/router.tsx`          | Add `/setup` route; redirect when `models:status` returns `ready: false`  |
| `src/shared/types.ts`                         | Add `ModelAssetId`, `ModelStatus`, `DownloadProgress` types               |
| `src/shared/schemas.ts`                       | Add Zod schemas for new IPC payloads                                      |

### Track DP2 — packaged backend launch

When `app.isPackaged`, Electron spawns the appropriate backend from user data / bundled resources rather than the dev-mode scripts.

#### Windows (LiteRT-LM C++ path) _(revised 2026-05-03)_

```ts
// dev:   node scripts/litert-cpp-proxy.mjs  (npm run dev:litert-cpp)
// prod:  spawn litert-cpp-proxy.mjs from app resources (process.resourcesPath)
//        pass LITERT_CPP_BIN=<process.resourcesPath>/delfin_litert_bridge.exe
//        pass LITERT_CPP_MODEL=<userData>/models/gemma-4-E2B-it.litertlm
//        pass LITERT_CPP_TTS_BACKEND=piper  (voice in userData/models/tts/)
```

`scripts/litert-cpp-proxy.mjs` and `scripts/litert-cpp-presets.mjs` are bundled as `extraResources` (available at `process.resourcesPath/`). `delfin_litert_bridge.exe` and `libGemmaModelConstraintProvider.dll` are also `extraResources`. Node.js is embedded in Electron, so the proxy can be spawned with Electron's own runtime via `process.execPath` or as a forked process. The LiteRT-LM C++ source tree and compiler toolchain are CI-only — never present on the user's machine.

#### macOS / Linux (LiteRT-LM path)

```ts
// dev:   node scripts/run-sidecar.mjs  (spawns Python uvicorn via .venv)
// prod:  spawn bundled delfin-sidecar binary from process.resourcesPath
```

The frozen sidecar binary (`delfin-sidecar`) is produced by PyInstaller in CI and bundled as an `extraResource`. It embeds Python, LiteRT-LM, kokoro-onnx, and FastAPI — no Python installation required on the user's machine.

**Runtime mode detection:**

```ts
const isPackaged = app.isPackaged;
const platform = process.platform;
// 'win32' + isPackaged  → LiteRT-LM C++ path (bridge exe + proxy from resources; model from userData)
// 'win32' + !isPackaged → LiteRT-LM C++ path (dev: npm run dev:litert-cpp)
// other   + isPackaged  → LiteRT path (frozen sidecar from resources)
// other   + !isPackaged → LiteRT path (dev: npm run dev:sidecar via .venv)
```

### Track DP3 — frozen Python sidecar (macOS / Linux)

PyInstaller build producing `delfin-sidecar` for macOS arm64, macOS x64, and Linux x64. This is a CI-only step; no local build script is needed for development.

| File                          | Change                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `sidecar/delfin-sidecar.spec` | New: PyInstaller spec file targeting `server.py` as entrypoint                                                                |
| `sidecar/server.py`           | Ensure model/cache paths use env vars (`LITERT_CACHE_DIR`, `HF_HOME`, etc.) so the frozen binary writes to writable locations |
| `sidecar/tts.py`              | Ensure espeak-ng and kokoro asset paths are resolved relative to the frozen bundle                                            |

The frozen binary receives configuration via env vars passed from Electron main at spawn time (same pattern as current dev-mode sidecar).

### Track DP4 — GPU stretch goal

After CPU path is validated on all platforms:

- Detect GPU at launch: `nvidia-smi` (NVIDIA/Windows/Linux), Metal (macOS, always available)
- Windows: pass `LITERT_CPP_BACKEND=GPU` to the bridge executable when an NVIDIA GPU is detected (`nvidia-smi` present)
- macOS/Linux: rebuild frozen sidecar with GPU LiteRT-LM backend; or pass `LITERT_BACKEND=GPU` to the existing frozen binary
- Expose a GPU settings toggle in the app

Explicitly conditional — defer if GPU detection adds stability risk.

---

## Out of scope

- Auto-updates (`electron-updater`) — deferred to a follow-up spec
- Mac App Store / Microsoft Store / Snap / Flatpak distribution
- Code signing and notarization automation (manual steps documented in risks)
- Bundling model files inside the installer
- Linux `.deb` (AppImage is the MVP target)
- Windows arm64 or Linux arm64

---

## Interface contract

### IPC channels

| Direction       | Channel                    | Payload                                                                                 |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| Renderer → Main | `models:get-status`        | —                                                                                       |
| Main → Renderer | `models:status`            | `{ ready: boolean, missing: ModelAssetId[], downloadInProgress: boolean }`              |
| Renderer → Main | `models:download`          | `{ assets?: ModelAssetId[] }`                                                           |
| Main → Renderer | `models:download-progress` | `{ asset: ModelAssetId, receivedBytes: number, totalBytes?: number, percent?: number }` |
| Main → Renderer | `models:download-complete` | `{ asset: ModelAssetId }`                                                               |
| Main → Renderer | `models:download-error`    | `{ asset?: ModelAssetId, message: string }`                                             |

### ModelAssetId

```ts
type ModelAssetId =
  | "litert-cpp-model" // Windows: gemma-4-E2B-it.litertlm (downloaded at first run)
  | "gemma-model"      // macOS/Linux: .litertlm model (downloaded at first run)
  | "tts-model";       // All platforms: Piper voice (Windows) or Kokoro model (macOS/Linux)
```

### Writable path layout

```
app.getPath('userData')/           e.g. %APPDATA%\Delfin\  or  ~/Library/Application Support/Delfin/
  manifest.json
  models/
    gemma-4-E2B-it.litertlm        (Windows + macOS/Linux — downloaded at first run)
    tts/
      <voice>.onnx                 (Windows — Piper)
      <voice>.onnx.json
      kokoro-v1.0.onnx             (macOS/Linux — Kokoro)
  cache/
    litert/                        (all — LiteRT model cache)
    hf/                            (macOS/Linux — HuggingFace hub cache)
```

On Windows, `delfin_litert_bridge.exe`, `libGemmaModelConstraintProvider.dll`, `litert-cpp-proxy.mjs`, and `litert-cpp-presets.mjs` live at `process.resourcesPath/` (bundled in installer) — not in `userData`.

---

## Acceptance criteria

- [ ] `npm run dist` produces platform installer(s) for the current OS without error
- [ ] Installing the Windows `.exe` on a clean machine shows SetupScreen; model + Piper voice downloads complete; app runs a prompt end-to-end via LiteRT-LM C++ bridge
- [ ] Installing the macOS DMG on a clean machine shows SetupScreen (model only); app runs a prompt end-to-end via LiteRT-LM frozen sidecar
- [ ] Installing the Linux AppImage on a clean machine completes and runs a prompt via LiteRT-LM frozen sidecar
- [ ] Vision prompt (screenshot) works on Windows packaged build (LiteRT-LM C++ bridge + vision input)
- [ ] `npm run dev:full` still works for contributors on macOS/Linux/WSL2
- [ ] Manifest checksum verification passes; tampered files are re-downloaded
- [ ] `INFERENCE_BACKEND` is not user-visible in packaged builds; correct backend is auto-selected per platform

---

## Risks / open questions

1. **Code signing — macOS**: without notarization, Gatekeeper blocks the app on first launch. For student testers, right-click → Open works with instructions. For public distribution, an Apple Developer account ($99/yr) and notarization CI step are required.
2. **Code signing — Windows**: unsigned NSIS installers trigger Windows Defender SmartScreen ("More info → Run anyway"). Defer EV signing to post-MVP.
3. **PyInstaller frozen sidecar size**: the frozen Python bundle (Python + LiteRT-LM + kokoro-onnx + FastAPI + onnxruntime) will likely be 300–500 MB. This is bundled inside the macOS/Linux installer. Consider splitting TTS into a separately downloaded binary to reduce installer size.
4. **`.litertlm` model download size**: Gemma 4 E2B `.litertlm` is ~2 GB. `assetManager` must implement HTTP range request resumption or retry-from-zero with a `.part` temp file for interrupted downloads.
5. **HuggingFace rate limits**: large downloads from HF may be rate-limited. Use direct HTTPS; support `HF_TOKEN` env var for authenticated downloads if needed.
6. **espeak-ng in frozen kokoro**: the existing `sidecar/tts.py` patches the espeak-ng data path at runtime. In the frozen bundle, this path must resolve relative to the bundle directory, not the source tree.

## Future todos (post-MVP)

- [ ] **Auto-update**: assess `electron-updater` for app binary updates; separate from model/binary updates
- [ ] **Model switcher**: allow users to download and switch between E2B and E4B model variants in settings
- [ ] **Resume downloads**: HTTP range resumption in `assetManager` for large GGUF files
- [ ] **GPU acceleration (Windows)**: pass `LITERT_CPP_BACKEND=GPU` when NVIDIA GPU is detected; validate with packaged build
