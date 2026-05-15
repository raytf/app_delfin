# AGENTS.md — Delfin

> **For AI coding agents.** Read this file first. It tells you what to build, where the specs live, and what rules to follow.

---

## What Is Delfin?

A local, privacy-first AI desktop sidebar (Electron + React) that captures the foreground window, sends the screenshot to an on-device LLM (Gemma 4 via LiteRT-LM), and streams back a structured explanation. No cloud, no login, no API costs. Primary demo: **Lecture Slide Explainer**.

Current app runtime is **Electron → TypeScript sidecar (`sidecar/src/`) → LiteRT-LM C++ kernel (`delfin_litert_bridge`, built from `litert-cpp-bridge/`)** on all supported platforms (Windows x64, macOS arm64, Linux x64). The Python FastAPI sidecar (`sidecar-old/server.py`) is **deprecated** — retained for developer reference only. The legacy llamafile / `llama-server` path is also **deprecated** — kept only for benchmark comparison under `scripts/benchmark/`.

---

## Coding Agent Entry Points

`AGENTS.md` is the canonical agent instruction file. Tool-specific files exist only as shims so other coding agents load the same rules:

| Agent/tool            | Entry file                 | Rule                                                                                  |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| All agents            | `AGENTS.md`                | Read first; this file owns workflow, architecture, commands, and validated decisions. |
| Claude Code           | `CLAUDE.md`                | Delegates to `AGENTS.md` and highlights Claude-specific reminders.                    |
| Augment Code / Auggie | `.augment/rules/delfin.md` | Delegates to `AGENTS.md` and `docs/SPEC.md` for project rules.                        |

If a tool-specific file conflicts with `AGENTS.md`, follow `AGENTS.md`. If `AGENTS.md` conflicts with `docs/SPEC.md` on architecture or interfaces, `docs/SPEC.md` wins. Update the shims whenever workflow rules, commands, or validated technical decisions change.

---

## Documentation Map

```
AGENTS.md                            ← Canonical instructions for coding agents. Update when workflow/commands/decisions change.
CLAUDE.md                            ← Claude Code shim; points back to AGENTS.md.
.augment/
└── rules/
    └── delfin.md                    ← Augment/Auggie shim; points back to AGENTS.md and docs/SPEC.md.
STATUS.md                            ← Live feature status tracker. Update after every implementation change.
.github/
└── workflows/
    └── build-litert-cpp-bridge.yml  ← CI matrix (windows-2022 / macos-14 / ubuntu-24.04) that builds delfin_litert_bridge against the LITERT_LM_REF pin and uploads platform artifacts; attaches archives to GitHub Releases on release.published.
scripts/
├── setup-litert-cpp.mjs             ← Interactive setup script: clones LiteRT-LM at LITERT_LM_REF, builds the bridge, and writes .env. WSL2/Linux/macOS is the default; --native-windows enables the Bazel/MSVC path on Windows.
├── setup-litert-cpp.test.mjs        ← Vitest test suite for setup-litert-cpp.mjs (parseArgs, --native-windows flag, usage() output).
└── benchmark/                       ← Standalone inference benchmark harness (LiteRT vs llamafile/llama-server).
    ├── SETUP.md                     ← Benchmark setup/runbook for WSL2 LiteRT, LiteRT C++ proxy research, and native llamafile runs.
    ├── run.py                       ← Benchmark CLI entry point; writes JSON + CSV to results/.
    └── backends/                    ← LiteRT WebSocket, LiteRT C++ proxy, and llamafile/llama-server adapters.
scripts/litert-cpp-proxy.mjs         ← Research proxy exposing Delfin's sidecar WebSocket protocol for a LiteRT C++ bridge.
scripts/litert-cpp-presets.mjs       ← JS preset registry used by the LiteRT C++ proxy.
native/
└── litert-cpp-bridge/               ← Experimental LiteRT-LM C++ JSONL bridge source/build scaffold for Track A.
results/
└── .gitkeep                         ← Keep the output directory; benchmark JSON/CSV files are gitignored.
docs/
├── README.md                        ← Doc index with status for every file. Check here first.
├── SPEC.md                          ← Single source of truth. Read this first.
├── design-ai-spec.md                ← Product and brand brief
├── features/                        ← Active feature specs (Gate 1→5 lifecycle), grouped by area
│   ├── backend/                     ← Inference engines, native bridges, benchmarking
│   │   ├── native-windows-backend-research-spec.md    ← 🚧 LiteRT-LM C++ native Windows validation (text ✅, vision ✅, KV-cache ✅, audio ✅, S1/S2/S3 benchmark ✅); macOS/Linux builds pending; Foundry contingency. Vision + audio sub-specs consolidated into §Completed sub-specs.
│   │   ├── litert-cpp-bridge-runtime-validation-spec.md ← 🚧 Phase 1 (Windows S1/S2/S3 benchmark) ✅ 2026-05-03. Phase 2 partial. Phases 3–4 (macOS/Linux builds) pending. Gate 1 — awaiting approval.
│   │   ├── litert-cpp-audio-input-spec.md             ← ✅ Complete (Windows, 2026-05-03) — AC1–AC7 validated; macOS/Linux audio pending M4 cross-platform builds.
│   │   ├── litert-cpp-primary-backend-migration-spec.md ← 🚧 M1 (audio) ✅, M3 (Piper TTS) ✅; M2 (tool-calling) + M4 (macOS/Linux builds) pending. Gate 1 active.
│   │   ├── litert-cpp-bridge-build-dx-spec.md         ← 🚧 Build DX: vendored prebuilt LiteRT-LM bundle + CI workflow split + optional Bazel remote cache. Gate 1 — awaiting approval.
│   │   ├── inference-benchmarking-spec.md             ← ✅ Benchmark harness (LiteRT / LiteRT-CPP / llamafile); script lives in scripts/benchmark
│   │   └── litert-cpp-piper-daemon-spec.md            ← 🚧 Long-lived Piper daemon to eliminate per-turn cold-start; Gate 1 — awaiting approval
│   ├── distribution/                ← Packaging, installers, code signing, CI/CD
│   │   ├── desktop-distribution-mvp-spec.md           ← 🚧 Decision record (revised 2026-05-06): LiteRT-LM C++ bridge on Windows x64 / macOS arm64 / Linux x64; Python sidecar deprecated for distribution. Gate 1 approved.
│   │   ├── distribution-backend-migration-spec.md     ← 🚧 Wire `litert-cpp-proxy.mjs` into packaged runtime on all 3 OSes. Revised 2026-05-06. Gate 1 — awaiting approval.
│   │   ├── distribution-packaging-spec.md             ← 🚧 electron-builder, first-run download, NSIS/DMG/AppImage. Revised 2026-05-06: unified C++ bridge on all 3 platforms; DP3 PyInstaller superseded. Gate 1 — awaiting approval.
│   │   └── distribution-cicd-spec.md                  ← 🚧 GitHub Actions matrix + distribution channel. Revised 2026-05-06: dist.yml downloads prebuilt bridge artifact for all 3 platforms. Track DC1a implemented; full dist.yml matrix awaiting approval.
│   ├── memory/                      ← Persistent on-device knowledge that compounds across sessions
│   │   └── memory-wiki-spec.md                        ← 🚧 On-device LLM wiki (Karpathy pattern). Internal sub-phases M0–M3. Migrated from former Phase 7.
│   └── ui/                          ← Renderer-only UX work
│       ├── waveform-ui-spec.md                        ← ✅ Complete
│       ├── overlay-waveform-polish-spec.md            ← ✅ Complete
│       └── minimized-overlay-waveform-continuity-spec.md ← ✅ Complete
├── explanations/                    ← Evergreen "how does X work" reference (no lifecycle)
│   ├── electron-ipc-and-ws-message-flow.md
│   ├── react-zustand-state-flow.md
│   ├── screen-capture-and-window-filtering.md
│   ├── session-overlay-state-machine.md
│   ├── sidecar-flow.md
│   └── voice-audio-pipeline.md
└── archive/                         ← Obsolete or fully consolidated docs preserved for history
    ├── hackathon-mvp.md                              ← 📦 Consolidated summary of original Phases 0–6
    ├── delfin-implementation-plan.md                 ← 📦 Original 1.5-day hackathon team plan
    └── features/
        ├── litert-cpp-vision-spec.md                 ← 📦 Consolidated into native-windows-backend-research-spec.md §Completed sub-specs
        ├── litert-cpp-audio-spec.md                  ← 📦 Consolidated into native-windows-backend-research-spec.md §Completed sub-specs
        └── litert-cpp-proxy-piper-tts-spec.md        ← 📦 Consolidated into native-windows-backend-research-spec.md §Completed sub-specs
```

**Start with `docs/SPEC.md`** — it contains the architecture overview, tech stack, environment variable reference, WebSocket protocol, IPC channel table, and cross-cutting code rules that apply to every feature. Each feature spec in `docs/features/<area>/` contains its own Gate Resolution block, scope, interface contract, and verification checklist. See `docs/README.md` for the full index with lifecycle status for every document.

When `docs/SPEC.md` and any feature spec conflict, **SPEC.md wins**.

---

## Feature Development Workflow

Every unit of work — whether a new feature spec, a sub-feature within an existing spec, or a bug fix with non-trivial scope — **must** follow these five gates in order. Do not skip or reorder them.

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐     ┌──────────────┐
│  1. SPEC    │────▶│ 2. APPROVAL  │────▶│ 3. IMPLEMENT  │────▶│ 4. REVIEW   │────▶│  5. DOCS     │
│   (agent)   │     │   (human)    │     │   (agent)     │     │   (human)   │     │   (agent)    │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘     └──────────────┘
```

### Gate 1 — Write the Spec (agent)

Before touching any code, produce a spec in chat or as a temporary scratch document. The spec must include:

- **Goal** — one-sentence statement of what this feature does and why it is needed.
- **Scope** — explicit list of files / modules that will be created or modified.
- **Out of scope** — what this work intentionally does not touch.
- **Interface contract** — any new types, IPC channels, WebSocket message shapes, or REST endpoints, written out in full.
- **Acceptance criteria** — concrete, observable conditions (CLI output, UI behaviour, passing tests) that prove the feature is done.
- **Risks / open questions** — anything uncertain that the human reviewer should weigh in on.

> If the work is purely mechanical (e.g. a one-line rename with no interface change) you may abbreviate the spec to Goal + Scope + Acceptance criteria and say so explicitly.

### Gate 2 — Await Human Approval (human)

**Stop. Do not write any implementation code until the human explicitly approves the spec.**

The human reviewer must confirm:

- The interface contract looks correct.
- The scope is neither too broad nor too narrow.
- All open questions are resolved.

Once the human writes **"approved"** (or equivalent), proceed to Gate 3.

### Gate 3 — Implement (agent)

Implement exactly what the approved spec describes — nothing more. Follow all rules in `docs/SPEC.md` §Cross-Cutting Rules. In particular:

- Run the relevant verification checklist from the feature spec before declaring work done.
- Write or update tests that cover the acceptance criteria.
- Keep commits atomic; one logical change per commit.

### Gate 4 — Code Review (human)

Present a summary of every file changed, with a brief rationale for each change. The human reviewer checks:

- Implementation matches the approved spec.
- No accidental scope creep.
- Code quality, types, and error handling meet the cross-cutting rules.
- Tests pass (`npm test` / `pytest`).

Address all review comments before proceeding.

### Gate 5 — Update Documentation (agent)

After the human approves the implementation, update **all** affected documentation. At minimum, check:

| Doc                                                       | Update if…                                                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STATUS.md`                                                  | **Always** — add or update a row for every file touched; set status to ✅ / ⚠️ / ❌ and bump the "Last updated" date                                                                            |
| `docs/README.md`                                             | **Always** — update the status column when a spec changes lifecycle state (🚧 → ✅). Add a row when a new spec is created. Move the row and file to `docs/archive/` when a doc becomes obsolete or fully consolidated. |
| `AGENTS.md` §Documentation Map                               | A new spec was added under `docs/features/<area>/`, or a spec changed lifecycle state — keep the tree's status icons in sync with `docs/README.md`                                              |
| `AGENTS.md` §Current Active Features                         | A whole feature area went from active to maintenance (or vice versa) — add or remove the row to reflect what is actually being worked on                                                        |
| `README.md`                                                  | A user-visible capability was added or removed; the install or run flow changed; a new npm script was added; or a new env var was introduced that users need to know about                      |
| `docs/SPEC.md`                                               | New IPC channel, WebSocket message type, REST endpoint, env var, or arch decision added                                                                                                          |
| Relevant `docs/features/<area>/<name>-spec.md`               | Verification checklist items completed; Gate Resolution block updated to reflect new status and implemented date                                                                                 |
| `AGENTS.md` §Validated Technical Decisions                   | A new confirmed technical fact was established during implementation                                                                                                                             |
| `AGENTS.md` §Nice-to-Haves                                   | A nice-to-have was implemented or explicitly ruled out                                                                                                                                           |
| `.env.example`                                               | A new environment variable was introduced                                                                                                                                                        |

Do **not** create new documentation files unless the spec explicitly called for one.

**Doc lifecycle rule — mark complete, then consolidate, then archive:**

- **Mark a spec ✅ Complete** in its Gate Resolution block and in `docs/README.md` as soon as implementation passes Gate 4. Leave the file in place if the work stands on its own as a design decision record.
- **Consolidate a completed sub-spec into its parent spec** once it is done. A "sub-spec" is any spec whose `Depends on` or framing identifies a parent spec it lives under (e.g. an item in a parent's "Sub-feature map"). When the sub-spec reaches ✅ Gate 5, the agent must:
  1. Add a brief entry summarising the outcome (acceptance criteria met, validation date, key files touched) to a `## Completed sub-specs` section in the parent spec.
  2. Add a 📦 Archived banner to the top of the sub-spec file pointing at the consolidating parent.
  3. `git mv` the sub-spec into `docs/archive/features/`.
  4. Update `docs/README.md` (move the row to the Archive table) and `AGENTS.md` §Documentation Map (move the entry under `archive/features/`).
- **Move a spec straight to `docs/archive/`** without consolidation only when it is **truly obsolete**: the feature was reversed, the interface it described no longer exists, or a newer spec fully supersedes it. In that case, also add the 📦 Archived banner explaining what replaced it.

This consolidation/archival step is part of Gate 5 and is not optional — leaving a string of completed sub-specs alongside an in-flight parent makes the active set unreadable for the next agent.

---

## Current Active Features

The hackathon-era numbered phase sequence (`phase-0-scaffold.md` … `phase-6-polish.md`) was consolidated into [`docs/archive/hackathon-mvp.md`](docs/archive/hackathon-mvp.md) on 2026-05-03. New work is organised by **feature area** under `docs/features/<area>/`. Each feature follows the full Feature Development Workflow above. There is no fixed cross-feature execution order — features are picked up as approved.

Keep this table in sync with [`docs/README.md`](docs/README.md) and [`STATUS.md`](STATUS.md). Move a row out of this table once every spec under that area is ✅ Complete and there is no in-flight work for it.

| Area             | Folder                          | Active specs                                                                                                                            | Top-level acceptance signal                                                                                                                 |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend          | `docs/features/backend/`        | `native-windows-backend-research-spec.md`, `litert-cpp-bridge-runtime-validation-spec.md`, `litert-cpp-audio-input-spec.md`, `litert-cpp-primary-backend-migration-spec.md` | LiteRT-LM C++ bridge runs natively on Windows / macOS / Linux with text + vision + audio parity vs the Python sidecar; llamafile backend removed. |
| Distribution     | `docs/features/distribution/`   | `desktop-distribution-mvp-spec.md`, `distribution-backend-migration-spec.md`, `distribution-packaging-spec.md`, `distribution-cicd-spec.md` | A signed installer for Windows x64 / macOS arm64 / Linux x64 can be downloaded from a GitHub release, runs without WSL2 or a Python runtime on the user's machine, bundles the platform-appropriate `delfin_litert_bridge`, and downloads the `.litertlm` model + Piper voice at first run. |
| Memory           | `docs/features/memory/`         | `memory-wiki-spec.md` (sub-phases M0–M3)                                                                                                | Live turn cites a generated wiki page; PDF drop produces source + entity pages; lint report renders in `MemoryView`.                       |
| UI / UX          | `docs/features/ui/`             | (all ✅ — no active specs)                                                                                                              | n/a — area is in maintenance.                                                                                                               |

---

## Versioning

**Source of truth:** `"version"` in `package.json`. Electron-builder stamps this into the installer filename (`Delfin Setup 0.0.1.exe`, `Delfin-0.0.1.dmg`, etc.) and `app.getVersion()` returns it at runtime.

**Convention:** [semver](https://semver.org/) — `MAJOR.MINOR.PATCH`.
- `PATCH` — bug fixes, internal changes, asset/dependency bumps with no new user-visible behaviour.
- `MINOR` — new user-visible features, new IPC channels, new env vars.
- `MAJOR` — breaking changes to the IPC contract, installer flow, or minimum OS requirements.

**How to cut a release:**

```bash
# Bump version, commit, and tag in one step (choose one):
npm version patch   # 0.0.1 → 0.0.2
npm version minor   # 0.0.1 → 0.1.0
npm version major   # 0.0.1 → 1.0.0

# Then push the commit and the tag:
git push && git push --tags
```

`npm version` updates `package.json`, creates a commit with message `vX.Y.Z`, and creates a git tag `vX.Y.Z`. The tag is what ties a given installer artifact to a specific commit.

**Rules for agents:**
- Never manually edit `"version"` in `package.json` — always use `npm version <level>`.
- Never bump the version as part of a feature or bug-fix commit — version bumps are their own isolated commit produced by `npm version`.
- Never push a version tag without explicit human instruction.
- When asked to bump the version, state what the new version will be and confirm with the user before running `npm version`.

---

## Development Commands

```bash
# Start EVERYTHING — full stack (TypeScript sidecar + Electron/Vite) — primary workflow
npm run dev

# Frontend only (when running the sidecar in a separate terminal)
npm run dev:frontend

# Backend only — TypeScript sidecar with Piper TTS (run `npm run setup` first)
npm run dev:backend

# Mock backend + frontend (UI development, no model needed)
npm run dev:mock

# Deprecated: TypeScript session sidecar + frontend (no inference backend)
npm run dev:sidecar

# First-time setup
npm run setup                  # full setup: env + litert-cpp + env check
npm run setup:litert-cpp       # download prebuilt bridge artifacts + model + Piper voice

# Environment check
bash scripts/setup-check.sh    # macOS / Linux
npm run check:windows          # Windows (PowerShell)

# Piper voice management
npm run voice:list
npm run voice:use -- en_US-hfc_female-medium
npm run voice:install -- en/en_US/hfc_female/medium --use

# Test WebSocket backend manually (install wscat: npm i -g wscat)
wscat -c ws://localhost:8321/ws
# then type: {"text": "Summarize this slide", "preset_id": "lecture-slide"}

# Benchmarks (run-benchmark.mjs auto-provisions scripts/benchmark/.venv)
npm run benchmark:litert-cpp   # LiteRT C++ bridge benchmark (5 runs)
npm run benchmark:litert-py    # Python LiteRT sidecar benchmark — deprecated comparison only
npm run benchmark:sweep        # auto-sweep LITERT_BACKEND=CPU,GPU — spawns the sidecar per config

# Build C++ bridge from source (slow — requires Bazel + LiteRT-LM dep tree)
npm run bridge:build
```

Benchmark output is written to `results/`. Commit `results/.gitkeep` only; do **not** commit generated benchmark JSON/CSV files.

---

## Architecture at a Glance

```
Electron Renderer (React/Zustand)
        ↕ contextBridge (IPC)
Electron Main (Node.js)  ←→  WebSocket ws://localhost:8321/ws  ←→  litert-cpp-proxy.mjs (Node.js)
                                                                      ├── delfin_litert_bridge[.exe] (C++)
                                                                      │     └── LiteRT-LM + Gemma 4 E2B
                                                                      └── piper (TTS subprocess)
```

All inference I/O flows over **WebSocket** (not HTTP POST / SSE). See `docs/SPEC.md` §WebSocket Message Protocol for the full JSON contract.

The C++ bridge is a thin inference kernel (JSONL over stdio). The Node.js proxy is the application layer: WebSocket server, preset resolution, TTS orchestration, health endpoint, session state. See `docs/explanations/sidecar-flow.md` §Why the Proxy Exists for the full boundary map.

---

## Validated Technical Decisions

These are confirmed facts — do not revisit without good reason:

| Decision                          | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image blobs work**              | Pass images as `{"type": "image", "blob": b64_str}` directly — no temp files. Validated by the [Parlor reference impl](https://github.com/fikrikarim/parlor).                                                                                                                                                                                                                                                                                           |
| **Single WebSocket consumer**     | Use an `asyncio.Queue` + one `receiver()` coroutine. Do **not** run two `async for … in ws.iter_text()` loops concurrently — this causes a race condition. Implementation lives in `sidecar/server.py` (see `docs/explanations/sidecar-flow.md` for the walkthrough).                                                                                                                                                                                |
| **Per-connection closure**        | Define `respond_to_user` and `tool_result` inside `ws_endpoint()` as a closure, not as module-level globals. This prevents data races between concurrent connections.                                                                                                                                                                                                                                                                                   |
| **JSON extraction fallback**      | When the model does not call the `respond_to_user` tool, `_extract_structured_from_text()` tries to parse `Summary:` / `Answer:` / `Key points:` from the raw output before falling back to raw token streaming.                                                                                                                                                                                                                                        |
| **Rolling hash for auto-refresh** | Sample base64 at 0%, 25%, 50%, 75% (2 KB each) before hashing — not just the head. Avoids false negatives on slides with shared background templates.                                                                                                                                                                                                                                                                                                   |
| **VAD library**                   | `@ricky0123/vad-web` (Silero ONNX in browser). Use the browser-runtime pattern: self-host `bundle.min.js` plus `onnxruntime-web`'s `ort.wasm.min.js` and `ort-wasm*` files under `vad-runtime/`, load them via script tags, and pass absolute `baseAssetPath` / `onnxWASMBasePath` URLs from `document.baseURI`. Requires `SharedArrayBuffer` → set COOP/COEP headers via `session.defaultSession.webRequest.onHeadersReceived` in `src/main/index.ts`. |
| **Voice turn text field**         | For pure voice turns, `text` is set to the constant `VOICE_TURN_TEXT = "Please respond to what the user just asked."`. Empty string is not used because `sessionHandlers.ts` has an empty-text guard; the fixed instruction also gives the model explicit context about its role.                                                                                                                                                                       |
| **Audio backend**                 | `audio_backend` in `litert_lm.Engine` is always CPU (GPU audio not supported). Exposed as `LITERT_AUDIO_BACKEND` env var but defaults to `CPU`. The engine already has `audio_backend=litert_lm.Backend.CPU` in both GPU-attempt and CPU-fallback paths.                                                                                                                                                                                                |
| **Web Speech fallback cleanup**  | When the renderer falls back to `SpeechSynthesisUtterance`, it must clear the assistant-speaking state on `onend` / `onerror`. If that state is left `true`, the VAD auto-mute effect never releases and later voice turns appear dead even though `vad-web` is still mounted.                                                                                                                                                                         |
| **LiteRT C++ proxy TTS**         | `npm run dev:backend` bypasses `sidecar/tts.py`. Off-Python speech on that path is controlled by `LITERT_CPP_TTS_BACKEND`; with `piper`, `scripts/litert-cpp-proxy.mjs` emits `audio_start` / `audio_chunk` / `audio_end` before final `done` as completed sentences arrive, plus conservative long partial chunks controlled by `LITERT_CPP_TTS_SOFT_MIN_CHARS` / `LITERT_CPP_TTS_SOFT_MAX_CHARS`. **Dev mode:** `npm run setup:litert-cpp` bootstraps a repo-local pinned `piper-tts` Python runtime under `bin/piper/venv`, repairs missing companion packages such as `pathvalidate`, installs/activates the default Piper voice, and writes the required `PIPER_*` values automatically. **Packaged app:** Piper is NOT bundled in the installer. `assetManager.ts` downloads a standalone Piper binary (GitHub releases, platform-specific zip/tar.gz) and the voice ONNX+config from HuggingFace into `app.getPath('userData')` on first run — Python is not required on the end-user's machine. `backendProcess.ts` resolves `PIPER_BIN`/`PIPER_MODEL`/`PIPER_CONFIG` from `userData` paths. If Piper is disabled, misconfigured, or fails mid-turn, the proxy still completes and the renderer falls back to browser Web Speech.                                                                 |
| **Barge-in protection**           | Two-layer: (1) raise Silero `positiveSpeechThreshold` from 0.50 → 0.92 while AI is speaking; (2) 800 ms grace period after `audio_start` during which `onSpeechStart` is silently ignored, preventing the mic from picking up the AI's own voice.                                                                                                                                                                                                       |
| **WSL2 espeak-ng fix**            | `espeakng_loader` can ship a Linux `.so` with a hardcoded CI data path. On WSL2/Linux, patch the baked-in share path to a short symlink (currently `/tmp/espk`) that points at the packaged `espeak-ng-data` directory before using `kokoro-onnx`.                                                                                                                                                                                                      |
| **Benchmark harness**             | `scripts/benchmark/run.py` compares the current LiteRT sidecar over WebSocket with llamafile/`llama-server` over OpenAI-compatible REST streaming. It measures TTFT, throughput, total turn time, approximate/exact output token count, peak RSS when a PID is available, and system metadata.                                                                                                                                                          |
| **Benchmark outputs**             | Benchmark runs write JSON plus an append-friendly daily CSV under `results/`. Keep `results/.gitkeep`; generated result files are runtime artifacts and should stay gitignored.                                                                                                                                                                                                                                                                         |
| **One-shot LiteRT C++ setup**     | `npm run setup:litert-cpp` is artifact-first on supported hosts: existing `bin/` bridge files → matching CI workflow artifact via `gh` (`delfin-litert-bridge-windows-x64`, `delfin-litert-bridge-macos-arm64`, `delfin-litert-bridge-linux-x64`) → model + Piper runtime/voice + `.env`. It must not silently fall back to Bazel/source builds. Backend developers use `--source-build` (or compatibility `--bridge-source build`) to clone/use LiteRT-LM and build locally. Use `--wsl2-instructions` to print the older WSL2 guidance. macOS is arm64 only (Intel Macs out of scope).                   |
| **LITERT_LM_REF pin**             | The constant `LITERT_LM_REF` in `scripts/setup-litert-cpp.mjs` (overridable via the env var of the same name) is the single source of truth for which upstream LiteRT-LM tag both the local setup script and the CI matrix workflow clone and build against. The CI workflow reads it at runtime via `node -e`. **Always bump `MODEL_REVISION` in the same commit** — the two constants must stay in sync so the downloaded model's ABI matches the bridge. Bump procedure: (1) update `LITERT_LM_REF` to the new tag; (2) find the matching HuggingFace commit SHA from `https://huggingface.co/api/models/<MODEL_REPO>/commits/main`; (3) set `MODEL_REVISION` to that SHA; (4) commit and push — CI rebuilds the bridge artifacts automatically; (5) wait for the CI run to succeed, then run `npm run setup:litert-cpp` locally — it reads `bin/bridge.version` and re-downloads when the installed ref doesn't match the new pin (no `--bridge-source artifact` flag needed). |
| **Bridge version tracking**       | `scripts/setup-litert-cpp.mjs` writes `bin/bridge.version` (gitignored, runtime-only) containing the `LITERT_LM_REF` string after every successful bridge download or source build. `resolveBridgePlan()` reads it on subsequent runs: if the file is missing or its contents don't match the pinned `LITERT_LM_REF`, the plan switches from `existing` to `artifact` (a download) automatically and logs `Bridge version mismatch: installed X, required Y — re-downloading`. This is what makes the bump procedure above "just work" without extra flags. |
| **CI bridge binary workflow**     | `.github/workflows/build-litert-cpp-bridge.yml` owns native bridge binary production for all three platforms (windows-x64, macos-arm64, linux-x64). It triggers on push/PR to `main`, on `release.published`, and on `workflow_dispatch`. It uploads per-platform archives as workflow artifacts and attaches them to GitHub Releases. The full `dist.yml` electron-builder packaging matrix (Track DC1) should consume these artifacts rather than rebuilding the bridge inline. |
| **Bridge-minimal design**         | The C++ bridge (`native/litert-cpp-bridge/delfin_litert_bridge.cc`) is a thin inference kernel — it loads the model, streams tokens, manages per-session KV-cache, and handles interrupts. Nothing else. All application-layer concerns (WebSocket server, TTS, preset resolution, health endpoint, per-connection session state, error formatting) live in `scripts/litert-cpp-proxy.mjs`. **A new Delfin feature belongs in the proxy by default.** It only touches the bridge if it requires a new LiteRT-LM API call, a new hardware backend, or a new content modality. This keeps bridge rebuilds rare (Bazel + full LiteRT-LM dep tree is slow). The bridge's `done` event carries only `{"type":"done","requestId":"..."}` — no text echo; the proxy uses its own accumulated `streamedText` for TTS and downstream use. See `docs/explanations/sidecar-flow.md` §Why the Proxy Exists for the full boundary map. |

---

## Cross-Cutting Rules (Summary)

Full rules are in `docs/SPEC.md` §Cross-Cutting Rules. Key points:

- **TypeScript**: strict mode, **no `any` types** — use proper types or `unknown`
- **Python**: 3.12+, snake_case files, standard imports
- **Types**: all WebSocket + IPC types live in `src/shared/types.ts`; validated with Zod in `src/shared/schemas.ts`
- **Config**: all machine-specific values from `.env`; never hardcoded; `.env.example` committed, `.env` gitignored
- **Errors**: never crash the sidecar — catch everything, return `{"type": "error", "message": "..."}` over WebSocket
- **IPC errors**: catch in main process handlers, forward to renderer as `sidecar:error`; display inline in chat, not as alert dialogs
- **CSS**: Tailwind utility classes only; one `globals.css`; no per-component CSS files
- **React**: cleanup all IPC listeners in `useEffect` return — call `api.removeAllListeners(channel)` for every channel registered
- **Benchmark scripts**: keep standalone tooling under `scripts/benchmark/`; do not wire benchmark-only dependencies or output files into the Electron app runtime

---

## Nice-to-Haves (implement only if time allows)

- Conversation history trimming in the Python sidecar (`sidecar/server.py` keeps the full per-connection turn list; see `docs/explanations/sidecar-flow.md`).
- Wayland support on Linux native (desktopCapturer may require additional Electron flags)
