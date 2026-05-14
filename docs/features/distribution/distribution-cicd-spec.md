# Distribution — CI/CD Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.
> Depends on `distribution-packaging-spec.md` tracks DP0–DP2 being complete.

## Gate Resolution

| Field          | Value                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Status**     | Gate 1 — partially implemented: `.github/workflows/build-litert-cpp-bridge.yml` produces native bridge binaries for windows-x64 / macos-arm64 / linux-x64. The full `dist.yml` electron-builder packaging matrix below is still awaiting approval. |
| **Created**    | 2026-05-01                                                                                                       |
| **Revised**    | 2026-05-04 (split out the LiteRT-LM C++ bridge build into a dedicated workflow consumed by the packaging matrix; `LITERT_LM_REF` pinned). |
| **Revised**    | **2026-05-06 (`dist.yml` matrix downloads bridge artifact for all three platforms; PyInstaller step removed — see revision below).**        |
| **Depends on** | `distribution-packaging-spec.md` (DP0–DP2 complete; `npm run dist` working locally)                             |

## Revision — 2026-05-06

### What changed and why

The 2026-05-03 revision already established that CI **must not** rebuild the bridge inline in `dist.yml` — the dedicated `build-litert-cpp-bridge.yml` workflow owns that step. The 2026-05-06 revision extends the bridge artifact handoff from Windows-only to **all three platforms**:

- **macOS arm64**: download `delfin-litert-bridge-macos-arm64` artifact from `build-litert-cpp-bridge.yml` before packaging.
- **Linux x64**: download `delfin-litert-bridge-linux-x64` artifact before packaging.
- **PyInstaller step removed**: macOS and Linux runners no longer run PyInstaller to freeze the Python sidecar. The Python sidecar is a developer-only fallback and is not present in any packaged build.

The `dist.yml` `Build LiteRT C++ bridge (Windows Track A only)` step is replaced with a per-platform bridge artifact download step that runs on **all three runners**.

---

## Goal

Set up GitHub Actions workflows that automatically build platform-specific Delfin installers on Windows, macOS, and Linux runners whenever a release is cut. Provide clear guidance on distribution channel options and a repeatable release process that works from a local machine today and migrates to CI-produced artifacts later.

## Background

Currently, all builds are done locally on a single developer machine. Cross-platform distribution requires building on each target OS (electron-builder cannot cross-compile for all targets). GitHub Actions provides free hosted runners for all three platforms, making it the natural fit.

The CI/CD work is the last track in the distribution milestone. Completing it makes the release process repeatable and removes the need for a developer to have access to all three OS environments.

> **Revised 2026-05-03:** The conditional "if Track A passes" from the original spec is now resolved. The LiteRT-LM C++ bridge is validated on Windows. CI **must** own the Windows LiteRT-LM C++ bridge build: the Windows runner installs Bazelisk + MSVC, builds `delfin_litert_bridge.exe` + `libGemmaModelConstraintProvider.dll`, and bundles them as app resources via `electron-builder extraResources`. The LiteRT-LM C++ source tree, Bazelisk, and MSVC are CI/build-time inputs only — end users never need compiler tooling. The llamafile download step previously described for the Windows runner is removed.

## Scope

### Track DC0 — local release workflow (immediate)

Before CI is set up, document and script a repeatable manual release process so builds can be produced today.

| File                                      | Change                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/release-local.mjs`               | New: interactive checklist script that builds for the current platform, names the output file correctly, and prints next steps |
| `docs/features/distribution-cicd-spec.md` | This spec — includes the manual release checklist below                                                                        |

**Manual release checklist (current platform):**

```
1. Ensure npm run dev works and one real prompt succeeds
2. Run npm run dist
3. Verify the output in dist/:
   - Windows: Delfin Setup x.y.z.exe
   - macOS:   Delfin-x.y.z-arm64.dmg / Delfin-x.y.z.dmg
   - Linux:   Delfin-x.y.z.AppImage
4. Smoke test the installer on a clean user account (no existing userData)
5. Upload the artifact to GitHub Releases as a draft
6. Repeat steps 2–5 on each other target OS
7. Publish the draft release once all three platform artifacts are attached
```

### Track DC1 — GitHub Actions matrix build

Create a workflow that builds all platform artifacts on push to `release/*` branches or on manual trigger.

#### File: `.github/workflows/dist.yml`

```yaml
name: Build distribution artifacts

on:
  push:
    branches: ["release/*"]
  workflow_dispatch:
    inputs:
      version:
        description: "Version tag (e.g. v0.1.0)"
        required: true

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            platform: win
            artifact: "dist/*.exe"
            bridge_artifact: "delfin-litert-bridge-windows-x64"
          - os: macos-latest # arm64 runner
            platform: mac
            artifact: "dist/*.dmg"
            bridge_artifact: "delfin-litert-bridge-macos-arm64"
          - os: ubuntu-latest
            platform: linux
            artifact: "dist/*.AppImage"
            bridge_artifact: "delfin-litert-bridge-linux-x64"

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build Electron app
        run: npm run build

      - name: Download LiteRT C++ bridge artifact
        uses: dawidd6/action-download-artifact@v3
        with:
          workflow: build-litert-cpp-bridge.yml
          branch: main
          name: ${{ matrix.bridge_artifact }}
          path: bin/

      - name: Package (${{ matrix.platform }})
        run: npm run dist
        env:
          # Provide signing credentials via secrets (see DC2)
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: delfin-${{ matrix.platform }}
          path: ${{ matrix.artifact }}
          retention-days: 14

  publish:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/heads/release/')
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts/
          merge-multiple: true

      - name: Create GitHub Release (draft)
        uses: softprops/action-gh-release@v2
        with:
          draft: true
          files: artifacts/**
          tag_name: ${{ github.event.inputs.version || github.ref_name }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Notes on the matrix

- **`macos-latest`** as of 2026 defaults to an arm64 (Apple Silicon) runner on GitHub. macOS arm64 is the only macOS target for MVP (Intel Macs are out of scope per `AGENTS.md`).
- **Windows**: `windows-latest` is x64. arm64 is not a target for MVP.
- **Bridge artifact download**: each platform runner downloads its prebuilt `delfin-litert-bridge-<platform>` archive from the most recent successful `build-litert-cpp-bridge.yml` run on `main` before packaging. No source build or compiler toolchain is required on the distribution runner.
- **Linux**: `ubuntu-latest` is x64. The AppImage produced here runs on any reasonably modern Linux distribution.
- **PyInstaller removed**: macOS and Linux runners no longer need Python or PyInstaller. The packaged app bundles the C++ bridge binary instead of a frozen Python sidecar.

### Track DC1a — LiteRT C++ bridge artifact handoff

> **2026-05-04 update.** This track is partially implemented as `.github/workflows/build-litert-cpp-bridge.yml`. That workflow:
>
> - Runs on `push` to `main`, `pull_request` to `main`, `release.published`, and `workflow_dispatch`.
> - Builds `delfin_litert_bridge` for `windows-x64` (with `libGemmaModelConstraintProvider.dll`), `macos-arm64`, and `linux-x64` against the upstream ref pinned in `scripts/setup-litert-cpp.mjs` (`LITERT_LM_REF`, currently `v0.10.2`).
> - Uploads each platform's binary as a workflow artifact `delfin-litert-bridge-<platform>`.
> - On `release.published`, attaches the same archives to the GitHub Release.
>
> The full distribution matrix (`dist.yml`) below should consume those release assets / workflow artifacts rather than rebuilding the bridge inline.

Original outline (still applies as the consumer-side handoff):

1. Restore or clone the pinned `google-ai-edge/LiteRT-LM` source tree.
2. Run `npm run bridge:build -- --litert-lm-dir <checkout> --output-dir bin`.
3. Upload `bin/delfin_litert_bridge.exe` as an intermediate workflow artifact for diagnostics.
4. Run Electron packaging with that binary included as an app resource.

End users install only the packaged app and download model/TTS assets at first run. They do not receive the LiteRT-LM source tree, Bazel cache, or compiler toolchain.

### Track DC2 — code signing setup (when ready)

Code signing is not required for student tester builds but is required before broader public distribution. The workflow above already has signing credential placeholders.

#### macOS notarization

Requirements:

- Apple Developer account ($99/yr)
- Developer ID Application certificate exported as `.p12`
- App-specific password for your Apple ID

GitHub Actions secrets to set:
| Secret | Value |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` file: `base64 -i cert.p12` |
| `CSC_KEY_PASSWORD` | `.p12` export password |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | Generated at appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Team ID from developer.apple.com |

electron-builder handles notarization automatically when these are set. The `dist.yml` workflow already passes them through.

#### Windows code signing

Requirements:

- EV code signing certificate from a CA (DigiCert, Sectigo, etc.) — $300–700/yr
- Certificate exported as `.pfx`

GitHub Actions secrets to set:
| Secret | Value |
|---|---|
| `CSC_LINK` | Base64-encoded `.pfx` |
| `CSC_KEY_PASSWORD` | `.pfx` password |

Without signing, Windows Defender SmartScreen shows "Windows protected your PC". Users can click "More info → Run anyway". Acceptable for MVP tester builds; required before public distribution.

## Distribution channel recommendations

### Recommended for MVP: GitHub Releases (draft → publish)

**Why**: Free, no infrastructure required, integrates directly with the CI workflow above. Testers get a direct download link. Versioning and changelog are built in.

**How it works**:

1. Push to `release/v0.1.0` branch → CI builds all three platform artifacts → creates a draft GitHub Release
2. Developer smoke tests the artifacts and edits the release notes
3. Developer publishes the release → download links are live

**Limitations**: GitHub has a 2 GB per-file limit. Gemma GGUF is downloaded separately at first run (not in the installer), so installer artifacts will be well under 200 MB.

### Alternative: Direct S3 / CDN hosting

If GitHub Releases becomes limiting (e.g. high download traffic, need for analytics, or custom update server for `electron-updater`), host artifacts on:

- **Cloudflare R2**: S3-compatible, no egress fees
- **AWS S3 + CloudFront**: standard and well-documented with electron-updater

This requires maintaining a bucket and a `latest.yml` / `latest-mac.yml` update manifest. Defer to the auto-update assessment track.

### Not recommended: App stores (for now)

Mac App Store and Microsoft Store require sandboxing and additional entitlements that would require architectural changes (child process spawning is restricted in sandbox mode). Snap and Flatpak have similar constraints. Defer post-MVP.

## Out of scope

- Auto-update implementation (separate assessment track)
- App store submission
- Build caching beyond npm's built-in `actions/setup-node` cache
- Scheduled nightly builds
- Test suite execution in CI (a separate CI workflow is recommended but not part of this spec)

## Acceptance criteria

- [ ] `scripts/release-local.mjs` runs without error and produces the correct output filename for the current platform
- [ ] `.github/workflows/dist.yml` exists and is valid YAML (passes `actionlint` or similar)
- [ ] Pushing to `release/*` triggers the matrix build on all three runners
- [ ] All three platform artifacts are produced and uploaded to GitHub Actions as workflow artifacts
- [ ] Each runner downloads its `delfin-litert-bridge-<platform>` artifact and the packaged installer includes the prebuilt bridge binary (no inline bridge compilation)
- [ ] A draft GitHub Release is created automatically with all three artifacts attached
- [ ] Workflow completes without error when signing secrets are absent (signing is skipped gracefully, not a hard failure)
- [ ] Manual release checklist is followed at least once end-to-end before calling DC1 complete

## Risks / open questions

1. **macOS runner architecture**: `macos-latest` on GitHub Actions moved to arm64 (M1) in 2024. Verify this is the correct runner for arm64 builds. For x64 macOS support, `macos-13` is the last Intel runner available. Producing a universal binary (`arch: universal`) on the arm64 runner is possible but builds take longer.
2. **Bridge artifact staleness**: `dawidd6/action-download-artifact` downloads from the most recent successful `build-litert-cpp-bridge.yml` run on `main`. If the bridge workflow has not run for the current `LITERT_LM_REF`, a stale artifact could be used. Pin the artifact lookup to the same `LITERT_LM_REF` by matching the workflow run SHA when possible.
3. **GitHub Actions minutes**: the matrix build uses ~3 OS runners × ~10–15 min each per run. GitHub Free provides 2000 minutes/month (Linux) with macOS and Windows runners costing 5× and 2× respectively. Monitor usage and consider self-hosted runners if limits are hit.
4. **Artifact size**: if the total installer + artifact size approaches GitHub Release's 2 GB per-file limit in future (e.g. bundled TTS model), move to R2/S3 early.

## Future todos (post-MVP)

- [ ] **Auto-update assessment**: evaluate `electron-updater` against a hosted `latest.yml` manifest on GitHub Releases or S3; write recommendation or follow-up spec
- [ ] **Test suite in CI**: add a separate `test.yml` workflow running `npm test` and Python sidecar tests on every PR
- [ ] **Release notes automation**: generate changelog from commit messages between tags using `conventional-changelog` or similar
- [ ] **Self-hosted runner**: add a macOS arm64 self-hosted runner if GitHub Actions minutes become a bottleneck
- [ ] **Build caching**: cache electron-builder's downloaded Electron binaries between runs using `actions/cache` to reduce CI time
