# LiteRT-LM C++ Bridge — Build DX Improvements

> Gate 1 — spec draft awaiting human approval.
> Restructures how `delfin_litert_bridge` is built so that the common backend-iteration loop (editing `delfin_litert_bridge.cc`) no longer pays the cost of rebuilding the entire upstream LiteRT-LM tree.

## Gate Resolution

| Field          | Value                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | 🚧 Gate 1 — spec draft, awaiting human approval.                                                                                                                                  |
| **Created**    | 2026-05-04                                                                                                                                                                        |
| **Depends on** | `litert-cpp-bridge-runtime-validation-spec.md` Phases 3–4 (macOS arm64 + Linux x64 native bridge builds must complete first so the vendor pipeline has known-good outputs to publish) |
| **Blocks**     | Nothing directly. Reduces friction for ongoing work in `litert-cpp-primary-backend-migration-spec.md` and lets `distribution-packaging-spec.md` consume the same vendor bundle as local dev. |

---

## Goal

Cut the cold-build cycle for `delfin_litert_bridge` from ~40 min (CI) / ~25–35 min (local) to ≤ 5 min for the 95% of edits that touch only the bridge wrapper, and remove Bazel / JDK / Python / Git LFS from local toolchain requirements for those edits — by publishing prebuilt LiteRT-LM **vendor bundles** per `LITERT_LM_REF` and pointing local builds at those bundles.

---

## Background

`native/litert-cpp-bridge/delfin_litert_bridge.cc` is ~320 lines. The dominant cost in every build is compiling and linking the upstream `google-ai-edge/LiteRT-LM` Bazel tree (abseil, TFLite runtime, sentencepiece, protobuf, GPU/audio executors, model constraint provider). Both existing entry points pay this cost in full:

1. **CI artifacts** (`.github/workflows/build-litert-cpp-bridge.yml`) — ~40 min per platform (`windows-2022`, `macos-15`, `ubuntu-24.04`).
2. **Local build** (`npm run setup:litert-cpp` / `npm run build:litert-cpp-bridge`) — requires Bazelisk + JDK + Python + MSVC/clang + Git LFS; cold build ~25–35 min, plus dependency install on first run.

`LITERT_LM_REF` changes infrequently. The canonical pattern for "small wrapper around a giant upstream SDK" (Apache Arrow language wheels, Rerun's `rerun_c`, Lightly Edge SDK, vendored CUDA bindings) is to **publish prebuilt vendor binaries once per upstream version** and let downstream wrappers compile against those. This spec applies that pattern.

A complementary tactic — Bazel remote cache (BuildBuddy / EngFlow / self-hosted `bazel-remote`) — is included as Phase 3 because it accelerates the slow CI step that produces the vendor bundle and provides a fallback for developers who legitimately need to build upstream from source.

---

## Scope

### Phase 1 — Vendor-bundle producer (CI workflow split)

Restructure `.github/workflows/build-litert-cpp-bridge.yml` into two jobs:

| Job                    | Trigger                                                                                                                  | Output                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-litert-vendor`  | When `LITERT_LM_REF` in `scripts/setup-litert-cpp.mjs` changes (path filter); `release.published`; `workflow_dispatch`. | Per-platform archive `delfin-litert-vendor-<platform>-<litert_lm_ref>.tar.zst` containing `lib/` (LiteRT-LM libraries), `include/` (forwarded headers needed by the bridge), `extra/` (`libGemmaModelConstraintProvider.dll`, etc.), `MANIFEST.json`. Published as a GitHub Release tagged `vendor-litert-<ref>`. |
| `build-bridge`         | Every push / PR to `main`.                                                                                              | Downloads matching vendor bundle, compiles only `delfin_litert_bridge.cc` against it, uploads `delfin-litert-bridge-<platform>` artifact. Target: ≤ 5 min per platform on a cache hit.                                                                                                                  |

`MANIFEST.json` schema:

```json
{
  "litert_lm_ref": "v0.10.2",
  "platform": "linux-x64",
  "abi": { "compiler": "clang-18", "stdlib": "libc++", "linkage": "static" },
  "files": { "lib": ["..."], "include": ["..."], "extra": ["..."] },
  "sha256": "<bundle-sha256>"
}
```

### Phase 2 — Vendor-aware local build path

- Add `scripts/build-litert-cpp-bridge-vendor.mjs` — given `LITERT_LM_REF`, downloads the matching bundle from GitHub Releases into `native/litert-cpp-bridge/.vendor/<ref>/<platform>/`, validates SHA256, then invokes a minimal CMake (or direct `clang++` / `cl.exe`) compile of `delfin_litert_bridge.cc` against the vendored headers/libs. Output: `bin/delfin_litert_bridge[.exe]` plus any required co-located shared libs.
- `scripts/setup-litert-cpp.mjs` defaults to the vendor path. New flag `--from-source` opts into the existing Bazel flow. `--native-windows` continues to imply `--from-source`.
- New env var `LITERT_VENDOR_BUNDLE_URL` (optional) overrides the default GitHub Releases URL for self-hosted mirrors / offline dev.

Local toolchain requirements after this change (vendor path only):

| OS      | Required                                                  |
| ------- | --------------------------------------------------------- |
| Linux   | `clang` or `gcc` + `cmake` (no Bazel / JDK / Python).     |
| macOS   | Xcode CLT.                                                 |
| Windows | VS 2022 Build Tools (C++ workload) — no JDK / Bazel / Python. |

### Phase 3 — Shared Bazel remote cache (for `--from-source` and `build-litert-vendor`)

- Evaluate BuildBuddy free tier vs EngFlow free tier vs self-hosted `bazel-remote`; pick one and document.
- CI: read + write. Local: read-only by default to prevent cache poisoning from uncommitted changes.
- Configuration delivered via a checked-in `.bazelrc.delfin` snippet that LiteRT-LM's `.bazelrc` imports during setup (existing pattern: setup script already appends `output_user_root` on Windows).
- Document opt-out for offline dev.

### Phase 4 — Test-seam improvements (deferred — each requires its own Gate 1 spec)

Listed for visibility only; not implemented in this spec:

- **Mock bridge for renderer/proxy iteration** — sibling of `scripts/mock-sidecar.js` speaking the JSONL protocol.
- **Protocol/engine split in `delfin_litert_bridge.cc`** — separate JSONL parsing + session state (no LiteRT deps, fast link, easy to unit-test) from LiteRT calls (slow link, rarely changes).
- **Devcontainer for `--from-source` developers** — pre-baked image with Bazelisk + JDK + Python + clang, pre-warmed with the remote cache endpoint.

---

## Out of scope

- Phase 4 implementation (each item warrants its own spec).
- Replacing Bazel as the upstream LiteRT-LM build system.
- Forking or vendoring LiteRT-LM source — this spec consumes upstream `LITERT_LM_REF` unchanged.
- electron-builder packaging of `delfin_litert_bridge` into installers (covered by `distribution-packaging-spec.md`; that spec can adopt the vendor bundle as its `extraResources` source).
- Windows arm64, Linux arm64, macOS x64.
- Vendor-bundle ABI versioning beyond a `LITERT_LM_REF`-based key (no semver, no compatibility matrix).

---

## Interface contract

### New files

- `.github/workflows/build-litert-vendor.yml` — slow vendor-bundle producer.
- `.github/workflows/build-litert-bridge.yml` — fast bridge compile (replaces current single-job workflow).
- `scripts/build-litert-cpp-bridge-vendor.mjs` — vendor-aware local builder.
- `scripts/build-litert-cpp-bridge-vendor.test.mjs` — vitest coverage for arg parsing, manifest validation, download/cache flow.
- `native/litert-cpp-bridge/CMakeLists.txt` — minimal CMake target for the bridge against vendored libs (or a thin direct-compile script if CMake is overkill).
- `native/litert-cpp-bridge/.bazelrc.delfin` — remote cache configuration snippet (Phase 3).

### Modified files

- `scripts/setup-litert-cpp.mjs` — default to vendor path; add `--from-source` opt-in flag; document `LITERT_VENDOR_BUNDLE_URL` in `usage()`.
- `scripts/build-litert-cpp-bridge.mjs` — keep as the `--from-source` entry point; clarify in header comment.
- `native/litert-cpp-bridge/README.md` — three-tier dev guide (vendor / from-source / native-windows) replacing the current two-tier one.
- `.env.example` — add `LITERT_VENDOR_BUNDLE_URL` (optional).
- `docs/SPEC.md` §Environment Variables — document `LITERT_VENDOR_BUNDLE_URL`.
- `.github/workflows/build-litert-cpp-bridge.yml` — superseded by the two new workflows; remove or rename.

### New env vars

- `LITERT_VENDOR_BUNDLE_URL` (optional) — override the default GitHub Releases download URL for the vendor bundle.

### New npm scripts

- `npm run setup:litert-cpp` — defaults to vendor path (behaviour change).
- `npm run setup:litert-cpp -- --from-source` — current Bazel behaviour.
- `npm run build:litert-cpp-bridge:vendor` — explicit vendor build for CI / scripted use.

---

## Acceptance criteria

| #    | Criterion                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1  | A clean Linux x64 checkout with only `clang` + `cmake` installed can run `npm run setup:litert-cpp` and produce a working `bin/delfin_litert_bridge` in ≤ 5 minutes (network-bound).                                |
| AC2  | Same flow works on macOS arm64 with only Xcode CLT installed.                                                                                                                                                       |
| AC3  | Same flow works on Windows x64 with only VS 2022 Build Tools (C++ workload) installed — no JDK, no Bazel, no Python.                                                                                                |
| AC4  | The `build-bridge` CI job completes in ≤ 5 minutes per platform when the matching vendor bundle is already published.                                                                                              |
| AC5  | The `build-litert-vendor` CI job runs only when `LITERT_LM_REF` changes, on `release.published`, or via `workflow_dispatch`.                                                                                       |
| AC6  | Vendor bundles are published to GitHub Releases with a deterministic naming scheme and validated SHA256 checksums recorded in `MANIFEST.json`.                                                                     |
| AC7  | `npm run setup:litert-cpp -- --from-source` continues to work end-to-end on all three platforms (regression guard for the existing flow).                                                                          |
| AC8  | `bin/delfin_litert_bridge` produced via the vendor path passes the `litert-cpp-bridge-runtime-validation-spec.md` S1/S2/S3 benchmark sweep within the same tolerances as the from-source binary.                  |
| AC9  | Bazel remote cache configuration is documented and a CI cold cache miss for the `build-litert-vendor` job completes in ≤ 50% of the current time (or evidence is recorded explaining why the ceiling was not met). |
| AC10 | The vendor bundle layout (`MANIFEST.json` + directory structure) is consumable by `distribution-packaging-spec.md`'s electron-builder `extraResources` step without further transformation.                        |

---

## Risks and open questions

| Risk                                                                                                                          | Likelihood   | Mitigation                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LiteRT-LM C++ symbol/ABI surface is unstable across `LITERT_LM_REF` bumps                                                     | Medium       | Pin one `LITERT_LM_REF` per Delfin release; rebuild vendor bundle on every bump; treat ABI breakage as a known cost of upgrading the ref. Static linking is the default to remove runtime ABI risk; revisit only if binary size becomes a problem.                          |
| Static vs shared linkage decision differs across platforms (Windows already needs `libGemmaModelConstraintProvider.dll`)      | Medium       | Document per-platform linkage in `MANIFEST.json`; vendor bundle ships whatever upstream produces and the bridge links accordingly.                                                                                                                                        |
| GitHub Releases asset size or download speed becomes a bottleneck (TFLite + abseil + executors can be hundreds of MB)         | Low-Medium   | Use `tar.zst`. Measure compressed bundle size in Phase 1; if > 500 MB, evaluate splitting into `runtime` + `extras` bundles or hosting on R2 / S3 / GCS via `LITERT_VENDOR_BUNDLE_URL`.                                                                                  |
| Vendor path breaks for developers who want a debug build of LiteRT-LM                                                          | Low          | Out of scope for vendor path — those developers fall back to `--from-source`. Document explicitly.                                                                                                                                                                       |
| `npm run setup:litert-cpp` default behaviour change surprises existing developers mid-stream                                   | Low-Medium   | Print a one-time banner on first vendor-mode run linking to the rationale; keep `--from-source` documented prominently in `native/litert-cpp-bridge/README.md`.                                                                                                          |
| BuildBuddy free tier rate limits or storage quotas insufficient                                                                | Low          | Phase 3 evaluates BuildBuddy vs EngFlow vs self-hosted `bazel-remote` on a small VM (no-cost fallback).                                                                                                                                                                  |
| Vendor bundles drift from local toolchain (e.g. macOS SDK / glibc / MSVC version mismatch between CI and developer machine)    | Medium       | Pin macOS SDK / glibc / MSVC versions in `MANIFEST.json` and warn at build time when the local toolchain is older than what the bundle was built against.                                                                                                                |
| Phase 3 (remote cache) introduces a new external dependency that can fail builds                                              | Low          | Configure Bazel to fall back gracefully on cache unavailability (`--remote_local_fallback`); document `--noremote_cache` for offline dev.                                                                                                                                |
