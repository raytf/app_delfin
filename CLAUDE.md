# CLAUDE.md — Delfin

> Claude Code project instructions. This file is a shim; the canonical rules live in `AGENTS.md`.

## Read First

1. Read `AGENTS.md` before editing anything.
2. Read `docs/SPEC.md` for architecture, IPC/WebSocket contracts, env vars, and cross-cutting rules.
3. Check `docs/README.md` to locate the relevant phase or feature spec.
4. Check `STATUS.md` before claiming a feature is complete or changing lifecycle status.

If this file conflicts with `AGENTS.md`, follow `AGENTS.md`. If either conflicts with `docs/SPEC.md` on architecture or interfaces, `docs/SPEC.md` wins.

## Required Workflow

- For non-trivial work, follow the Gate 1→5 workflow in `AGENTS.md`: spec, human approval, implementation, human review, docs.
- Do not implement beyond the approved/requested scope.
- Do not commit, push, merge, deploy, install dependencies, or change ticket status without explicit user permission.
- After code changes, run the smallest relevant safe checks and summarize command, exit code, and result.

## Project-Specific Reminders

- Current app runtime: Electron + React renderer, Electron main IPC bridge, Python FastAPI sidecar, LiteRT-LM/Gemma 4.
- Distribution work is evaluating a future llama.cpp `llama-server` / llamafile backend; do not replace the current sidecar unless an approved spec says so.
- TypeScript is strict; avoid `any`.
- Shared IPC/WebSocket types live in `src/shared/types.ts` and schemas in `src/shared/schemas.ts`.
- CSS should use Tailwind utility classes only; no per-component CSS files.
- React effects that register IPC listeners must clean them up with `api.removeAllListeners(channel)`.

## Useful Commands

- `npm run dev:full` — Electron + Vite + Python sidecar.
- `npm run dev:mock` — Electron + mock sidecar.
- `npm run test` — Vitest suite.
- `bash scripts/setup-check.sh` or `scripts/setup-check.ps1` — environment check.
- `python scripts/benchmark/run.py --backend litert ...` — LiteRT benchmark.
- `python scripts/benchmark/run.py --backend llamafile ...` — llamafile / llama-server benchmark.

Benchmark outputs go under `results/`; commit `results/.gitkeep` only, not generated JSON/CSV files.