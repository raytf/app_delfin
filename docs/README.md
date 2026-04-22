# Delfin — Documentation Index

> **Start here.** This file is the single index for every document in `docs/`. Check it when looking for a spec, when updating a doc's status, or when deciding where a new document belongs.
>
> Status labels: 🟢 Active · 🚧 In Progress · ✅ Complete · 📦 Archived

---

## Global reference

| File | Status | Description |
|---|---|---|
| [`SPEC.md`](SPEC.md) | 🟢 Active | Single source of truth — architecture, IPC channels, WebSocket protocol, env vars, and cross-cutting rules. **Read this first.** When any other doc conflicts with `SPEC.md`, `SPEC.md` wins. |
| [`design-ai-spec.md`](design-ai-spec.md) | 🟢 Active | Product and brand brief — Delfin persona, visual direction, interaction model, and screen inventory. Reference for design decisions. |

---

## Phase specs (`phases/`)

Each phase follows the full Gate 1→5 workflow. Phases are completed in order.

| File | Status | Description |
|---|---|---|
| [`phases/phase-0-scaffold.md`](phases/phase-0-scaffold.md) | ✅ Complete | Repo structure, configs, `.env`, dependencies, setup scripts |
| [`phases/phase-1-sidecar.md`](phases/phase-1-sidecar.md) | ✅ Complete | FastAPI server, LiteRT-LM engine, tool calling, image preprocessing |
| [`phases/phase-2-electron.md`](phases/phase-2-electron.md) | ✅ Complete | Overlay window, `desktopCapturer`, WebSocket client, IPC handlers |
| [`phases/phase-3-ui.md`](phases/phase-3-ui.md) | ✅ Complete | React components, Zustand stores, streaming UI |
| [`phases/phase-4-integration.md`](phases/phase-4-integration.md) | ✅ Complete | Wire all layers together, error handling, status reporting |
| [`phases/phase-5-autorefresh-tts.md`](phases/phase-5-autorefresh-tts.md) | ✅ Complete | Auto-refresh with debounce, TTS pipeline, audio playback |
| [`phases/phase-6-polish.md`](phases/phase-6-polish.md) | ✅ Complete | Styling, error states, perf optimisations, demo prep |
| [`phases/phase-7-memory.md`](phases/phase-7-memory.md) | 🚧 In Progress | Persistent on-device memory wiki (Karpathy LLM-wiki pattern) |

---

## Feature specs (`features/`)

Independent features that do not fit the numbered phase sequence. Each has a Gate Resolution table at the top showing its current lifecycle state.

| File | Status | Description |
|---|---|---|
| [`features/desktop-distribution-mvp-spec.md`](features/desktop-distribution-mvp-spec.md) | ✅ Complete | Native per-platform installers with a bundled Python sidecar and first-run model download. Ollama backend for native Windows. Gate 1 approved. |
| [`features/waveform-ui-spec.md`](features/waveform-ui-spec.md) | ✅ Complete | Reusable `VoiceWaveform` component — state-based colour, per-bar amplitude, user/AI/idle modes |
| [`features/overlay-waveform-polish-spec.md`](features/overlay-waveform-polish-spec.md) | ✅ Complete | Compact overlay resize and shift to analyser-driven per-bar waveform rendering |
| [`features/minimized-overlay-waveform-continuity-spec.md`](features/minimized-overlay-waveform-continuity-spec.md) | ✅ Complete | Persistent waveform/status chrome across all minimized overlay variants |

---

## Reference explanations (`explanations/`)

These are not specs — they are evergreen "how does X work" technical write-ups. They do not follow the Gate workflow and do not have lifecycle states.

| File | Description |
|---|---|
| [`explanations/electron-ipc-and-ws-message-flow.md`](explanations/electron-ipc-and-ws-message-flow.md) | How a prompt travels renderer → main → sidecar and back |
| [`explanations/react-zustand-state-flow.md`](explanations/react-zustand-state-flow.md) | How React components read from and write to Zustand stores |
| [`explanations/screen-capture-and-window-filtering.md`](explanations/screen-capture-and-window-filtering.md) | How `desktopCapturer` selects the foreground window |
| [`explanations/session-overlay-state-machine.md`](explanations/session-overlay-state-machine.md) | The overlay mode/variant state machine |
| [`explanations/sidecar-flow.md`](explanations/sidecar-flow.md) | Inside the FastAPI sidecar — turn lifecycle and tool calling |
| [`explanations/voice-audio-pipeline.md`](explanations/voice-audio-pipeline.md) | VAD, voice capture, TTS playback, and barge-in |

---

## Archive (`archive/`)

Documents that are no longer active but are preserved for historical context.

| File | Status | Description |
|---|---|---|
| [`archive/delfin-implementation-plan.md`](archive/delfin-implementation-plan.md) | 📦 Archived | Original 1.5-day hackathon team plan (streams A/B/C, Saturday/Sunday schedule). Superseded by the phase docs and `SPEC.md`. |

---

## How to update this index

| When | What to do |
|---|---|
| A feature spec moves from 🚧 In Progress to ✅ Complete | Update the status cell in the `features/` table |
| A new feature spec is created | Add a row to the `features/` table |
| A new phase is added | Add a row to the `phases/` table |
| A new explanation is added | Add a row to the `explanations/` table |
| A doc becomes obsolete | Move it to `archive/` and update this index |
