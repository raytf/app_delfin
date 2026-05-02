# Native Windows Backend — Research Spec

> Gate 1 research spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` and `distribution-backend-migration-spec.md` first.
> This spec prioritizes **LiteRT-LM C++** as the replacement for the current llamafile-on-Windows path. Foundry Local remains a contingency only if LiteRT-LM C++ fails validation.

## Gate Resolution

| Field                | Value                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Status**           | Gate 1 — awaiting approval                                                                   |
| **Created**          | 2026-05-02                                                                                   |
| **Type**             | Sequential validation spec — LiteRT-LM C++ first, Foundry Local only as contingency          |
| **Preferred path**   | **Track A — LiteRT-LM C++** (features already validated via Python LiteRT-LM in WSL2)        |
| **Contingency path** | Track B — Foundry Local only if Track A fails build, benchmark, or Delfin feature validation |
| **Depends on**       | `inference-benchmarking-spec.md` (✅ Complete — provides baseline numbers)                   |
| **Blocks**           | Distribution backend decision: remove llamafile fallback if Track A passes validation        |

---

## Goal

Verify whether **LiteRT-LM C++** can serve as Delfin's native-Windows inference backend without WSL2, while preserving the existing WebSocket sidecar protocol and Gemma-class vision capability. If LiteRT-LM C++ passes build, benchmark, and Delfin feature validation, remove the current llamafile fallback from the distribution plan and assess the next distribution steps. Evaluate **Foundry Local** only if LiteRT-LM C++ fails a blocking criterion.

## Background

The 2026-05-02 benchmark run (`results/benchmark-litert-linux-...json` vs `results/benchmark-llamafile-windows-...json`) showed:

- **LiteRT-LM (WSL2)**: TTFT 3.5 s (S1), respects token limits, total turn time 4–8× faster end-to-end.
- **llamafile (native Windows)**: TTFT 53 s (S1), ~3× higher raw throughput, but heavily over-generates and ignores length constraints.

LiteRT-LM is the better experience but currently has no Windows Python wheel, which is why `distribution-packaging-spec.md` falls back to llamafile on Windows. The preferred fix is to bypass the Python wheel entirely and run LiteRT-LM through its cross-platform C++ library:

- **Track A — LiteRT-LM C++**: Google publishes a cross-platform C++ library and a CLI runner (`litert_lm_main`). Building it natively on Windows would let us keep LiteRT-LM speed and instruction-following without WSL2.
- **Track B — Foundry Local**: Microsoft's local model runtime for Windows (cross-platform via REST). This is a contingency path, not a parallel replacement candidate, because Delfin's required LiteRT-LM feature set has already been validated.

Both paths preserve the renderer ↔ Electron main ↔ WebSocket sidecar architecture by introducing a thin proxy that speaks Delfin's existing sidecar WebSocket protocol on one side. If Track A passes, the Windows distribution strategy should become `litert_lm_main.exe` + `litert-cpp-proxy.mjs`, and the llamafile fallback should be removed from the active packaging plan.

---

## Architecture

### Current (`distribution-backend-migration-spec.md`)

```
Renderer ──IPC──► Electron Main ──ws──► Python FastAPI (LiteRT-LM)        [macOS/Linux/WSL2 from source]
                  (wsClient.ts)        port 8321
                              └──ws──► llamafile-proxy.mjs ──REST──► llamafile.exe   [Windows packaged]
```

### Target if Track A passes (LiteRT-LM C++)

```
Renderer ──IPC──► Electron Main ──ws──► litert-cpp-proxy.mjs ──stdio/IPC──► litert_lm_main.exe   [Windows packaged]
                  (wsClient.ts)        port 8321
                              └──ws──► Python FastAPI (LiteRT-LM)         [macOS/Linux/WSL2 from source — unchanged]
```

### Contingency only if Track A fails (Foundry Local)

```
Renderer ──IPC──► Electron Main ──ws──► foundry-proxy.mjs ──REST/SDK──► Foundry Local service   [Windows packaged]
                  (wsClient.ts)        port 8321                         (OpenAI-compatible)
                              └──ws──► Python FastAPI (LiteRT-LM)         [macOS/Linux/WSL2 from source — unchanged]
```

In all cases, **the Electron main process, renderer, IPC contract, `wsClient.ts`, and shared types remain unchanged**. The only new code is the proxy and its spawn wiring, mirroring the pattern established in `distribution-backend-migration-spec.md` for `llamafile-proxy.mjs`. If Track A passes, `llamafile-proxy.mjs` is no longer part of the Windows distribution plan.

---

## Scope

### Track A — LiteRT-LM C++ (primary path)

| Phase  | Deliverable                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A0** | Native Windows build of `litert_lm_main.exe` from `https://github.com/google-ai-edge/LiteRT-LM` using Bazelisk + Visual Studio Build Tools. Document exact `bazel build` command and required toolchain versions.                                                                                  |
| **A1** | Minimal C++ runtime smoke test: run a text-only prompt and a base64-image prompt directly against the C++ runner/API. Confirm streaming, multimodal input, and cancellation hooks exist before building any Delfin-specific proxy.                                                                 |
| **A2** | Standalone benchmark adapter `scripts/benchmark/backends/litert_cpp.py` that drives `litert_lm_main.exe` (via stdio or its REST mode if available) and conforms to `BaseBackend`. Add `npm run benchmark:litert-cpp`. Compare against existing LiteRT-LM Python and llamafile baselines.           |
| **A3** | Sidecar proxy `scripts/litert-cpp-proxy.mjs` (~150 LOC) that exposes the Delfin WebSocket sidecar protocol on port 8321 and forwards prompts/images to a long-lived `litert_lm_main.exe` child process. Streams tokens back as `{type:"token",text}` / `{type:"done"}` / `{type:"error",message}`. |
| **A4** | Automated/manual Delfin feature validation round against `litert-cpp-proxy.mjs`: lecture slide explain, manual prompt, auto-refresh capture, interrupt/barge-in, error display, reconnect/health, and TTS fallback behavior.                                                                       |
| **A5** | Distribution assessment: if A0–A4 pass, revise the distribution docs so Windows uses `litert_lm_main.exe` + `litert-cpp-proxy.mjs` and remove llamafile as an active fallback. Identify remaining installer/model-download work.                                                                   |

### Track B — Foundry Local (contingency only)

Track B starts **only if Track A fails** one of these blocking points: cannot build on Windows, cannot load the required `.litertlm` model, cannot stream/cancel reliably, cannot process screenshots, benchmark numbers are worse than the current Windows llamafile baseline, or the integrated Delfin feature validation round fails.

| Phase  | Deliverable                                                                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B0** | Verify Foundry Local installs and runs on a clean Windows 10/11 box without WSL2. Confirm a Gemma-class vision-capable model is available in the catalog (or document the gap).          |
| **B1** | If B0 passes, create benchmark adapter `scripts/benchmark/backends/foundry.py` that talks to Foundry Local's OpenAI-compatible REST endpoint. Add `npm run benchmark:foundry`.           |
| **B2** | If B1 passes, create sidecar proxy `scripts/foundry-proxy.mjs` (~150 LOC) using either the JS SDK or raw OpenAI-compatible REST + SSE. Same WebSocket contract as `llamafile-proxy.mjs`. |
| **B3** | Run the same automated/manual Delfin feature validation round used in A4.                                                                                                                |
| **B4** | Decide whether Foundry replaces the current Windows fallback or remains documented as a future investigation.                                                                            |

### Out of scope

- Replacing the macOS / Linux LiteRT-LM Python sidecar. Both tracks target **Windows packaging only**.
- Changes to the renderer, Zustand stores, or IPC contract.
- TTS backend selection (handled by `distribution-backend-migration-spec.md` DM3).
- Full code signing, installers, auto-update — covered by `distribution-packaging-spec.md` and `distribution-cicd-spec.md`; this spec only decides the backend path and next distribution tasks.
- Keeping llamafile as an active fallback after LiteRT-LM C++ is verified. If Track A passes, the distribution plan should remove llamafile unless a new human-approved requirement reintroduces it.
- Cross-compilation. Builds are produced on the same host OS as the target.

---

## Interface contract

### Sidecar WebSocket protocol (unchanged)

Both proxies must accept Delfin's existing client → sidecar messages and emit the existing sidecar → client messages exactly as defined in `docs/SPEC.md` §WebSocket Message Protocol. No new message types are introduced.

### Track A — `litert-cpp-proxy.mjs`

| Surface       | Contract                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| WebSocket     | `ws://localhost:${SIDECAR_PORT}/ws` (default 8321)                                                                          |
| Health        | `GET http://localhost:${SIDECAR_PORT}/health` → `{"status":"ok","backend":"litert-cpp"}`                                    |
| Child process | Spawns `litert_lm_main.exe --model <path> --serve` (or stdio mode if no serve flag); one persistent process per app session |
| Image input   | base64 PNG/JPEG forwarded as the C++ API's `blob` payload — no temp files                                                   |
| Interrupt     | `{type:"interrupt"}` → cancels in-flight generation via the C++ engine's cancellation hook                                  |

### Track B — `foundry-proxy.mjs` (contingency only)

| Surface          | Contract                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| WebSocket        | `ws://localhost:${SIDECAR_PORT}/ws` (default 8321)                                                                              |
| Health           | `GET http://localhost:${SIDECAR_PORT}/health` → `{"status":"ok","backend":"foundry"}`                                           |
| Foundry endpoint | OpenAI-compatible `POST /v1/chat/completions` against the local Foundry service (port discovered via SDK or `FOUNDRY_BASE_URL`) |
| Image input      | OpenAI `image_url` data URL inside the chat message (mirrors `llamafile-proxy.mjs`)                                             |
| Interrupt        | `{type:"interrupt"}` → `AbortController` on the in-flight `fetch`                                                               |

### Environment variables (new, conditional)

| Var                   | Default                          | Purpose                                                                                   |
| --------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `INFERENCE_BACKEND`   | `litert`                         | Adds `litert-cpp` if Track A passes; adds `foundry` only if Track B is activated.         |
| `LITERT_CPP_BIN`      | `./bin/litert_lm_main.exe`       | Path to the LiteRT-LM C++ runner.                                                         |
| `LITERT_CPP_MODEL`    | `./models/gemma-3n-E2B.litertlm` | `.litertlm` model file.                                                                   |
| `FOUNDRY_BASE_URL`    | auto-discovered                  | Contingency only. Override Foundry Local REST endpoint when SDK discovery is unavailable. |
| `FOUNDRY_MODEL_ALIAS` | `phi-3.5-vision` (TBD)           | Contingency only. Foundry model alias to load. Final value depends on B0 catalog check.   |

All new env vars must be added to `.env.example` and documented in `docs/SPEC.md` §Environment Variables.

---

## Build & run notes

### Track A — building LiteRT-LM C++ on Windows

Captured from the upstream docs at `https://ai.google.dev/edge/litert-lm/cpp`. To be validated during A0:

```powershell
winget install Bazel.Bazelisk
# Visual Studio Build Tools 2022 with "Desktop development with C++" workload
git clone https://github.com/google-ai-edge/LiteRT-LM.git
cd LiteRT-LM
bazel build -c opt //runtime/components/litert_lm_main:litert_lm_main
```

Output binary is copied to `bin/litert_lm_main.exe`. Models are downloaded separately to `models/*.litertlm` and gitignored.

### Track B — installing Foundry Local (only if Track A fails)

```powershell
winget install Microsoft.FoundryLocal
foundry service start
foundry model run <alias>   # one-time download into Foundry's cache
```

JS SDK (only if approved):

```powershell
npm install foundry-local-sdk openai
```

No global installs are performed by the agent without explicit user approval.

---

## Acceptance criteria

Track A is considered verified if **all** of the following hold on a clean native Windows 10/11 host (no WSL2):

| Criterion                           | Threshold                                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build / install reproducibility** | A documented sequence of commands produces a working binary or running service in ≤ 30 minutes from a clean shell.                                                                                          |
| **Direct runtime smoke test**       | `litert_lm_main.exe` or a minimal C++ harness completes one text-only prompt, one image prompt, and one cancellation test before any Delfin proxy work starts.                                              |
| **Benchmark completion**            | `npm run benchmark:litert-cpp -- --runs 5 --scenarios s1,s2,s3` writes JSON + CSV under `results/` and can be compared to existing LiteRT-LM Python and llamafile baselines.                                |
| **Sidecar protocol parity**         | Existing renderer + Electron main code runs against the new proxy with **zero source changes**. `wscat -c ws://localhost:8321/ws` reproduces the same `token`/`done`/`error` framing as the Python sidecar. |
| **Vision support**                  | Scenario S2 (`assets/test-slide.png`) returns a coherent 3-bullet summary.                                                                                                                                  |
| **TTFT (S1)**                       | ≤ 8 s (must beat current Windows llamafile baseline of ~53 s; ideally within 2× of WSL2 LiteRT-LM at 3.5 s).                                                                                                |
| **Total turn time (S1)**            | ≤ 25 s.                                                                                                                                                                                                     |
| **Instruction following**           | Output token count for S1 within ±50 % of LiteRT-LM Python baseline (i.e. respects "in 2 sentences" hint).                                                                                                  |
| **Delfin feature validation**       | Automated/manual round passes for lecture slide explain, manual text prompt, auto-refresh capture, interrupt/barge-in, inline error display, health/reconnect, and TTS fallback.                            |
| **Stability**                       | 20 consecutive Delfin turns in a single session without crash, leak > 200 MB, or hang.                                                                                                                      |

If Track A passes, the active distribution plan removes the llamafile fallback. If Track A fails a blocking criterion, pause Track A, document the failure, and ask the human whether to activate Track B.

---

## Risks & open questions

### Track A

- **Build complexity on Windows.** Bazel + MSVC toolchains are non-trivial; first-time builds can take 30–60 min and may require specific MSVC versions.
- **Distribution size.** `litert_lm_main.exe` plus required runtime DLLs may exceed the llamafile single-binary footprint; need to measure during A0.
- **Cancellation.** The C++ API exposes async streaming, but mid-stream cancellation behaviour needs validation against Delfin's `interrupt` message.
- **Tool calling.** Python LiteRT-LM uses a `respond_to_user` tool. The C++ runner must support the same tool-calling contract or we add a JSON-extraction fallback in the proxy (already present in the Python sidecar — see `_extract_structured_from_text`).

### Track B

- **Vision model availability.** Foundry Local's catalog may not include a Gemma-class vision model at parity with Gemma 3n E2B. If not, Track B is text-only and ineligible to replace LiteRT-LM for the lecture-slide demo.
- **Service lifecycle.** Foundry Local runs as a separate Windows service; packaging must either bundle/install it or detect a missing install at first run and surface a clear setup screen.
- **License & redistribution.** Confirm Foundry Local can be silently installed by an Electron installer, or whether the user must install it manually.
- **SDK dependency footprint.** Adding `foundry-local-sdk` + `openai` increases bundled `node_modules`. Raw REST may be preferable.

---

## Recommended sequencing

1. **A0 — Build LiteRT-LM C++ on native Windows.** Confirm `litert_lm_main.exe` can be produced and document the exact toolchain.
2. **A1 — Direct C++ smoke test.** Validate text, vision/image input, streaming, and cancellation before writing Delfin-specific glue.
3. **A2 — Benchmark LiteRT-LM C++.** Add the benchmark adapter, run S1/S2/S3, and compare against existing LiteRT-LM Python + llamafile results.
4. **A3 — Build the Delfin WebSocket proxy.** Only after A2 passes thresholds, implement `litert-cpp-proxy.mjs` behind the existing sidecar protocol.
5. **A4 — Automated/manual Delfin feature validation.** Run the full app against the C++ proxy and validate the core lecture-slide workflow plus capture, interrupt, reconnect, error, and TTS fallback behavior.
6. **A5 — Assess distribution next steps.** If A0–A4 pass, update the distribution plan to remove llamafile and identify remaining packaging work: bundling the binary, model download/cache, first-run setup, installer resources, and CI artifacts.
7. **Track B decision gate.** Foundry Local work starts only if Track A fails and the human explicitly approves activating the contingency path.

---

## Documentation impact (Gate 5 preview)

If this spec is approved and Track A lands, the following docs will need updates:

- `STATUS.md` — rows for the new proxy script, benchmark adapter, and any modified spawn wiring.
- `docs/README.md` — status row for this spec moves 🚧 → ✅ once Track A is verified or the contingency decision is made.
- `AGENTS.md` §Documentation Map — add this spec under `docs/features/`.
- `AGENTS.md` §Validated Technical Decisions — record LiteRT-LM C++ as the Windows backend and any new toolchain requirements.
- `docs/SPEC.md` §Environment Variables — document new env vars.
- `docs/features/distribution-packaging-spec.md` — revise the Windows row of the per-platform backend strategy table and remove llamafile as an active fallback if Track A passes.
- `docs/features/distribution-backend-migration-spec.md` — update the Windows proxy path from llamafile to `litert-cpp-proxy.mjs` if Track A passes.
- `.env.example` — new env vars.
- `README.md` — update only if a user-visible install step changes.
