# AGENTS.md — Screen Copilot

> **For AI coding agents.** Read this file first. It tells you what to build, where the specs live, and what rules to follow.

---

## What Is Screen Copilot?

A local, privacy-first AI desktop sidebar (Electron + React) that captures the foreground window, sends the screenshot to an on-device LLM (Gemma 4 via LiteRT-LM), and streams back a structured explanation. No cloud, no login, no API costs. Primary demo: **Lecture Slide Explainer**.

---

## Documentation Map

```
docs/
├── SPEC.md                          ← Single source of truth. Read this first.
├── screen-copilot-implementation-plan.md  ← Team/parallel-stream view (secondary)
└── phases/
    ├── phase-0-scaffold.md          ← Repo structure, deps, .env, setup scripts
    ├── phase-1-sidecar.md           ← FastAPI sidecar, LiteRT-LM, tool calling
    ├── phase-2-electron.md          ← Overlay window, desktopCapturer, WebSocket client
    ├── phase-3-ui.md                ← React components, Zustand stores, streaming UI
    ├── phase-4-integration.md       ← Wire all layers together, error handling
    ├── phase-5-autorefresh-tts.md   ← Auto-refresh, TTS pipeline, audio playback
    └── phase-6-polish.md            ← Visual polish, perf, demo prep
```

**Start with `docs/SPEC.md`** — it contains the architecture overview, tech stack, environment variable reference, WebSocket protocol, IPC channel table, and cross-cutting code rules that apply to every phase. Each phase doc in `docs/phases/` then contains detailed pseudocode and a verification checklist for that phase only.

When `docs/SPEC.md` and any phase doc conflict, **SPEC.md wins**.

---

## Phase Execution Order

Complete phases in order and wait for human review before starting the next:

| # | Phase doc | Gate |
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
- mlx-audio TTS backend for macOS (stub currently raises `NotImplementedError`)
- Wayland support on Linux native (desktopCapturer may require additional Electron flags)
