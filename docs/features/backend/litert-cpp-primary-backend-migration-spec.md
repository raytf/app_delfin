# LiteRT-LM C++ Bridge — Primary Backend Migration

> Gate 1 — spec draft awaiting human approval.
> Umbrella spec covering the transition from the Python FastAPI sidecar (with `litert-lm` Python) to the native C++ bridge (with `litert-lm` C++) as the **primary** inference backend for all developers and end users. Builds on top of `native-windows-backend-research-spec.md`, `litert-cpp-vision-spec.md`, `litert-cpp-bridge-runtime-validation-spec.md`, and `litert-cpp-audio-input-spec.md`.

## Gate Resolution

| Field          | Value                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Gate 1 — spec draft, awaiting human approval                                                                                                                                                                           |
| **Created**    | 2026-05-03                                                                                                                                                                                                             |
| **Depends on** | `litert-cpp-bridge-runtime-validation-spec.md` (Phases 1–4 complete), `litert-cpp-audio-input-spec.md` (AC1–AC7 complete on Windows), `distribution-backend-migration-spec.md` (TTS strategy DM3 resolved off-Python) |
| **Blocks**     | `distribution-backend-migration-spec.md` final cutover, `distribution-packaging-spec.md` (bridge as `extraResource`), `distribution-cicd-spec.md` (per-platform bridge build matrix + binary distribution decision)   |

---

## Goal

Make the LiteRT-LM C++ bridge the default and recommended inference backend for Delfin on Windows x64, macOS (universal arm64+x64), and Linux x64, while retaining the Python sidecar as a documented developer-only fallback during the transition. Establish the trigger conditions and acceptance criteria that gate each step of the rollout, and identify the documentation surfaces that must be updated when the default flips.

---

## Background and rationale

### Why C++ at all

The C++ bridge was introduced (see `native-windows-backend-research-spec.md`) primarily to remove the WSL2 dependency on Windows: the `litert-lm` Python wheel does not target Windows natively, so Windows users were either running through WSL2 (developer-only) or falling back to llamafile (much worse instruction following and TTFT — see the 2026-05-02 benchmark in that spec). The C++ bridge runs natively on Windows, exposes the same Conversation API the Python binding wraps, and adds per-session KV-cache reuse for low-latency follow-up turns.

### Why migrate everyone, not just Windows

Two reasons:

1. **Consistency in development.** Today, macOS/Linux developers run the Python sidecar while the Windows team relies on llamafile (and increasingly the C++ bridge). Bug reports, benchmark numbers, and reproduction steps diverge by platform. Standardising on the C++ bridge eliminates this divergence: the same binary, the same Conversation API, the same per-session KV-cache semantics on every platform.
2. **CI/CD simplifies dramatically.** `distribution-cicd-spec.md` already plans a matrix build that produces `delfin_litert_bridge[.exe]` on each runner and bundles it as an Electron resource. Once the C++ bridge is the only backend, packaging stops needing two parallel paths (Python sidecar for macOS/Linux + C++ bridge for Windows).

### Why audio input is a blocker

Voice turns are a core demo flow (see [`docs/explanations/voice-audio-pipeline.md`](../../explanations/voice-audio-pipeline.md)). Flipping the default backend to a path that silently drops or rejects voice turns would regress a user-visible feature. Hence `litert-cpp-audio-input-spec.md` is a hard prerequisite (this spec's M1).

### Why TTS must move out of Python before completion

If TTS (kokoro-onnx) stays in the Python sidecar, then the sidecar still has to run alongside the C++ bridge — defeating most of the consistency and packaging benefits. This spec therefore makes TTS off-Python a **gating** condition for the final default-flip on macOS/Linux, deferring the actual TTS choice to `distribution-backend-migration-spec.md` DM3 / a follow-up TTS spec.

### Why tool-calling parity is required

The Python sidecar's `respond_to_user` tool path produces structured outputs (`Summary` / `Key points` / etc.) that the renderer relies on. The proxy currently uses `_extract_structured_from_text`-style fallback, but that fallback is fragile against model output drift. Tool-calling parity in the C++ bridge before flipping the default removes a known regression risk.

### Why the Python sidecar stays as a deprecated fallback

`npm run dev:sidecar` continues to work, with a deprecation banner, during the rollout. This protects developers who hit a bridge-build issue, and lets us validate the C++ path in production while keeping a known-good escape hatch. The sidecar is removed in a separate cleanup spec only after the C++ bridge has been the default for a full release cycle without escalations.

---

## Scope

The migration is broken into six tracks. Tracks M1–M4 are technical prerequisites; M5 is the default-flip itself; M6 is the deprecation pass.

### M1 — Audio input parity

Implement and validate `litert-cpp-audio-input-spec.md`. Out of scope here; this track is a pointer.

### M2 — Tool-calling parity

| File                                               | Change                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native/litert-cpp-bridge/delfin_litert_bridge.cc` | Add support for the `respond_to_user` tool definition in the system prompt's `JsonPreface`, mirroring the schema used by the Python sidecar (`sidecar/server.py`; walkthrough in [`docs/explanations/sidecar-flow.md`](../../explanations/sidecar-flow.md)). Stream tool-call JSON as it arrives.                                                     |
| `scripts/litert-cpp-proxy.mjs`                     | Forward tool-call JSON unchanged to the WebSocket; remove (or downgrade to last-resort) the existing text-extraction fallback once tool-calling is reliable.                                                                                                          |
| `native/litert-cpp-bridge/delfin_litert_bridge.test.mjs` | Add a tool-call assertion: a fixed prompt produces a `respond_to_user` call with the expected schema fields.                                                                                                                                                     |

### M3 — TTS strategy resolution (off-Python)

This track does not implement TTS; it resolves the strategy and unblocks M5 for macOS/Linux.

| Action                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinate with `distribution-backend-migration-spec.md` DM3. The decision must land in a separate TTS spec before macOS/Linux can flip default. Options on the table (per existing docs): bundled Piper, frozen `kokoro-onnx` invoked by the Node proxy, Web Speech API fallback in renderer. |
| Until DM3 lands, the `dev:litert-cpp` script may continue to spawn the Python sidecar for TTS only (text-to-speech in, audio chunks out). This is a documented bridge-during-transition and is removed when DM3 ships.                                                                       |

### M4 — Cross-platform validation (Windows x64, macOS universal, Linux x64)

Defer the technical work to `litert-cpp-bridge-runtime-validation-spec.md`. This spec extends that scope:

- macOS coverage must produce a **universal2** binary (arm64 + x64). If electron-builder's `arch: universal` doubles CI time beyond budget, fall back to two architecture-specific binaries selected at install time.
- Linux coverage stays x64 only for now (Linux arm64 deferred, consistent with `distribution-cicd-spec.md` matrix).
- macOS validation must include a manual voice round in addition to the lecture-slide round (since M1 introduces audio input on the C++ path).

### M5 — Default backend switch (phased)

| File                              | Change                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`                    | Phase 5a (after M1 + M2 + Windows M4 complete): change `INFERENCE_BACKEND` default to `litert-cpp` for Windows. macOS/Linux developers continue to default to `litert` (Python) until their M4 + M3 are complete.                                            |
| `.env.example`                    | Phase 5b (after macOS M4 + M3 complete): flip macOS default to `litert-cpp`.                                                                                                                                                                                  |
| `.env.example`                    | Phase 5c (after Linux M4 complete): flip Linux default to `litert-cpp`.                                                                                                                                                                                       |
| `package.json`                    | Make `npm run dev:full` resolve to `npm run dev:litert-cpp` on platforms where the default has flipped. Keep `npm run dev:sidecar` as an explicit opt-in for the deprecated Python path.                                                                     |
| `scripts/setup-check.sh` / `.ps1` | Add a check for `bin/delfin_litert_bridge[.exe]` and `LITERT_CPP_MODEL`. Print a deprecation note when only the Python sidecar setup is detected on a platform whose default has flipped.                                                                    |
| `scripts/setup-sidecar.mjs`       | No functional change; add a console note that the Python sidecar is now a fallback path on platforms whose default has flipped.                                                                                                                              |
| `scripts/init-env.mjs`            | When generating a fresh `.env`, write the platform-appropriate `INFERENCE_BACKEND` default per the phase above.                                                                                                                                              |

### M6 — Python sidecar deprecation (documentation only in this spec)

| Action                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` — mark `npm run dev:sidecar` and `dev:full → sidecar` as deprecated developer fallbacks; recommend `dev:litert-cpp` (or the new `dev:full` once it points at the bridge). |
| `docs/explanations/sidecar-flow.md` — add a deprecation banner; keep the explanation intact so the fallback path remains documented.                                                  |
| `docs/SPEC.md` — update §Architecture to make the C++ bridge the primary path and the Python sidecar a fallback footnote on each platform whose default has flipped.                 |
| Removing the `sidecar/` tree and `setup:sidecar` is **not** in scope here; tracked as a follow-up cleanup spec after one full release cycle on the new default.                       |

---

## Out of scope

- The actual TTS implementation (Piper / kokoro-onnx-in-Node / Web Speech). Decision is gated by DM3, which is referenced but not made here.
- Removing the Python sidecar code or `sidecar/requirements.txt`. Tracked as a follow-up.
- Auto-update mechanism, code signing, and installer creation (covered by `distribution-packaging-spec.md` and `distribution-cicd-spec.md`).
- The actual prebuilt-binary fetch script for developers (see Open question / docs impact: a decision-task is added to `distribution-cicd-spec.md` instead).
- Linux arm64, Windows arm64, Windows-on-ARM via emulation — defer.
- Electron, renderer, and IPC changes — none required; the WebSocket sidecar protocol is preserved end-to-end.

---

## Interface contract

### Environment variables (changes to defaults, no new vars)

| Var                 | Old default                                | New default (per phase)                                                                                                                                              |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFERENCE_BACKEND` | `litert`                                   | `litert-cpp` on Windows after Phase 5a; on macOS after Phase 5b; on Linux after Phase 5c. `.env.example` documents the platform-conditional default in a comment.   |
| `LITERT_CPP_BIN`    | `./bin/litert_lm_main.exe` (Windows-only)  | Platform-aware: `./bin/delfin_litert_bridge.exe` on Windows, `./bin/delfin_litert_bridge` on macOS/Linux. `init-env.mjs` writes the right value.                    |
| `LITERT_CPP_MODEL` | `./models/gemma-4-E2B-it.litertlm`         | Unchanged.                                                                                                                                                           |

### WebSocket / IPC

No changes. Both contracts (`docs/SPEC.md` §WebSocket Message Protocol, §IPC channels) are preserved exactly. The whole point of the migration is that the renderer and Electron main process do not change.

### npm scripts

| Script                            | Behaviour change                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev:full`                | Resolves to `dev:litert-cpp` on platforms whose default has flipped; resolves to `dev:sidecar` (Python) elsewhere. Implementation can be a thin Node wrapper that checks `process.platform`.   |
| `npm run dev:sidecar`             | Unchanged. Documented as deprecated fallback once the corresponding platform's default has flipped.                                                                                             |
| `npm run dev:litert-cpp`          | Unchanged.                                                                                                                                                                                       |
| `npm run setup`                   | Unchanged composition; behaviour change is in `setup-check` and `init-env` only.                                                                                                                |

---

## Acceptance criteria

| # | Criterion |
| - | --------- |
| AM1 | `litert-cpp-audio-input-spec.md` AC1–AC7 pass on Windows. |
| AM2 | M2 (tool calling) — a fixed multi-turn prompt produces structured `respond_to_user` output identical in shape to the Python sidecar's output for the same prompt. |
| AM3 | M3 — a TTS-off-Python decision has landed (separate spec) and is implemented for at least Windows; macOS/Linux can lag behind only if M5 is staged accordingly. |
| AM4 | M4 — `litert-cpp-bridge-runtime-validation-spec.md` AC1–AC8 pass on Windows x64, macOS arm64+x64 (universal or twin binaries), and Linux x64. |
| AM5 | M5a — `INFERENCE_BACKEND` default flipped to `litert-cpp` on Windows; `npm run dev:full` on a clean Windows checkout starts the C++ bridge with no extra flags and a voice + vision turn succeeds. |
| AM6 | M5b/c — same for macOS and Linux respectively, on a clean checkout, with no Python sidecar process running. |
| AM7 | `setup-check` reports the correct status for both backends and prints the deprecation note where appropriate. |
| AM8 | The Python sidecar still launches successfully via `npm run dev:sidecar` on every platform whose default has flipped (fallback regression check). |
| AM9 | `STATUS.md`, `docs/README.md`, `AGENTS.md` §Documentation Map, `docs/SPEC.md`, and the per-platform sections of `README.md` reflect the new default. |

---

## Risks and open questions

| Risk                                                                                                                                                                              | Likelihood | Mitigation                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio-input parity slips (M1 takes longer than expected) and blocks the entire migration.                                                                                         | Medium     | The default-flip per platform is gated independently on M1; if M1 is delayed, ship M2/M4/M3 and only flip the default once M1 is in. Do not flip the default with a regressed voice path.                  |
| TTS-off-Python (M3) is harder than expected and macOS/Linux defaults are stuck on `litert` (Python) indefinitely.                                                                  | Medium     | Acceptable per the staged plan: Windows can flip first regardless. If the macOS/Linux flip is blocked > 1 release cycle, raise it for re-scoping.                                                          |
| Tool-calling parity (M2) reveals a C++-side limitation that the JSON-extraction fallback cannot mask cleanly.                                                                     | Medium     | Spike M2 first inside Phase 1; if blocked, escalate before any default-flip work.                                                                                                                          |
| Developers without the bridge binary find `npm run dev:full` broken after the default flip on their platform.                                                                     | Medium-High | `setup-check` must explicitly call out the missing binary with the exact command to obtain it; until the fetch-binary mechanism (deferred decision) lands, that command is `npm run build:litert-cpp-bridge` with toolchain prerequisites linked. |
| macOS universal binary doubles CI time beyond budget.                                                                                                                              | Low-Medium | Fall back to two arch-specific binaries if needed (M4 already mentions this).                                                                                                                              |
| Removing/downgrading the proxy's text-extraction fallback in M2 hides a model-output drift later.                                                                                  | Low        | Keep the fallback as a last-resort path with a console warning; only fully remove it after one release cycle of clean tool calls.                                                                          |

### Open questions

1. **Prebuilt bridge binary distribution** — deliberately not decided here. A decision-task should be added to `distribution-cicd-spec.md` to evaluate (a) GitHub Releases asset per platform, (b) workflow artifacts, (c) both, and to produce a `npm run fetch:litert-cpp-bridge` script. This task must be resolved before AM5/AM6 can be considered "developer-friendly" (without it, devs still need the C++ toolchain to flip).
2. **Error UX when `litert-cpp` default is set but the binary is missing** — should `npm run dev:full` auto-fall-back to `dev:sidecar` with a warning, or fail loudly? Lean toward fail-loudly with a clear remediation message; confirm during M5a implementation.

---

## Documentation impact (Gate 5 preview)

- `STATUS.md` — rows for every file touched per phase (init-env.mjs, setup-check, package.json, .env.example, sidecar-flow.md, etc.).
- `docs/README.md` — add this spec under `docs/features/` at Gate 1; flip status as phases complete; add the audio-input spec row alongside.
- `AGENTS.md` §Documentation Map — add both new specs.
- `AGENTS.md` §Validated Technical Decisions — record the migration's per-platform default-flip thresholds and the audio pass-through approach (after M1 lands).
- `docs/SPEC.md` §Architecture — make the C++ bridge the primary path; demote Python sidecar to fallback. §Environment Variables — note the platform-conditional default for `INFERENCE_BACKEND` and the platform-aware `LITERT_CPP_BIN` value.
- `README.md` — update install / first-run sections per platform; mark `npm run dev:sidecar` deprecated where applicable.
- `docs/features/desktop-distribution-mvp-spec.md` — backend track now reads "C++ bridge on all platforms" instead of "Python sidecar on macOS/Linux + llamafile on Windows".
- `docs/features/distribution-backend-migration-spec.md` — final state of the diagram (C++ bridge end-to-end); remove llamafile from the active plan.
- `docs/features/distribution-cicd-spec.md` — add a new task: **decide and implement the developer-facing prebuilt bridge binary fetch mechanism** (open question 1 above). Extend the matrix to build `delfin_litert_bridge` on macOS and Linux runners (currently only the Windows runner has the build step).
- `docs/features/distribution-packaging-spec.md` — bundle `delfin_litert_bridge[.exe]` as an `extraResource` for all three platforms.
- `docs/explanations/sidecar-flow.md` — add deprecation banner; preserve the content as fallback documentation.
- `docs/explanations/voice-audio-pipeline.md` — update once M1 lands.
- `.env.example` — staged updates per Phase 5a/5b/5c.
