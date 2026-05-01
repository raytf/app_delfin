# Distribution — Packaging Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.
> Depends on `distribution-backend-migration-spec.md` tracks DM0–DM2 being complete.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 — awaiting approval |
| **Created** | 2026-05-01 |
| **Depends on** | `distribution-backend-migration-spec.md` (DM0–DM2 complete) |
| **Blocks** | `distribution-cicd-spec.md` (CI builds the output of this track) |

## Goal

Package Delfin as a native installable desktop application for Windows x64, macOS x64, macOS arm64, and Linux x64. The packaged app must download required binaries and models at first run, launch them automatically, and present a first-run setup screen while downloads are in progress.

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
| `build/installer.nsh` | Optional NSIS installer customisation (Windows) |

**electron-builder config shape (inside `package.json`):**

```json
{
  "build": {
    "appId": "com.delfin.desktop",
    "productName": "Delfin",
    "directories": { "output": "dist" },
    "files": ["out/**/*"],
    "mac": {
      "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
      "icon": "build/icon.icns",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "hardenedRuntime": true,
      "gatekeeperAssess": false
    },
    "win": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "icon": "build/icon.ico"
    },
    "linux": {
      "target": [{ "target": "AppImage", "arch": ["x64"] }],
      "icon": "build/icon.png",
      "category": "Education"
    },
    "nsis": {
      "oneClick": false,
      "allowDirChange": true,
      "installerIcon": "build/icon.ico"
    }
  }
}
```

No `extraResources` are needed since binaries are downloaded at runtime (not bundled in the installer).

### Track DP1 — first-run download orchestration

The first-run flow downloads llama-server, the GGUF model, and TTS assets to `app.getPath('userData')`. All downloads happen inside Electron main and are reported to the renderer via existing IPC channels (defined in `desktop-distribution-mvp-spec.md` interface contract section).

#### Download manifest

A JSON manifest is stored at `<userData>/manifest.json`. It tracks which assets are present and their expected checksums:

```json
{
  "schema": 1,
  "assets": {
    "llama-server": {
      "version": "b4631",
      "path": "bin/llama-server",
      "sha256": "...",
      "downloaded": true
    },
    "gemma-model": {
      "version": "gemma-4-e2b-q4_k_m",
      "path": "models/gemma-4-e2b-q4_k_m.gguf",
      "sha256": "...",
      "downloaded": false
    },
    "tts-model": {
      "version": "...",
      "path": "models/tts/",
      "sha256": "...",
      "downloaded": false
    }
  }
}
```

#### Download sources

| Asset | Source | Notes |
|---|---|---|
| `llama-server` binary | GitHub Releases: `ggerganov/llama.cpp` | Platform-specific zip; extract single binary. Pin to a tested build number. |
| `gemma-4-e2b-q4_k_m.gguf` | Hugging Face: `ggml-org/gemma-4` | ~3.5 GB; stream download with progress |
| TTS binary + model | Piper GitHub releases or HuggingFace (decided in DM2) | ~80 MB total |

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
                                └─ Main: spawn llama-server + TTS sidecar
                                     └─ Renderer: navigate to HomeScreen
```

#### Files modified / created

| File | Change |
|---|---|
| `src/main/index.ts` | Add first-run check before window show; gate sidecar launch on asset readiness |
| `src/main/sidecar/assetManager.ts` | New: reads/writes manifest, downloads assets, verifies checksums |
| `src/main/ipc/handlers.ts` | Add handlers for `models:get-status` and `models:download` |
| `src/renderer/features/setup/SetupScreen.tsx` | New: download progress UI shown on first run |
| `src/renderer/navigation/router.tsx` | Add `/setup` route; redirect there when `models:status` returns `ready: false` |
| `src/shared/types.ts` | Add `ModelAssetId`, `ModelStatus`, `DownloadProgress` types (from approved contract) |
| `src/shared/schemas.ts` | Add Zod schemas for new IPC payloads |

### Track DP2 — packaged sidecar launch

When the app is packaged, Electron must launch llama-server from the user data directory rather than spawning the dev-mode Python sidecar.

| File | Change |
|---|---|
| `src/main/sidecar/wsClient.ts` (or equivalent) | Detect `app.isPackaged`; if true, use `assetManager` paths; if false, use existing dev-mode script |
| `scripts/run-llama-server.mjs` | Keep for dev mode; packaged mode bypasses this |

**Runtime mode detection:**

```ts
const mode = app.isPackaged ? 'bundled' : 'dev';
// dev: spawn via scripts/run-llama-server.mjs (Node.js subprocess)
// bundled: spawn binary directly from userData/bin/llama-server
```

### Track DP3 — GPU stretch goal

After CPU path is validated on all platforms:

- Detect available GPU backend at launch:
  - Windows: check for CUDA via `nvidia-smi` or `nvcc --version`; fall back to Vulkan
  - macOS: always use Metal (built into llama-server macOS binary)
  - Linux: check for CUDA; fall back to CPU
- Download the GPU-enabled llama-server binary variant if applicable (separate entry in manifest)
- Add `--n-gpu-layers <N>` to the llama-server launch flags
- Expose a setting in the app for the user to override GPU layer count

This track is explicitly conditional. If GPU detection adds significant complexity or stability risk, defer to a follow-up spec.

## Out of scope

- Auto-updates (`electron-updater`) — deferred to a follow-up spec
- Mac App Store / Microsoft Store / Snap / Flatpak distribution
- Code signing and notarization automation (see Risks; manual steps documented)
- Bundling model files inside the installer
- Linux `.deb` (AppImage is the MVP target; `.deb` is a nice-to-have)

## Interface contract

The IPC channels defined in `desktop-distribution-mvp-spec.md` §Interface contract §2 (Model bootstrap contract) and §3 (Writable path contract) apply unchanged. Reproduce here for implementer convenience:

### IPC channels

| Direction | Channel | Payload |
|---|---|---|
| Renderer → Main | `models:get-status` | — |
| Main → Renderer | `models:status` | `{ ready: boolean, missing: ModelAssetId[], downloadInProgress: boolean }` |
| Renderer → Main | `models:download` | `{ assets?: ModelAssetId[] }` |
| Main → Renderer | `models:download-progress` | `{ asset: ModelAssetId, receivedBytes: number, totalBytes?: number, percent?: number }` |
| Main → Renderer | `models:download-complete` | `{ asset: ModelAssetId }` |
| Main → Renderer | `models:download-error` | `{ asset?: ModelAssetId, message: string }` |

### Writable path layout

```
app.getPath('userData')/         e.g. ~/Library/Application Support/Delfin/
  manifest.json
  bin/
    llama-server[.exe]
    piper[.exe]  (or tts-sidecar[.exe])
  models/
    gemma-4-e2b-q4_k_m.gguf
    tts/
      en_US-lessac-medium.onnx
      en_US-lessac-medium.onnx.json
```

## Acceptance criteria

- [ ] `npm run dist` produces platform installer(s) for the current OS without error
- [ ] Installing the Windows `.exe` and launching the app shows the SetupScreen on a clean machine (no existing userData)
- [ ] SetupScreen download completes and shows progress for each asset
- [ ] After download, app launches llama-server and completes one real prompt end-to-end
- [ ] macOS DMG installs and launches on x64 and arm64 (unsigned builds require user to right-click → Open)
- [ ] Linux AppImage launches and completes one prompt on Ubuntu x64
- [ ] `npm run dev:full` (Python sidecar dev mode) still works for contributors
- [ ] Manifest checksum verification passes; tampered files are re-downloaded
- [ ] GPU stretch: if CUDA is detected on Windows, llama-server launches with `--n-gpu-layers` and generation is faster than CPU baseline

## Risks / open questions

1. **Code signing — macOS**: without notarization, macOS Gatekeeper blocks the app on first launch unless the user explicitly opens it via right-click → Open. For student testers this is acceptable with instructions. For public distribution, an Apple Developer account ($99/yr) and a GitHub Actions notarization step (using `electron-notarize` or `notarytool`) are required. Document this prominently in the release checklist.
2. **Code signing — Windows**: unsigned NSIS installers trigger Windows Defender SmartScreen. Users can click "More info → Run anyway". For broader distribution, an EV code signing certificate ($300–700/yr) eliminates this. Defer to post-MVP.
3. **GGUF model download size**: Gemma 4 E2B Q4_K_M is ~3.5 GB. A poor connection or interrupted download must resume cleanly. The `assetManager` should implement HTTP range request resumption or retry-from-zero with a temp file.
4. **HuggingFace rate limits**: large file downloads from HF may be rate-limited without a token. Consider mirroring to GitHub Releases or using `hf_hub_download` (Python) vs direct HTTPS. Since the Electron main process is now the downloader (no Python), use direct HTTPS with an `Authorization: Bearer $HF_TOKEN` header if a token is provided in `.env`.
5. **llama-server version pinning**: the GitHub release build number must be pinned and manually updated. An automated check for new releases is a future CI task.

## Future todos (post-MVP)

- [ ] **Auto-update**: assess `electron-updater` for app binary updates; separate from model/binary updates
- [ ] **Model switcher**: allow users to download and switch between E2B and E4B model variants in settings
- [ ] **Resume downloads**: implement HTTP range resumption in `assetManager` for large GGUF files
- [ ] **Delta updates for TTS model**: TTS voice model updates should not require re-downloading the full sidecar binary
