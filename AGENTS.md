# AGENTS.md — Delfin

> **For AI coding agents.** Read this file first. It tells you what to build, where the specs live, and what rules to follow.

---

## What Is Delfin?

A local, privacy-first AI desktop sidebar (Electron + React) that captures the foreground window, sends the screenshot to an on-device LLM (Gemma 4 via LiteRT-LM), and streams back a structured explanation. No cloud, no login, no API costs. Primary demo: **Lecture Slide Explainer**.

---

## Documentation Map

```
STATUS.md                            ← Live feature status tracker. Update after every implementation change.
docs/
├── README.md                        ← Doc index with status for every file. Check here first.
├── SPEC.md                          ← Single source of truth. Read this first.
├── design-ai-spec.md                ← Product and brand brief
├── features/                        ← Independent feature specs (Gate 1→5 lifecycle, any phase)
│   ├── desktop-distribution-mvp-spec.md   ← 🚧 In Progress
│   ├── waveform-ui-spec.md                ← ✅ Complete
│   ├── overlay-waveform-polish-spec.md    ← ✅ Complete
│   └── minimized-overlay-waveform-continuity-spec.md ← ✅ Complete
├── phases/                          ← Numbered product phases (completed in order)
│   ├── phase-0-scaffold.md          ← ✅ Repo structure, deps, .env, setup scripts
│   ├── phase-1-sidecar.md           ← ✅ FastAPI sidecar, LiteRT-LM, tool calling
│   ├── phase-2-electron.md          ← ✅ Overlay window, desktopCapturer, WebSocket client
│   ├── phase-3-ui.md                ← ✅ React components, Zustand stores, streaming UI
│   ├── phase-4-integration.md       ← ✅ Wire all layers together, error handling
│   ├── phase-5-autorefresh-tts.md   ← ✅ Auto-refresh, TTS pipeline, audio playback
│   ├── phase-6-polish.md            ← ✅ Visual polish, perf, demo prep
│   └── phase-7-memory.md            ← 🚧 Persistent on-device memory wiki
├── explanations/                    ← Evergreen "how does X work" reference (no lifecycle)
│   ├── electron-ipc-and-ws-message-flow.md
│   ├── react-zustand-state-flow.md
│   ├── screen-capture-and-window-filtering.md
│   ├── session-overlay-state-machine.md
│   ├── sidecar-flow.md
│   └── voice-audio-pipeline.md
└── archive/                         ← Obsolete docs preserved for history
    └── delfin-implementation-plan.md ← 📦 Original hackathon team plan
```

**Start with `docs/SPEC.md`** — it contains the architecture overview, tech stack, environment variable reference, WebSocket protocol, IPC channel table, and cross-cutting code rules that apply to every phase. Each phase doc in `docs/phases/` then contains detailed pseudocode and a verification checklist for that phase only. See `docs/README.md` for the full index with lifecycle status for every document.

When `docs/SPEC.md` and any phase doc conflict, **SPEC.md wins**.

---

## Feature Development Workflow

Every unit of work — whether a new phase, a sub-feature within a phase, or a bug fix with non-trivial scope — **must** follow these five gates in order. Do not skip or reorder them.

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

- Run the relevant verification checklist from the phase doc before declaring work done.
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

| Doc | Update if… |
|---|---|
| `STATUS.md` | **Always** — update the status of every file or feature touched (✅ / ⚠️ / ❌) and bump the "Last updated" date |
| `docs/README.md` | **Always** — update the status column for any feature or phase spec whose lifecycle state changed (🚧 → ✅). If a new spec file was created, add a row. If a doc became obsolete, move it to `docs/archive/` and update the row. |
| `docs/SPEC.md` | New IPC channel, WebSocket message type, env var, or arch decision added |
| Relevant `docs/phases/phase-N.md` or `docs/features/*.md` | Verification checklist items completed; Gate Resolution block updated to reflect new status and implemented date |
| `AGENTS.md` §Validated Technical Decisions | A new confirmed technical fact was established during implementation |
| `AGENTS.md` §Nice-to-Haves | A nice-to-have was implemented or explicitly ruled out |
| `.env.example` | A new environment variable was introduced |

Do **not** create new documentation files unless the spec explicitly called for one.

**Doc lifecycle rule — when to archive vs. when to mark complete:**
- Mark a spec ✅ Complete (in its Gate Resolution block and in `docs/README.md`) when implementation is done. Leave the file in place — completed specs are design decision records, not clutter.
- Move a spec to `docs/archive/` only when it is **truly obsolete**: the feature was reversed, the interface it described no longer exists, or a newer spec fully supersedes it.

---

## Phase Execution Order

Complete phases in order. Each phase follows the full Feature Development Workflow above before the gate is considered passed.

| # | Phase doc | Acceptance Gate |
|---|---|---|
| 0 | `docs/phases/phase-0-scaffold.md` | `npm run dev:full` starts Electron + sidecar; `/health` returns JSON |
| 1 | `docs/phases/phase-1-sidecar.md` | WebSocket turn returns structured response via `wscat` |
| 2 | `docs/phases/phase-2-electron.md` | Capture button grabs foreground window; mock sidecar responds |
| 3 | `docs/phases/phase-3-ui.md` | Full sidebar UI renders against mock sidecar |
| 4 | `docs/phases/phase-4-integration.md` | Core demo works end-to-end with real model |
| 5 | `docs/phases/phase-5-autorefresh-tts.md` | Slide change triggers auto-capture; TTS reads response |
| 6 | `docs/phases/phase-6-polish.md` | App is demo-ready |

---

## Development Commands

```bash
# Start EVERYTHING from one command (Electron + Vite dev server + Python sidecar)
npm run dev:full

# Electron + Vite only (when running sidecar separately or using mock)
npm run dev

# Mock sidecar (use while building Electron UI — no model needed)
node scripts/mock-sidecar.js

# Real sidecar only (from repo root, inside a venv)
cd sidecar
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8321

# Environment check
bash scripts/setup-check.sh

# Test WebSocket sidecar manually (install wscat: npm i -g wscat)
wscat -c ws://localhost:8321/ws
# then type: {"text": "Summarize this slide", "preset_id": "lecture-slide"}
```

---

## Architecture at a Glance

```
Electron Renderer (React/Zustand)
        ↕ contextBridge (IPC)
Electron Main (Node.js)  ←→  WebSocket ws://localhost:8321/ws  ←→  Python FastAPI sidecar
                                                                      └── LiteRT-LM + Gemma 4 E2B
```

All inference I/O flows over **WebSocket** (not HTTP POST / SSE). See `docs/SPEC.md` §WebSocket Message Protocol for the full JSON contract.

---

## Validated Technical Decisions

These are confirmed facts — do not revisit without good reason:

| Decision | Detail |
|---|---|
| **Image blobs work** | Pass images as `{"type": "image", "blob": b64_str}` directly — no temp files. Validated by the [Parlor reference impl](https://github.com/fikrikarim/parlor). |
| **Single WebSocket consumer** | Use an `asyncio.Queue` + one `receiver()` coroutine. Do **not** run two `async for … in ws.iter_text()` loops concurrently — this causes a race condition. See `docs/phases/phase-1-sidecar.md` §1.4. |
| **Per-connection closure** | Define `respond_to_user` and `tool_result` inside `ws_endpoint()` as a closure, not as module-level globals. This prevents data races between concurrent connections. |
| **JSON extraction fallback** | When the model does not call the `respond_to_user` tool, `_extract_structured_from_text()` tries to parse `Summary:` / `Answer:` / `Key points:` from the raw output before falling back to raw token streaming. |
| **Rolling hash for auto-refresh** | Sample base64 at 0%, 25%, 50%, 75% (2 KB each) before hashing — not just the head. Avoids false negatives on slides with shared background templates. |
| **VAD library** | `@ricky0123/vad-web` (Silero ONNX in browser). Use the browser-runtime pattern: self-host `bundle.min.js` plus `onnxruntime-web`'s `ort.wasm.min.js` and `ort-wasm*` files under `vad-runtime/`, load them via script tags, and pass absolute `baseAssetPath` / `onnxWASMBasePath` URLs from `document.baseURI`. Requires `SharedArrayBuffer` → set COOP/COEP headers via `session.defaultSession.webRequest.onHeadersReceived` in `src/main/index.ts`. |
| **Voice turn text field** | For pure voice turns, `text` is set to the constant `VOICE_TURN_TEXT = "Please respond to what the user just asked."`. Empty string is not used because `sessionHandlers.ts` has an empty-text guard; the fixed instruction also gives the model explicit context about its role. |
| **Audio backend** | `audio_backend` in `litert_lm.Engine` is always CPU (GPU audio not supported). Exposed as `LITERT_AUDIO_BACKEND` env var but defaults to `CPU`. The engine already has `audio_backend=litert_lm.Backend.CPU` in both GPU-attempt and CPU-fallback paths. |
| **Barge-in protection** | Two-layer: (1) raise Silero `positiveSpeechThreshold` from 0.50 → 0.92 while AI is speaking; (2) 800 ms grace period after `audio_start` during which `onSpeechStart` is silently ignored, preventing the mic from picking up the AI's own voice. |
| **WSL2 espeak-ng fix** | `espeakng_loader` can ship a Linux `.so` with a hardcoded CI data path. On WSL2/Linux, patch the baked-in share path to a short symlink (currently `/tmp/espk`) that points at the packaged `espeak-ng-data` directory before using `kokoro-onnx`. |

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

---

## Nice-to-Haves (implement only if time allows)

- Conversation history trimming (see `docs/phases/phase-1-sidecar.md` §1.5)
- Wayland support on Linux native (desktopCapturer may require additional Electron flags)
