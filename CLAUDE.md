# CLAUDE.md — Delfin

> Claude Code project instructions. This file is a shim; the canonical rules live in `AGENTS.md`.

## Read First

1. Read `AGENTS.md` before editing anything.
2. Read `docs/SPEC.md` for architecture, IPC/WebSocket contracts, env vars, and cross-cutting rules.
3. Check `docs/README.md` to locate the relevant feature spec under `docs/features/<area>/`.
4. Check `STATUS.md` before claiming a feature is complete or changing lifecycle status.

If this file conflicts with `AGENTS.md`, follow `AGENTS.md`. If either conflicts with `docs/SPEC.md` on architecture or interfaces, `docs/SPEC.md` wins.

## Required Workflow

- For non-trivial work, follow the Gate 1→5 workflow in `AGENTS.md`: spec, human approval, implementation, human review, docs.
- Do not implement beyond the approved/requested scope.
- Do not commit, push, merge, deploy, install dependencies, or change ticket status without explicit user permission.
- After code changes, run the smallest relevant safe checks and summarize command, exit code, and result.

## Project-Specific Reminders

- Current app runtime: Electron + React renderer, Electron main IPC bridge. **Primary inference backend is the LiteRT-LM C++ bridge** (`scripts/litert-cpp-proxy.mjs` Node proxy + `delfin_litert_bridge` native binary) on all supported platforms (Windows x64, macOS arm64, Linux x64). The Python FastAPI sidecar (`sidecar/server.py`) is **deprecated** and retained for developer reference only.
- The legacy llamafile / `llama-server` backend is **deprecated** and retained only for benchmark comparison under `scripts/benchmark/`. Do not introduce new app-runtime code paths that depend on it.
- `npm run dev:backend` starts the Node proxy with Piper TTS enabled (if configured). The proxy streams `audio_*` events for sentence-level TTS; if Piper is absent or disabled (`LITERT_CPP_TTS_BACKEND=none`), the renderer falls back to Web Speech automatically.
- `npm run dev` starts the full stack (backend proxy + Electron/Vite). Use `npm run dev:frontend` / `npm run dev:backend` to run each layer independently.
- TypeScript is strict; avoid `any`.
- Shared IPC/WebSocket types live in `src/shared/types.ts` and schemas in `src/shared/schemas.ts`.
- CSS should use Tailwind utility classes only; no per-component CSS files.
- React effects that register IPC listeners must clean them up with `api.removeAllListeners(channel)`.

## Useful Commands

- `npm run dev` — **Primary.** Full stack: C++ backend proxy + Electron/Vite (run `setup:litert-cpp` first).
- `npm run dev:backend` — Backend proxy only (run in one terminal while `dev:frontend` runs in another).
- `npm run dev:frontend` — Electron + Vite only (use when backend is already running).
- `npm run dev:mock` — Mock backend + Electron/Vite (UI development, no model needed).
- `npm run test` — Vitest suite.
- `npm run check:windows` or `bash scripts/setup-check.sh` — environment check.
- `npm run benchmark:litert-cpp` — LiteRT-CPP benchmark.
- `npm run benchmark:litert-py` — Python LiteRT benchmark (deprecated comparison only).

Benchmark outputs go under `results/`; commit `results/.gitkeep` only, not generated JSON/CSV files.