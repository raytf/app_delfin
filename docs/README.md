# Delfin — Documentation Index

> **Start here.** This file is the single index for every document in `docs/`. Check it when looking for a spec, when updating a doc's status, or when deciding where a new document belongs.
>
> Status labels: 🟢 Active · 🚧 In Progress · ✅ Complete · 📦 Archived

---

## Global reference

| File                                     | Status    | Description                                                                                                                                                                                   |
| ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)                     | 🟢 Active | Single source of truth — architecture, IPC channels, WebSocket protocol, env vars, and cross-cutting rules. **Read this first.** When any other doc conflicts with `SPEC.md`, `SPEC.md` wins. |
| [`design-ai-spec.md`](design-ai-spec.md) | 🟢 Active | Product and brand brief — Delfin persona, visual direction, interaction model, and screen inventory. Reference for design decisions.                                                          |

---

## How docs are organised

Each unit of work lives under `docs/features/<area>/<name>-spec.md` and follows the Gate 1→5 workflow defined in [`AGENTS.md`](../AGENTS.md). Every spec tracks its own state in a Gate Resolution block at the top.

The hackathon MVP that established the current app (Electron shell, sidecar, screen capture, voice/TTS, persistent sessions) was originally tracked across seven numbered phase docs. Those have been consolidated into [`archive/hackathon-mvp.md`](archive/hackathon-mvp.md); the project is now organised by feature area instead of by phase.

---

## Setup & validation guides

These are operator runbooks for getting the app or native backend running on a specific OS. They do not follow the Gate lifecycle used by feature specs.

| File                                                                                               | Status    | Description                                                                                                      |
| -------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| [`features/backend/testing-guide-macos.md`](features/backend/testing-guide-macos.md)               | 🟢 Active | Full macOS setup + validation guide for the native LiteRT-LM C++ backend.                                      |
| [`features/backend/testing-guide-linux.md`](features/backend/testing-guide-linux.md)               | 🟢 Active | Full Linux x64 / WSL2 setup + validation guide for the native LiteRT-LM C++ backend.                           |
| [`features/backend/testing-guide-windows.md`](features/backend/testing-guide-windows.md)           | 🟢 Active | Full Windows guide covering both the default WSL2 flow and native Windows CI-artifact / local-build validation. |

---

## Backend (`features/backend/`)

Inference engines, native bridges, and benchmarking. Goal: a future-proof, cross-platform inference backend that does not require WSL2 on Windows.

| File                                                                                                                       | Status         | Description                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`features/backend/native-windows-backend-research-spec.md`](features/backend/native-windows-backend-research-spec.md)     | 🚧 In Progress | Sequential native Windows backend validation. Track A (LiteRT-LM C++) preferred; Foundry Local as contingency. Windows build + text + vision/KV-cache validated; macOS/Linux builds pending. Now records the §Developer environment policy: Linux / macOS (arm64) / WSL2 default + `--native-windows` opt-in. |
| [`features/backend/litert-cpp-bridge-runtime-validation-spec.md`](features/backend/litert-cpp-bridge-runtime-validation-spec.md) | 🚧 In Progress | Phase 1 (Windows S1/S2/S3 benchmark) complete; Phase 2 (manual app round) partial; Phases 3–4 (macOS / Linux / WSL2 builds via the new default Unix dev environment) pending. |
| [`features/backend/litert-cpp-audio-input-spec.md`](features/backend/litert-cpp-audio-input-spec.md)                       | ✅ Complete    | Audio input parity for the C++ bridge. AC1–AC7 validated on Windows (2026-05-03). macOS/Linux audio pending cross-platform builds.                                           |
| [`features/backend/litert-cpp-primary-backend-migration-spec.md`](features/backend/litert-cpp-primary-backend-migration-spec.md) | 🚧 In Progress | Umbrella for promoting the LiteRT C++ bridge to the default inference backend on all OSes. M1 (audio) ✅, M3 (Piper TTS) ✅; M2 (tool-calling) + M4 (macOS/Linux builds) pending. |
| [`features/backend/inference-benchmarking-spec.md`](features/backend/inference-benchmarking-spec.md)                       | ✅ Complete    | Standalone benchmark harness (`scripts/benchmark/`) comparing LiteRT-LM, LiteRT-CPP, and llamafile (TTFT, throughput, memory).                                               |

---

## Distribution (`features/distribution/`)

Packaging, installer, code signing, and CI/CD. Goal: a one-click installable build for student testers.

| File                                                                                                               | Status         | Description                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`features/distribution/desktop-distribution-mvp-spec.md`](features/distribution/desktop-distribution-mvp-spec.md) | 🚧 In Progress | Cross-platform distribution decision record. Revised 2026-05-03: LiteRT-LM C++ bridge on Windows (llamafile removed); frozen Python sidecar on macOS/Linux. Gate 1 approved. |
| [`features/distribution/distribution-backend-migration-spec.md`](features/distribution/distribution-backend-migration-spec.md) | 🚧 In Progress | Wire `scripts/litert-cpp-proxy.mjs` into the packaged Electron Windows runtime. Revised 2026-05-03: DM0 llamafile proxy superseded by LiteRT-LM C++ proxy wiring. Gate 1 — awaiting approval. |
| [`features/distribution/distribution-packaging-spec.md`](features/distribution/distribution-packaging-spec.md)     | 🚧 In Progress | electron-builder config, first-run download orchestration, NSIS/DMG/AppImage installers, GPU stretch goal. Gate 1 — awaiting approval.                                |
| [`features/distribution/distribution-cicd-spec.md`](features/distribution/distribution-cicd-spec.md)               | 🚧 In Progress | GitHub Actions matrix builds, distribution channel recommendations, code signing guide. **Track DC1a partially implemented 2026-05-04** as `.github/workflows/build-litert-cpp-bridge.yml` (native bridge binaries for windows-x64 / macos-arm64 / linux-x64). Full `dist.yml` electron-builder matrix still awaiting approval. |

---

## Memory (`features/memory/`)

Persistent on-device knowledge that compounds across sessions.

| File                                                                                                 | Status         | Description                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`features/memory/memory-wiki-spec.md`](features/memory/memory-wiki-spec.md)                         | 🚧 In Progress | On-device LLM wiki (Karpathy pattern) maintained by Gemma 4 across sessions. Internal sub-phases M0 (E2B viability spike) → M3 (file ingest + runtime tools + lint). Migrated from former Phase 7. |

---

## UI / UX (`features/ui/`)

Voice waveform, overlay polish, and other renderer-only UX work.

| File                                                                                                                       | Status      | Description                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| [`features/ui/waveform-ui-spec.md`](features/ui/waveform-ui-spec.md)                                                       | ✅ Complete | Reusable `VoiceWaveform` component — state-based colour, per-bar amplitude, user/AI/idle modes.            |
| [`features/ui/overlay-waveform-polish-spec.md`](features/ui/overlay-waveform-polish-spec.md)                               | ✅ Complete | Compact overlay resize and shift to analyser-driven per-bar waveform rendering.                            |
| [`features/ui/minimized-overlay-waveform-continuity-spec.md`](features/ui/minimized-overlay-waveform-continuity-spec.md)   | ✅ Complete | Persistent waveform/status chrome across all minimized overlay variants.                                   |

---

## Reference explanations (`explanations/`)

These are not specs — they are evergreen "how does X work" technical write-ups. They do not follow the Gate workflow and do not have lifecycle states.

| File                                                                                                         | Description                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [`explanations/electron-ipc-and-ws-message-flow.md`](explanations/electron-ipc-and-ws-message-flow.md)       | How a prompt travels renderer → main → sidecar and back      |
| [`explanations/react-zustand-state-flow.md`](explanations/react-zustand-state-flow.md)                       | How React components read from and write to Zustand stores   |
| [`explanations/screen-capture-and-window-filtering.md`](explanations/screen-capture-and-window-filtering.md) | How `desktopCapturer` selects the foreground window          |
| [`explanations/session-overlay-state-machine.md`](explanations/session-overlay-state-machine.md)             | The overlay mode/variant state machine                       |
| [`explanations/sidecar-flow.md`](explanations/sidecar-flow.md)                                               | Inside the FastAPI sidecar — turn lifecycle and tool calling |
| [`explanations/voice-audio-pipeline.md`](explanations/voice-audio-pipeline.md)                               | VAD, voice capture, TTS playback, and barge-in               |

---

## Future ideas (not yet scoped)

Unscoped ideas being collected for future student-user testing. None of these are committed work — they need a Gate 1 spec before any implementation. When one is ready to scope, create `docs/features/roadmap/<name>-spec.md` (the `roadmap/` folder is created on demand) or place it directly under the matching area folder, then move the bullet from this list into the appropriate feature table above.

### Reliability

- **Sidecar crash recovery** — auto-restart the WebSocket sidecar on crash with backoff; surface inline reconnection state in the chat box rather than a blocking error.
- **Resumable model downloads** — make `npm run download:models` and the first-run installer flow resumable so a flaky network does not force a 340 MB / 3.4 GB redownload.
- **Local crash logs** — opt-in, on-device-only structured crash log file users can attach manually when reporting bugs (no telemetry, no network calls).
- **Health metric on startup** — surface backend, model file, vision-token budget, and load time in the UI for faster bug reports.
- **Conversation history trimming** — implement the long-standing "nice-to-have" so long study sessions do not blow the model's context window.
- **Health-check polling** — replace the placeholder `healthCheck.ts` with real backend/model metadata polling.

### UX once real users are testing

- **First-run onboarding** — a short guided flow covering mic/screen permissions, name/preset selection, and a sample lecture-slide capture.
- **In-app feedback** — a single "send feedback" button that captures the last turn (transcript + screenshot, with one-click redaction) into a local JSON file the user can email or attach to a GitHub issue.
- **Session quality rating** — at end of session, prompt the user "Was this useful?" with thumbs-up/down + optional reason, stored locally for product analysis.
- **Markdown rendering in chat** — render assistant Markdown (lists, code, math) instead of plain text.
- **Dark mode toggle** — currently the UI is single-themed.
- **Manual window picker** — fallback UI when the foreground-window heuristic picks the wrong window.
- **Global hotkey** — `Ctrl+Shift+C` (or configurable) to capture-and-ask without alt-tabbing.
- **Manual stop / interrupt UI** — the interrupt channel exists; expose a user-visible stop control.

---

## Archive (`archive/`)

Documents that are no longer active but are preserved for historical context.

| File                                                                                                       | Status      | Description                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`archive/hackathon-mvp.md`](archive/hackathon-mvp.md)                                                     | 📦 Archived | Consolidated summary of the original numbered Phases 0–6 (Electron scaffold → polish). Replaces the deleted `phase-0-scaffold.md` … `phase-6-polish.md` files.       |
| [`archive/delfin-implementation-plan.md`](archive/delfin-implementation-plan.md)                           | 📦 Archived | Original 1.5-day hackathon team plan (streams A/B/C, Saturday/Sunday schedule). Superseded by the hackathon MVP archive and `SPEC.md`.                              |
| [`archive/features/litert-cpp-vision-spec.md`](archive/features/litert-cpp-vision-spec.md)                 | 📦 Archived | Sub-spec of `native-windows-backend-research-spec.md`. Outcome consolidated into the parent spec's §Completed sub-specs section.                                    |
| [`archive/features/litert-cpp-audio-spec.md`](archive/features/litert-cpp-audio-spec.md)                   | 📦 Archived | Sub-spec of `native-windows-backend-research-spec.md`. Outcome consolidated into the parent spec's §Completed sub-specs section.                                    |
| [`archive/features/litert-cpp-proxy-piper-tts-spec.md`](archive/features/litert-cpp-proxy-piper-tts-spec.md) | 📦 Archived | Sub-spec of `native-windows-backend-research-spec.md`. Outcome consolidated into the parent spec's §Completed sub-specs section and referenced by the distribution backend migration spec. |

---

## How to update this index

| When                                                                          | What to do                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A feature spec moves 🚧 In Progress → ✅ Complete                             | Update the status cell in its area table.                                                                                                                                                                             |
| A completed sub-spec is fully consolidated into a parent spec                 | Move the file to `archive/features/`, add a 📦 Archived banner to the top of the file pointing at the consolidating doc, summarise the outcome inside the parent's §Completed sub-specs section, and update both this index and `AGENTS.md` §Documentation Map. (See `AGENTS.md` for the full rule.) |
| A new feature spec is created                                                 | Add a row to the matching area table; if the area subfolder doesn't exist yet, create it.                                                                                                                              |
| A new explanation is added                                                    | Add a row to the `explanations/` table.                                                                                                                                                                                |
| A future idea is ready to scope                                               | Move it from the "Future ideas" list into a new `features/<area>/<name>-spec.md` and remove the bullet here.                                                                                                          |
| A doc becomes obsolete                                                        | Move it to `archive/` and update this index.                                                                                                                                                                           |
