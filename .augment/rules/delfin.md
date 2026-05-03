# Delfin Augment/Auggie Rules

This file is a tool-specific shim. The canonical coding-agent instructions are in `AGENTS.md`; the canonical architecture and interface contracts are in `docs/SPEC.md`.

## Priority

1. Follow direct user instructions.
2. Follow `AGENTS.md` for workflow, documentation, commands, and validated technical decisions.
3. Follow `docs/SPEC.md` for architecture, IPC/WebSocket contracts, env vars, and cross-cutting code rules.
4. If this file conflicts with `AGENTS.md`, `AGENTS.md` wins. If `AGENTS.md` conflicts with `docs/SPEC.md` on architecture or interfaces, `docs/SPEC.md` wins.

## Must Do

- Read `AGENTS.md` before making repository changes.
- Use the Gate 1→5 workflow for non-trivial implementation work: spec, human approval, implementation, human review, docs.
- Keep changes scoped to the user request or approved spec.
- Gather enough code context before edits; confirm signatures/types before using symbols.
- Run relevant safe tests/checks after code changes and report command, exit code, and key output.

## Must Not Do Without Explicit Permission

- Commit, push, merge, deploy, or change ticket status.
- Install or uninstall dependencies.
- Rewrite architecture or replace the current LiteRT sidecar outside an approved spec.
- Commit generated benchmark outputs from `results/`.

## Current Important Context

- App runtime: Electron + React renderer, Electron main IPC bridge, Python FastAPI sidecar, LiteRT-LM/Gemma 4.
- `npm run dev:litert-cpp` currently bypasses `sidecar/tts.py`; the Node proxy emits no `audio_*` events yet, so TTS falls back to browser Web Speech even if `TTS_BACKEND=kokoro` is set.
- Distribution track: evaluating native packaging via llama.cpp `llama-server` / llamafile.
- Benchmark harness: `scripts/benchmark/run.py` writes JSON/CSV to `results/`; keep only `results/.gitkeep` in git.
- Shared IPC/WebSocket types: `src/shared/types.ts`; Zod schemas: `src/shared/schemas.ts`.
- Styling: Tailwind utilities only; no per-component CSS files.