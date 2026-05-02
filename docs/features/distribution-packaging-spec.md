# Distribution — Packaging Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.
> Depends on `distribution-backend-migration-spec.md` tracks DM0–DM3 being complete.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 — awaiting approval |
| **Created** | 2026-05-01 |
| **Revised** | 2026-05-02 (per-platform backend strategy; llamafile proxy for Windows) |
| **Depends on** | `distribution-backend-migration-spec.md` (DM0–DM3 complete) |
| **Blocks** | `distribution-cicd-spec.md` (CI builds the output of this track) |

## Goal

Package Delfin as a native installable desktop application for Windows x64, macOS x64, macOS arm64, and Linux x64. The packaged app must download required binaries and models at first run, launch them automatically, and present a first-run setup screen while downloads are in progress.

---

## Per-platform backend strategy

This is the key architectural decision for packaging. The inference backend differs by platform because LiteRT-LM has no Windows native wheel.

| Platform | Packaged inference backend | Sidecar delivery |
|---|---|---|
| **Windows x64** | llamafile + `llamafile-proxy.mjs` | llamafile binary downloaded at first run; proxy bundled as app resource |
| **macOS arm64 / x64** | LiteRT-LM | Frozen Python sidecar bundled in installer (PyInstaller) |
| **Linux x64** | LiteRT-LM | Frozen Python sidecar bundled in installer (PyInstaller) |

**Windows note:** Both WSL2 and non-WSL2 Windows users get the llamafile backend. Reliably bootstrapping LiteRT-LM inside WSL2 from a packaged Electron app is impractical — it would require detecting WSL2, verifying the sidecar is installed there, and spawning processes across the Windows/Linux boundary. WSL2 users who want LiteRT-LM speed can run from source.

`INFERENCE_BACKEND` is set at **build time** by electron-builder (not a user-facing setting):
- Windows builds: `INFERENCE_BACKEND=llamafile`
- macOS/Linux builds: `INFERENCE_BACKEND=litert`

---

## Scope

### Track DP0 — electron-builder configuration

| File | Change |
|---|---|
| `package.json` | Add `build` config block for `electron-builder`; add `npm run dist` and `npm run dist:dir` scripts |
| `build/` | New directory: icons and installer assets |
| `build/icon.png` | 512×512 app icon (PNG, used for Linux and as source for other formats) |
| `build/icon.icns` | macOS icon set |
| `build/icon.ico` | Windows icon |
| `build/entitlements.mac.plist` | macOS entitlements (network access, child process execution) |

**electron-builder config shape (inside `package.json`):**

```json
{
  "build": {
    "appId": "com.delfin.desktop",
    "productName": "Delfin",
    "directories": { "output": "dist" },
    "files": ["out/**/*"],
    "extraResources": [
      { "from": "scripts/llamafile-proxy.mjs", "to": "llamafile-proxy.mjs" },
      { "from": "scripts/llamafile-presets.mjs", "to": "llamafile-presets.mjs" }
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
      "env": { "INFERENCE_BACKEND": "llamafile" }
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

| Platform | Required assets | Approx size |
|---|---|---|
| Windows | llamafile binary, GGUF model, mmproj (vision projector), TTS binary + model | ~4.7 GB |
| macOS / Linux | GGUF model weights (sidecar binary is bundled in installer), TTS model | ~3.5 GB |

Note: on macOS/Linux the frozen sidecar binary is bundled inside the installer itself (no first-run binary download), but the Gemma model is still downloaded at first run to keep installer size small.

#### Download manifest

A JSON manifest is stored at `<userData>/manifest.json`:

```json
{
  "schema": 1,
  "platform": "win32",
  "assets": {
    "llamafile-bin": {
      "version": "0.10.1",
      "path": "bin/llamafile-0.10.1.exe",
      "sha256": "...",
      "downloaded": true
    },
    "gemma-model": {
      "path": "models/google_gemma-4-E2B-it-IQ4_NL.gguf",
      "sha256": "...",
      "downloaded": false
    },
    "mmproj": {
      "path": "models/mmproj-google_gemma-4-E2B-it-f16.gguf",
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

| Asset | Source | Platforms |
|---|---|---|
| llamafile binary | GitHub Releases: `mozilla-ai/llamafile` | Windows only |
| `google_gemma-4-E2B-it-IQ4_NL.gguf` | HuggingFace: `bartowski/google_gemma-4-E2B-it-GGUF` | All |
| `mmproj-google_gemma-4-E2B-it-f16.gguf` | HuggingFace: `bartowski/google_gemma-4-E2B-it-GGUF` | Windows (llamafile vision) |
| TTS binary + model | Piper GitHub releases or HuggingFace (decided in DM4) | All |

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

| File | Change |
|---|---|
| `src/main/index.ts` | First-run check before window show; gate backend spawn on asset readiness |
| `src/main/sidecar/assetManager.ts` | New: reads/writes manifest, downloads assets, verifies checksums |
| `src/main/ipc/handlers.ts` | Add handlers for `models:get-status` and `models:download` |
| `src/renderer/features/setup/SetupScreen.tsx` | New: download progress UI shown on first run |
| `src/renderer/navigation/router.tsx` | Add `/setup` route; redirect when `models:status` returns `ready: false` |
| `src/shared/types.ts` | Add `ModelAssetId`, `ModelStatus`, `DownloadProgress` types |
| `src/shared/schemas.ts` | Add Zod schemas for new IPC payloads |

### Track DP2 — packaged backend launch

When `app.isPackaged`, Electron spawns the appropriate backend from user data / bundled resources rather than the dev-mode scripts.

#### Windows (llamafile path)

```ts
// dev:   node scripts/run-llamafile.mjs  (spawns proxy + llamafile binary)
// prod:  spawn llamafile binary from userData/bin/
//        spawn llamafile-proxy.mjs (from app resources) via Node.js child_process
```

The proxy script (`scripts/llamafile-proxy.mjs`) is bundled as an `extraResource` so it is available at `process.resourcesPath/llamafile-proxy.mjs` in packaged builds. Node.js is already embedded in Electron, so the proxy can be spawned with Electron's own Node runtime via `process.execPath --` or as a forked process.

#### macOS / Linux (LiteRT-LM path)

```ts
// dev:   node scripts/run-sidecar.mjs  (spawns Python uvicorn via .venv)
// prod:  spawn bundled delfin-sidecar binary from process.resourcesPath
```

The frozen sidecar binary (`delfin-sidecar`) is produced by PyInstaller in CI and bundled as an `extraResource`. It embeds Python, LiteRT-LM, kokoro-onnx, and FastAPI — no Python installation required on the user's machine.

**Runtime mode detection:**

```ts
const isPackaged = app.isPackaged
const platform = process.platform
// 'win32' + isPackaged  → llamafile path (binary from userData + proxy from resources)
// 'win32' + !isPackaged → llamafile path (dev: npm run dev:llamafile)
// other   + isPackaged  → LiteRT path (frozen sidecar from resources)
// other   + !isPackaged → LiteRT path (dev: npm run dev:sidecar via .venv)
```

### Track DP3 — frozen Python sidecar (macOS / Linux)

PyInstaller build producing `delfin-sidecar` for macOS arm64, macOS x64, and Linux x64. This is a CI-only step; no local build script is needed for development.

| File | Change |
|---|---|
| `sidecar/delfin-sidecar.spec` | New: PyInstaller spec file targeting `server.py` as entrypoint |
| `sidecar/server.py` | Ensure model/cache paths use env vars (`LITERT_CACHE_DIR`, `HF_HOME`, etc.) so the frozen binary writes to writable locations |
| `sidecar/tts.py` | Ensure espeak-ng and kokoro asset paths are resolved relative to the frozen bundle |

The frozen binary receives configuration via env vars passed from Electron main at spawn time (same pattern as current dev-mode sidecar).

### Track DP4 — GPU stretch goal

After CPU path is validated on all platforms:

- Detect GPU at launch: `nvidia-smi` (NVIDIA/Windows/Linux), Metal (macOS, always available)
- Windows: download GPU-enabled llamafile binary (if separate binary is published) or pass `--n-gpu-layers <N>` to the CPU binary (llamafile supports partial GPU offload)
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

| Direction | Channel | Payload |
|---|---|---|
| Renderer → Main | `models:get-status` | — |
| Main → Renderer | `models:status` | `{ ready: boolean, missing: ModelAssetId[], downloadInProgress: boolean }` |
| Renderer → Main | `models:download` | `{ assets?: ModelAssetId[] }` |
| Main → Renderer | `models:download-progress` | `{ asset: ModelAssetId, receivedBytes: number, totalBytes?: number, percent?: number }` |
| Main → Renderer | `models:download-complete` | `{ asset: ModelAssetId }` |
| Main → Renderer | `models:download-error` | `{ asset?: ModelAssetId, message: string }` |

### ModelAssetId

```ts
type ModelAssetId =
  | 'llamafile-bin'   // Windows only
  | 'gemma-model'     // All platforms
  | 'mmproj'          // Windows only (llamafile vision)
  | 'tts-model'       // All platforms
```

### Writable path layout

```
app.getPath('userData')/           e.g. %APPDATA%\Delfin\  or  ~/Library/Application Support/Delfin/
  manifest.json
  bin/
    llamafile-0.10.1.exe           (Windows only)
  models/
    google_gemma-4-E2B-it-IQ4_NL.gguf
    mmproj-google_gemma-4-E2B-it-f16.gguf   (Windows only)
    tts/
      <voice>.onnx
      <voice>.onnx.json
  cache/
    litert/                        (macOS/Linux — LiteRT model cache)
    hf/                            (macOS/Linux — HuggingFace hub cache)
```

---

## Acceptance criteria

- [ ] `npm run dist` produces platform installer(s) for the current OS without error
- [ ] Installing the Windows `.exe` on a clean machine shows SetupScreen; downloads complete; app runs a prompt end-to-end via llamafile
- [ ] Installing the macOS DMG on a clean machine shows SetupScreen (model only); app runs a prompt end-to-end via LiteRT-LM frozen sidecar
- [ ] Installing the Linux AppImage on a clean machine completes and runs a prompt via LiteRT-LM frozen sidecar
- [ ] Vision prompt (screenshot) works on Windows packaged build (llamafile + mmproj)
- [ ] `npm run dev:full` still works for contributors on macOS/Linux/WSL2
- [ ] Manifest checksum verification passes; tampered files are re-downloaded
- [ ] `INFERENCE_BACKEND` is not user-visible in packaged builds; correct backend is auto-selected per platform

---

## Risks / open questions

1. **Code signing — macOS**: without notarization, Gatekeeper blocks the app on first launch. For student testers, right-click → Open works with instructions. For public distribution, an Apple Developer account ($99/yr) and notarization CI step are required.
2. **Code signing — Windows**: unsigned NSIS installers trigger Windows Defender SmartScreen ("More info → Run anyway"). Defer EV signing to post-MVP.
3. **PyInstaller frozen sidecar size**: the frozen Python bundle (Python + LiteRT-LM + kokoro-onnx + FastAPI + onnxruntime) will likely be 300–500 MB. This is bundled inside the macOS/Linux installer. Consider splitting TTS into a separately downloaded binary to reduce installer size.
4. **GGUF model download size**: Gemma 4 E2B IQ4_NL is ~3.4 GB. `assetManager` must implement HTTP range request resumption or retry-from-zero with a `.part` temp file for interrupted downloads.
5. **HuggingFace rate limits**: large downloads from HF may be rate-limited. Use direct HTTPS; support `HF_TOKEN` env var for authenticated downloads if needed.
6. **espeak-ng in frozen kokoro**: the existing `sidecar/tts.py` patches the espeak-ng data path at runtime. In the frozen bundle, this path must resolve relative to the bundle directory, not the source tree.

## Future todos (post-MVP)

- [ ] **Auto-update**: assess `electron-updater` for app binary updates; separate from model/binary updates
- [ ] **Model switcher**: allow users to download and switch between E2B and E4B model variants in settings
- [ ] **Resume downloads**: HTTP range resumption in `assetManager` for large GGUF files
- [ ] **WSL2 opt-in**: advanced setting allowing WSL2 users on Windows to opt into LiteRT-LM if they have the sidecar set up manually
