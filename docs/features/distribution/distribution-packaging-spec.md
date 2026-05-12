# Distribution — Packaging Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.
> Depends on `distribution-backend-migration-spec.md` tracks DM0–DM3 being complete.

## Gate Resolution

| Field          | Value                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **Status**     | ✅ Complete (DP0–DP2)                                                                                          |
| **Created**    | 2026-05-01                                                                                                      |
| **Revised**    | 2026-05-02 (per-platform backend strategy; llamafile proxy for Windows)                                         |
| **Revised**    | 2026-05-03 (Windows: llamafile → LiteRT-LM C++)                                                                 |
| **Revised**    | **2026-05-06 (DP0–DP2 implemented; unified LiteRT-LM C++ bridge across all 3 platforms; DP3 superseded)**      |
| **Depends on** | `distribution-backend-migration-spec.md` (DM0–DM3 complete)                                                     |
| **Blocks**     | `distribution-cicd-spec.md`                                                                                     |

## Goal

Package Delfin as a native installable desktop application for Windows x64, macOS x64, macOS arm64, and Linux x64. The packaged app must download required binaries and models at first run, launch them automatically, and present a first-run setup screen while downloads are in progress.

---

## Per-platform backend strategy

> **Revised 2026-05-06:** macOS arm64 and Linux x64 now use the LiteRT-LM C++ bridge in packaged builds, matching the Windows approach established in 2026-05-03. The frozen Python sidecar (PyInstaller) is **removed from the distribution MVP scope** (see DP3 below). The Python sidecar remains available as a developer fallback via `npm run dev:sidecar`.

### Current strategy (2026-05-06)

| Platform        | Packaged inference backend              | Sidecar delivery |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| **Windows x64** | LiteRT-LM C++ + `litert-cpp-proxy.mjs` | `delfin_litert_bridge.exe` + `libGemmaModelConstraintProvider.dll` bundled as app resources |
| **macOS arm64** | LiteRT-LM C++ + `litert-cpp-proxy.mjs` | `delfin_litert_bridge` + `libGemmaModelConstraintProvider.dylib` bundled as app resources |
| **Linux x64**   | LiteRT-LM C++ + `litert-cpp-proxy.mjs` | `delfin_litert_bridge` + `libGemmaModelConstraintProvider.so` bundled as app resources |

On all three platforms: `.litertlm` model and Piper voice downloaded at first run. No Python runtime on the user's machine is required.

The LiteRT-LM C++ source tree, Bazelisk/Bazel, and compiler toolchain are **CI/developer-only** build inputs — end users receive only prebuilt bridge binaries.

`INFERENCE_BACKEND` is set at **build time** by electron-builder (not a user-facing setting):

- All packaged builds: `INFERENCE_BACKEND=litert-cpp`

**Developer note:** `npm run dev:sidecar` and `npm run dev` continue to use the Python sidecar for contributors who prefer the Python-backed dev workflow on macOS/Linux/WSL2.

---

### Previous strategy (2026-05-03, superseded)

~~macOS arm64 / x64 and Linux x64 used LiteRT-LM (frozen Python sidecar via PyInstaller); `INFERENCE_BACKEND=litert` for macOS/Linux builds.~~ Superseded by the 2026-05-06 revision above.

### Previous strategy (2026-05-02, superseded)

~~llamafile + `llamafile-proxy.mjs` on Windows; LiteRT-LM frozen Python sidecar on macOS/Linux. `INFERENCE_BACKEND=llamafile` for Windows builds.~~ Superseded by the 2026-05-03 revision.

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
    "directories": { "output": "dist/installers" },
    "files": ["dist/electron/**/*", "dist/sidecar/**/*"],
    "extraResources": [
      { "from": "dist/electron/main/litert-cpp-proxy.mjs", "to": "litert-cpp-proxy.mjs" },
      { "from": "scripts/litert-cpp-presets.mjs", "to": "litert-cpp-presets.mjs" }
    ],
    "mac": {
      "target": [{ "target": "dmg", "arch": ["arm64"] }],
      "icon": "build/icon.icns",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "extraResources": [
        { "from": "bin/delfin_litert_bridge", "to": "delfin_litert_bridge" },
        { "from": "bin/libGemmaModelConstraintProvider.dylib", "to": "libGemmaModelConstraintProvider.dylib" }
      ],
      "env": { "INFERENCE_BACKEND": "litert-cpp" }
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
        { "from": "bin/delfin_litert_bridge", "to": "delfin_litert_bridge" },
        { "from": "bin/libGemmaModelConstraintProvider.so", "to": "libGemmaModelConstraintProvider.so" }
      ],
      "env": { "INFERENCE_BACKEND": "litert-cpp" }
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

> **Revised 2026-05-06:** All three packaged platforms now download `.litertlm` model + Piper voice at first run. Kokoro TTS is no longer a packaged-build first-run asset (it remains in the dev sidecar). Bridge binaries and the proxy script are bundled inside the installer as `extraResources` on all three platforms.

| Platform      | First-run downloaded assets                                             | Approx size |
| ------------- | ----------------------------------------------------------------------- | ----------- |
| Windows x64   | `gemma-4-E2B-it.litertlm` model + Piper voice (`.onnx` + `tokens.txt`) | ~2 GB       |
| macOS arm64   | `gemma-4-E2B-it.litertlm` model + Piper voice (`.onnx` + `tokens.txt`) | ~2 GB       |
| Linux x64     | `gemma-4-E2B-it.litertlm` model + Piper voice (`.onnx` + `tokens.txt`) | ~2 GB       |

The bridge binary (`delfin_litert_bridge[.exe]`), shared library (`libGemmaModelConstraintProvider[.dll/.dylib/.so]`), `litert-cpp-proxy.mjs`, and `litert-cpp-presets.mjs` are bundled inside the installer as `extraResources` — not downloaded by the user.

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

| Asset                        | Source                                                                | Platforms |
| ---------------------------- | --------------------------------------------------------------------- | --------- |
| `gemma-4-E2B-it.litertlm`   | HuggingFace: `litert-community/gemma-4-E2B-it-litert-lm` (pinned revision via `MODEL_REVISION`) | All |
| Piper voice `.onnx` + tokens | HuggingFace: `rhasspy/piper-voices`                                   | All       |

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
                                └─ Main: spawn litert-cpp-proxy.mjs (all platforms)
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

### Track DP2 — packaged backend launch _(revised 2026-05-06)_

When `app.isPackaged`, Electron spawns `scripts/litert-cpp-proxy.mjs` on **all three platforms** from the app's resources directory. The proxy then launches the platform-appropriate bridge binary.

```ts
// All packaged builds (Windows / macOS / Linux):
// prod:  spawn litert-cpp-proxy.mjs from process.resourcesPath
//        LITERT_CPP_BIN=<process.resourcesPath>/delfin_litert_bridge[.exe]
//        LITERT_CPP_MODEL=<userData>/models/gemma-4-E2B-it.litertlm
//        LITERT_CPP_TTS_BACKEND=piper  (voice in userData/models/tts/)

// Dev mode (macOS / Linux / WSL2):
//   npm run dev:sidecar  → spawns Python uvicorn via sidecar/.venv

// Dev mode (Windows native):
//   npm run dev:backend  → spawns scripts/litert-cpp-proxy.mjs directly
```

`scripts/litert-cpp-proxy.mjs`, `scripts/litert-cpp-presets.mjs`, and the platform bridge binary + shared library are all bundled as `extraResources`. Node.js is embedded in Electron, so the proxy is spawned via Electron's own runtime. The LiteRT-LM C++ source tree and compiler toolchain are CI-only — never present on the user's machine.

**Runtime mode detection (2026-05-06):**

```ts
const isPackaged = app.isPackaged;
// isPackaged  → LiteRT-LM C++ path (bridge + proxy from resources; model from userData) — all platforms
// !isPackaged → dev:backend (Windows) or dev:sidecar / dev (macOS / Linux / WSL2)
```

### Track DP3 — frozen Python sidecar _(superseded 2026-05-06)_

> **Superseded.** The PyInstaller frozen Python sidecar is no longer part of the distribution MVP. The LiteRT-LM C++ bridge (`delfin_litert_bridge`) is now the packaged backend on macOS arm64 and Linux x64, produced by `build-litert-cpp-bridge.yml` CI workflow. The Python sidecar (`sidecar/`) remains in the repository as a **developer fallback** only — it is not included in any packaged installer.

~~PyInstaller build producing `delfin-sidecar` for macOS arm64, macOS x64, and Linux x64.~~ No longer in scope.

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
// Revised 2026-05-06: unified across all three packaged platforms
type ModelAssetId =
  | "litert-cpp-model" // All platforms: gemma-4-E2B-it.litertlm (downloaded at first run)
  | "piper-voice";     // All platforms: Piper voice .onnx + tokens (downloaded at first run)
```

### Writable path layout

```
app.getPath('userData')/           e.g. %APPDATA%\Delfin\  or  ~/Library/Application Support/Delfin/
  manifest.json
  models/
    gemma-4-E2B-it.litertlm        (all platforms — downloaded at first run)
    tts/
      <voice>.onnx                 (all platforms — Piper voice)
      <voice>.onnx.json
  cache/
    litert/                        (all — LiteRT model cache)
```

Bridge binary, shared library, `litert-cpp-proxy.mjs`, and `litert-cpp-presets.mjs` live at `process.resourcesPath/` (bundled in installer on all three platforms) — not in `userData`.

---

## Acceptance criteria

- [ ] `npm run dist` produces platform installer(s) for the current OS without error
- [ ] Installing the Windows `.exe` on a clean machine shows SetupScreen; model + Piper voice downloads complete; app runs a prompt end-to-end via LiteRT-LM C++ bridge
- [ ] Installing the macOS arm64 DMG on a clean machine shows SetupScreen; model + Piper voice downloads complete; app runs a prompt end-to-end via LiteRT-LM C++ bridge
- [ ] Installing the Linux AppImage on a clean machine shows SetupScreen; model + Piper voice downloads complete; app runs a prompt end-to-end via LiteRT-LM C++ bridge
- [ ] Vision prompt (screenshot) works on all three packaged builds (LiteRT-LM C++ bridge + vision input)
- [ ] Piper TTS produces audio on all three packaged builds
- [ ] `npm run dev:sidecar` and `npm run dev` still work for contributors on macOS/Linux/WSL2 (Python sidecar dev fallback)
- [ ] Manifest checksum verification passes; tampered files are re-downloaded
- [ ] `INFERENCE_BACKEND=litert-cpp` is baked into all three packaged builds; it is not user-visible

---

## Risks / open questions

1. **Code signing — macOS**: without notarization, Gatekeeper blocks the app on first launch. For student testers, right-click → Open works with instructions. For public distribution, an Apple Developer account ($99/yr) and notarization CI step are required.
2. **Code signing — Windows**: unsigned NSIS installers trigger Windows Defender SmartScreen ("More info → Run anyway"). Defer EV signing to post-MVP.
3. **macOS runtime validation**: the C++ bridge binaries for macOS arm64 are produced by CI but have not yet been runtime-validated on a packaged macOS build. Validation is a prerequisite for calling DP2 complete on macOS.
4. **Linux runtime validation**: same as above for Linux x64.
5. **`.litertlm` model download size**: Gemma 4 E2B `.litertlm` is ~2 GB. `assetManager` must implement HTTP range request resumption or retry-from-zero with a `.part` temp file for interrupted downloads.
6. **HuggingFace rate limits**: large downloads from HF may be rate-limited. Use direct HTTPS; support `HF_TOKEN` env var for authenticated downloads if needed.
7. **Piper binary availability on macOS/Linux**: Piper publishes prebuilt binaries for `darwin-arm64` and `linux-x64`. Confirm that the Piper version pinned by `npm run voice:install` has arm64 macOS and Linux x64 releases before finalising the first-run download manifest.

## Future todos (post-MVP)

- [ ] **Auto-update**: assess `electron-updater` for app binary updates; separate from model/binary updates
- [ ] **Model switcher**: allow users to download and switch between E2B and E4B model variants in settings
- [ ] **Resume downloads**: HTTP range resumption in `assetManager` for large GGUF files
- [ ] **GPU acceleration (Windows)**: pass `LITERT_CPP_BACKEND=GPU` when NVIDIA GPU is detected; validate with packaged build
