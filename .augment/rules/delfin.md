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

- App runtime: Electron + React renderer, Electron main IPC bridge. Inference backend is the Python FastAPI sidecar (LiteRT-LM/Gemma 4) on macOS / Linux / WSL2, and the LiteRT-LM C++ bridge via `scripts/litert-cpp-proxy.mjs` on native Windows.
- `npm run dev:litert-cpp` bypasses `sidecar/tts.py`; off-Python speech is controlled by `LITERT_CPP_TTS_BACKEND` (e.g. `piper`). If unset or it fails, the renderer falls back to browser Web Speech.
- Distribution track: native packaging targets the LiteRT-LM C++ backend. The legacy llamafile / `llama-server` path is **deprecated** and kept only for benchmark comparison under `scripts/benchmark/`.
- Benchmark harness: `scripts/benchmark/run.py` writes JSON/CSV to `results/`; keep only `results/.gitkeep` in git.
- Shared IPC/WebSocket types: `src/shared/types.ts`; Zod schemas: `src/shared/schemas.ts`.
- Styling: Tailwind utilities only; no per-component CSS files.