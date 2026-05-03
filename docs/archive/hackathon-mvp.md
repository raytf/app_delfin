# Delfin Hackathon MVP — Phases 0–6 (Archived)

> 📦 **Archived 2026-05-03.** This document consolidates the original numbered hackathon phase docs (`phase-0-scaffold.md` through `phase-6-polish.md`), which were deleted from `docs/phases/` after the hackathon scope was completed and the project moved to a feature-based planning model. The phase files are still present in git history if you need the original verification checklists or pseudocode.
>
> The remainder of `docs/phases/` was removed at the same time. Phase 7 (memory wiki) was migrated to [`docs/features/memory/memory-wiki-spec.md`](../features/memory/memory-wiki-spec.md).

---

## Why phases existed

Delfin was bootstrapped during a 1.5-day hackathon. The original team plan (`archive/delfin-implementation-plan.md`) split the work into parallel streams; the seven phase docs replaced that plan partway through with a sequential Gate-1→5 model. Phases 0–6 covered every line of code that existed at the end of the hackathon and were treated as the canonical MVP roadmap.

The hackathon shipped a working voice-first study assistant. Going forward, the project is organised by **feature area** (`docs/features/backend/`, `distribution/`, `memory/`, `ui/`, `roadmap/`) instead of numbered phases — see [`docs/README.md`](../README.md) for the active map and [`AGENTS.md`](../../AGENTS.md) for the workflow rules.

---

## Phase summary

| Phase | Theme                       | Key deliverables                                                                                                                                                                                       | Outcome      |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 0     | Project scaffold            | Electron + Vite + React + TypeScript shell, shared `types.ts` / `schemas.ts` / `constants.ts`, `.env.example`, mock sidecar, `npm run setup`, env validation scripts                                  | ✅ Complete  |
| 1     | Inference sidecar           | FastAPI server, LiteRT-LM engine load + GPU→CPU fallback, `WS /ws` single-consumer queue, `respond_to_user` tool path with `Summary:` / `Answer:` text fallback, image preprocessing, prompt presets   | ✅ Complete  |
| 2     | Electron shell + capture    | Frameless overlay window with expanded/compact/prompt-input/prompt-response variants, `desktopCapturer` foreground capture, persistent WebSocket client, IPC handlers, Delfin-window self-exclusion    | ✅ Complete  |
| 3     | React sidebar UI            | Home/active-session screens, expanded + minimized session views, Zustand `sessionStore`, streaming chat box, recent-session list and deletion                                                          | ✅ Complete  |
| 4     | End-to-end integration      | Sidecar WS → IPC → renderer routing, persistent session storage with stored captures, session start/stop ↔ overlay transitions, sidecar connection status, warn-only `.env` validation                | ✅ Complete  |
| 5     | Voice pipeline + TTS        | Self-hosted `@ricky0123/vad-web` + ONNX runtime, voice turns with base64 WAV audio, Kokoro/MLX/Web Speech TTS, sentence-level `audio_start` / `audio_chunk` / `audio_end` streaming, barge-in handling | ✅ Complete  |
| 6     | Polish + stretch goals      | Ocean-themed visual styling pass, README and STATUS updates, demo prep. Several stretch items (global hotkey, Markdown chat rendering, dark mode, Ollama fallback, Dockerfile) remained ❌ at archive  | ⚠️ Partial   |

---

## What replaced numbered phases

| Old phase artefact                                    | Replacement                                                                                                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-phase verification checklists                     | Per-feature acceptance criteria inside each spec under `docs/features/`. Status is tracked in [`STATUS.md`](../../STATUS.md) by feature area, not by phase.                                                                       |
| `phase-N.md` pseudocode                               | The real implementation in `src/`, `sidecar/`, `scripts/`, and `native/`. The evergreen "how does X work" walkthroughs live in [`docs/explanations/`](../explanations/).                                                          |
| `Phase Execution Order` table in `AGENTS.md`          | `Current Active Features` table in `AGENTS.md`, kept in sync with the active rows of [`docs/README.md`](../README.md).                                                                                                            |
| Numbered "Phase 7" for the memory wiki                | [`docs/features/memory/memory-wiki-spec.md`](../features/memory/memory-wiki-spec.md), with internal sub-phases M0–M3.                                                                                                            |

---

## Where the unfinished hackathon polish items live now

The Phase 6 items that did not ship by the hackathon deadline are not lost — they are still candidates for the post-hackathon roadmap. They are listed under [§Future ideas in `docs/README.md`](../README.md#future-ideas-not-yet-scoped) rather than being reopened as a phase doc:

- Global keyboard shortcut (`Ctrl+Shift+C`)
- Markdown rendering in the chat box
- Dark mode toggle
- Manual window picker dropdown
- Ollama fallback engine (now superseded by the LiteRT-C++ / llamafile work in `docs/features/backend/`)
- Dockerfile for the sidecar (now folded into [`docs/features/distribution/`](../features/distribution/))
- Demo content fixtures under `demo-content/`

---

## See also

- [`docs/archive/delfin-implementation-plan.md`](delfin-implementation-plan.md) — the original 1.5-day team stream plan that preceded the numbered phases.
- [`STATUS.md`](../../STATUS.md) — current per-area implementation status.
- [`docs/SPEC.md`](../SPEC.md) — single source of truth for architecture, IPC, WebSocket protocol, and cross-cutting code rules.
