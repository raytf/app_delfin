# Native Windows Backend — Research Spec

> Gate 3 research implementation in progress.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` and `distribution-backend-migration-spec.md` first.
> This spec prioritizes **LiteRT-LM C++** as the replacement for the current llamafile-on-Windows path. Foundry Local remains a contingency only if LiteRT-LM C++ fails validation.

## Gate Resolution

| Field                  | Value                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**             | ✅ Gate 3 passed — native C++ bridge build + text streaming + S1/S2/S3 benchmark + KV-cache Turn 2+ TTFT (~647 ms) validated on Windows; vision/image-blob and per-session KV-cache reuse runtime-validated; awaiting Phases 3–4 (macOS/Linux builds) and full manual app round |
| **Created**            | 2026-05-02                                                                                                                                                                                                                                          |
| **Approved**           | 2026-05-02                                                                                                                                                                                                                                          |
| **Implemented so far** | `scripts/litert-cpp-proxy.mjs` (sessionId per connection, `reset_session` on close), `scripts/litert-cpp-presets.mjs`, `scripts/benchmark/backends/litert_cpp.py`, `native/litert-cpp-bridge/` source with vision backend + `g_sessions` map, Windows `delfin_litert_bridge.exe` build validation (text scenarios) |
| **Type**               | Sequential validation spec — LiteRT-LM C++ first, Foundry Local only as contingency                                                                                                            |
| **Preferred path**     | **Track A — LiteRT-LM C++** (features already validated via Python LiteRT-LM in WSL2)                                                                                                          |
| **Contingency path**   | Track B — Foundry Local only if Track A fails build, benchmark, or Delfin feature validation                                                                                                   |
| **Depends on**         | `inference-benchmarking-spec.md` (✅ Complete — provides baseline numbers)                                                                                                                     |
| **Blocks**             | Distribution backend decision: remove llamafile fallback if Track A passes validation                                                                                                          |

---

## Goal

Verify whether **LiteRT-LM C++** can serve as Delfin's native-Windows inference backend without WSL2, while preserving the existing WebSocket sidecar protocol and Gemma-class vision capability. If LiteRT-LM C++ passes build, benchmark, and Delfin feature validation, remove the current llamafile fallback from the distribution plan and assess the next distribution steps. Evaluate **Foundry Local** only if LiteRT-LM C++ fails a blocking criterion.

## Background

The 2026-05-02 benchmark run (`results/benchmark-litert-linux-...json` vs `results/benchmark-llamafile-windows-...json`) showed:

- **LiteRT-LM (WSL2)**: TTFT 3.5 s (S1), respects token limits, total turn time 4–8× faster end-to-end.
- **llamafile (native Windows)**: TTFT 53 s (S1), ~3× higher raw throughput, but heavily over-generates and ignores length constraints.

LiteRT-LM is the better experience but currently has no Windows Python wheel, which is why `distribution-packaging-spec.md` falls back to llamafile on Windows. The preferred fix is to bypass the Python wheel entirely and run LiteRT-LM through its cross-platform C++ library:

- **Track A — LiteRT-LM C++**: Google publishes a cross-platform C++ library and a demo CLI runner (`litert_lm_main`). Building the demo validates the toolchain, but Delfin needs a small JSONL/stdio bridge built on the C++ Conversation API for long-lived streaming turns, multimodal blobs, and interrupt handling.
- **Track B — Foundry Local**: Microsoft's local model runtime for Windows (cross-platform via REST). This is a contingency path, not a parallel replacement candidate, because Delfin's required LiteRT-LM feature set has already been validated.

Both paths preserve the renderer ↔ Electron main ↔ WebSocket sidecar architecture by introducing a thin proxy that speaks Delfin's existing sidecar WebSocket protocol on one side. If Track A passes, the Windows distribution strategy should become a LiteRT C++ bridge binary + `litert-cpp-proxy.mjs`, and the llamafile fallback should be removed from the active packaging plan.

Track A has a strict build/runtime split:

- **Developer/CI only:** LiteRT-LM C++ source tree, Bazelisk/Bazel, Visual Studio C++ toolchain, and `native/litert-cpp-bridge/` source are used to build `delfin_litert_bridge.exe`.
- **End user only:** the packaged app receives a prebuilt `delfin_litert_bridge.exe` plus bundled Node proxy scripts. The user never needs the LiteRT-LM source tree, Bazel, or a compiler.
- **First-run asset:** `gemma-4-E2B-it.litertlm` remains a model download/cache item, not a committed repo file or required compiler input.

### Developer environment policy

The default LiteRT-LM C++ developer environment is **Linux / macOS (arm64) / WSL2**. On a Windows host, `npm run setup:litert-cpp` prints WSL2 setup instructions and exits unless `--native-windows` is passed; with the flag, it runs the existing Bazel + MSVC flow. This decision moves the historic Windows toolchain pain (vswhere, `BAZEL_VS`/`BAZEL_VC`, `Hostx64\x64\cl.exe` ordering, `LongPathsEnabled`, `output_user_root=C:/b`, MSVC workload completeness) off the default developer path while preserving the ability to produce and test a native Windows `.exe` locally. End-user distribution still ships native Windows binaries — those are produced by CI per `docs/features/distribution/distribution-cicd-spec.md`.

### Current validation snapshot — 2026-05-03

- ✅ Native Windows build succeeded after updating Visual Studio 2022 to 17.14.31 / MSVC 14.44 and using a short Bazel output root (`D:\b`).
- ✅ Runtime files required by the app-facing copy are `bin/delfin_litert_bridge.exe` plus `bin/libGemmaModelConstraintProvider.dll`.
- ✅ `npm run dev:backend` starts the Node proxy, loads `models/gemma-4-E2B-it.litertlm`, and serves `GET /health` with `backend=litert-cpp`.
- ✅ WebSocket text turns stream `{type:"token"}` chunks and finish with `{type:"done"}` through the existing Electron-compatible sidecar protocol.
- ✅ Full benchmark `node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s2,s3'` completed: S1 TTFT `5414±66 ms`, S1 throughput `22.0±1.3 tok/s`; S2 TTFT `10639±104 ms`, S2 throughput `20.3±0.6 tok/s`; S3 Turn 2+ TTFT ~`647 ms` (KV-cache reuse confirmed).
- ✅ Vision + KV-cache source-level fix landed (commit `570d2fa`, see `docs/features/litert-cpp-vision-spec.md`): `--vision_backend` flag, `JsonPreface` for system prompt, per-`sessionId` `g_sessions` map with `Conversation` reuse, `reset_session` handler, and `SendMessageAsync` called with the singular new user turn. The proxy now generates a `sessionId` per WebSocket connection and sends `reset_session` on close.
- ✅ Audio input on the C++ bridge is implemented and validated on Windows; voice-turn parity works on `npm run dev:backend`.
- ✅ Manual repeated voice-turn validation against the Electron app now passes after renderer-side VAD/fallback lifecycle fixes; the second voice turn re-arms correctly once assistant playback ends.
- ⚠️ Full manual lecture-slide app validation is still pending for vision, interrupt/barge-in, reconnect, and inline error checks.
- ✅ Off-Python TTS is now implemented on the `litert-cpp` proxy path via Piper-first sentence-level streaming; `/health` reports `tts_backend` / `tts_ready` / `tts_model`, successful turns can emit `audio_start` / `audio_chunk` / `audio_end` before final `done`, and the renderer still falls back to browser Web Speech if Piper is disabled, misconfigured, or fails mid-turn.
- ❌ macOS / Linux native bridge builds have not been attempted; cross-platform parity is required before the C++ track can replace llamafile in the distribution plan.

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
Renderer ──IPC──► Electron Main ──ws──► litert-cpp-proxy.mjs ──JSONL/stdio──► delfin_litert_bridge.exe   [Windows packaged]
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

| Phase  | Deliverable                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A0** | Native Windows build of `litert_lm_main.exe` from `https://github.com/google-ai-edge/LiteRT-LM` using Bazelisk + Visual Studio Build Tools. Document exact `bazel build` command and required toolchain versions.                                                                                             |
| **A1** | ⚠️ Native Windows bridge builds and streams text. Vision + per-session KV-cache reuse landed at source level (see `litert-cpp-vision-spec.md`). Pending: rebuild `bin/delfin_litert_bridge.exe` from post-`570d2fa` source and run a single image-prompt + cancellation smoke test. |
| **A2** | ⚠️ Benchmark adapter works for C++ text scenarios on native Windows (S1/S3 published). S2 re-run with the rebuilt bridge is the next pending action.                                                                                                                                |
| **A3** | ✅ Sidecar proxy `scripts/litert-cpp-proxy.mjs` exposes the Delfin WebSocket sidecar protocol on port 8321, generates a `sessionId` per WebSocket connection, forwards turns as singular-message JSONL with `systemPrompt` + `sessionId`, sends `reset_session` on connection close, and can emit optional Piper-backed `audio_*` frames plus health metadata on the LiteRT C++ path. |
| **A4** | ⚠️ Partial manual Delfin validation: app launches against `litert-cpp-proxy.mjs` and text turns work. The lecture-slide workflow round + interrupt/barge-in/reconnect/error inline checks against the rebuilt vision-capable bridge are still pending.                              |
| **A5** | Distribution assessment: if A0–A4 pass, revise the distribution docs so Windows uses the LiteRT C++ bridge binary + `litert-cpp-proxy.mjs` and remove llamafile as an active fallback. Identify remaining installer/model-download work.                                                                      |
| **A6** | CI/build handoff: automate the developer/CI-only bridge build with a helper script, then feed the prebuilt `delfin_litert_bridge.exe` into packaging. Users receive the binary; only models/TTS assets are first-run downloads.                                                                               |

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

| Surface       | Contract                                                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebSocket     | `ws://localhost:${SIDECAR_PORT}/ws` (default 8321)                                                                                                                                                                                                                                                          |
| Health        | `GET http://localhost:${SIDECAR_PORT}/health` → `{"status":"ok","backend":"litert-cpp"}`                                                                                                                                                                                                                    |
| Child process | Spawns `LITERT_CPP_BIN --model_path <path>` where `LITERT_CPP_BIN` is a Delfin JSONL/stdio bridge built on LiteRT-LM C++; one persistent process per proxy                                                                                                                                                  |
| Image input   | **High-priority gap.** Delfin already sends base64 PNG/JPEG blobs over WebSocket; `litert-cpp-proxy.mjs` preserves them in the JSONL message, but `delfin_litert_bridge.cc` must still translate those content parts into the LiteRT-LM C++ image input representation. No temp files should be introduced. |
| Interrupt     | `{type:"interrupt"}` → cancels in-flight generation via the C++ engine's cancellation hook                                                                                                                                                                                                                  |

### Track B — `foundry-proxy.mjs` (contingency only)

| Surface          | Contract                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| WebSocket        | `ws://localhost:${SIDECAR_PORT}/ws` (default 8321)                                                                              |
| Health           | `GET http://localhost:${SIDECAR_PORT}/health` → `{"status":"ok","backend":"foundry"}`                                           |
| Foundry endpoint | OpenAI-compatible `POST /v1/chat/completions` against the local Foundry service (port discovered via SDK or `FOUNDRY_BASE_URL`) |
| Image input      | OpenAI `image_url` data URL inside the chat message (mirrors `llamafile-proxy.mjs`)                                             |
| Interrupt        | `{type:"interrupt"}` → `AbortController` on the in-flight `fetch`                                                               |

### Environment variables (new, conditional)

| Var                   | Default                            | Purpose                                                                                        |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `INFERENCE_BACKEND`   | `litert`                           | Adds `litert-cpp` if Track A passes; adds `foundry` only if Track B is activated.              |
| `LITERT_CPP_BIN`      | `./bin/litert_lm_main.exe`         | Path to the LiteRT-LM C++ JSONL bridge. Raw upstream `litert_lm_main` is not a drop-in bridge. |
| `LITERT_CPP_MODEL`    | `./models/gemma-4-E2B-it.litertlm` | `.litertlm` model file.                                                                        |
| `FOUNDRY_BASE_URL`    | auto-discovered                    | Contingency only. Override Foundry Local REST endpoint when SDK discovery is unavailable.      |
| `FOUNDRY_MODEL_ALIAS` | `phi-3.5-vision` (TBD)             | Contingency only. Foundry model alias to load. Final value depends on B0 catalog check.        |

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
bazelisk build //runtime/engine:litert_lm_main --config=windows
```

The upstream demo binary validates the toolchain and model load path. `native/litert-cpp-bridge/` now contains the Delfin-specific bridge source that uses the same LiteRT-LM C++ Conversation API but speaks JSONL over stdio for the Node proxy. It still needs to be copied into a LiteRT-LM checkout and built natively on Windows. Models are downloaded separately to `models/*.litertlm` and gitignored.

The local/CI build helper is `npm run bridge:build -- --litert-lm-dir <LiteRT-LM checkout>`. It copies the bridge source into the upstream tree, builds `//runtime/engine:delfin_litert_bridge`, and writes the resulting executable to Delfin's gitignored `bin/` directory. The helper does not install toolchains or download models.

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

### Current acceptance status — 2026-05-03

Track A is **not yet verified**. Windows build reproducibility, health, WebSocket text streaming, S1/S2/S3 benchmark execution, image input, per-session KV-cache reuse, audio-input parity, and Piper-backed proxy TTS are now validated on Windows. The remaining acceptance items before Track A can flip ✅ are: complete the full manual lecture-slide app round (including interrupt/reconnect/error checks) and produce native macOS + Linux bridge builds + benchmark numbers.

---

## Risks & open questions

### Track A

- **Build complexity on Windows.** Bazel + MSVC toolchains are non-trivial; first-time builds can take 30–60 min and may require specific MSVC versions.
- **Off-Python TTS packaging is still open.** The reference Piper implementation now works in `scripts/litert-cpp-proxy.mjs`, but distribution still needs a decision on how to bundle or first-run-download the Piper binary and voice assets. Native Kokoro remains the higher-quality follow-up candidate.
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
2. **A1 — Direct C++ smoke test.** Text streaming is validated. Next, implement and validate vision/image input plus cancellation before considering Track A complete.
3. **A2 — Benchmark LiteRT-LM C++.** S1/S3 text benchmarks are validated. Re-run full S1/S2/S3 after C++ vision support lands and compare against existing LiteRT-LM Python + llamafile results.
4. **A3 — Build the Delfin WebSocket proxy.** Only after A2 passes thresholds, implement `litert-cpp-proxy.mjs` behind the existing sidecar protocol.
5. **A4 — Automated/manual Delfin feature validation.** Run the full app against the C++ proxy and validate the core lecture-slide workflow plus capture, interrupt, reconnect, error, and TTS fallback behavior.
6. **A5 — Assess distribution next steps.** If A0–A4 pass, update the distribution plan to remove llamafile and identify remaining packaging work: bundling the binary, model download/cache, first-run setup, installer resources, and CI artifacts.
7. **A6 — Automate build handoff.** Add/validate the bridge build helper and CI artifact handoff so `delfin_litert_bridge.exe` is produced before Electron packaging.
8. **Track B decision gate.** Foundry Local work starts only if Track A fails and the human explicitly approves activating the contingency path.

---

## Completed sub-specs (consolidated)

The following Track A sub-specs reached ✅ Gate 5 and have been archived. They remain in `docs/archive/features/` as historical decision records; their outcomes are summarised here.

| Sub-spec                                                                                                       | Outcome                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`litert-cpp-vision-spec.md`](../../archive/features/litert-cpp-vision-spec.md)                                 | Vision support and KV-cache session reuse landed in `native/litert-cpp-bridge/delfin_litert_bridge.cc` (`--vision_backend` flag, `JsonPreface`, `g_sessions` map, `reset_session` handler, `SendMessageAsync` called with the singular new user turn). Validated 2026-05-03: S2 TTFT 10,639±104 ms / 20.3±0.6 tok/s; S3 Turn 2+ TTFT ~647 ms (vs Turn 1 ~5,400 ms) confirms KV-cache reuse is working. |
| [`litert-cpp-audio-spec.md`](../../archive/features/litert-cpp-audio-spec.md)                                   | Native audio-input parity in the C++ bridge: `--audio_backend` flag, `EngineSettings::CreateDefault(..., vision_backend, audio_backend)`, session-level modality toggles, audio-disabled validation guard. Validated 2026-05-03 on Windows; voice-turn parity restored for `npm run dev:backend`.                                                                                                  |
| [`litert-cpp-proxy-piper-tts-spec.md`](../../archive/features/litert-cpp-proxy-piper-tts-spec.md)               | Piper-first off-Python TTS for `scripts/litert-cpp-proxy.mjs`: `LITERT_CPP_TTS_BACKEND=piper`, `PIPER_*` config resolution, `/health` TTS metadata, sentence-level streaming audio, interrupt cancellation, voice switching via `scripts/piper-voice.mjs`, sample-rate detection from `PIPER_CONFIG`, and fallback to renderer Web Speech when Piper is unavailable. Validated 2026-05-03 with Vitest, live smoke tests, and manual confirmation that audio can begin before final `done`. |

Open Track A sub-specs that are still in flight:

- [`litert-cpp-audio-input-spec.md`](./litert-cpp-audio-input-spec.md) — 🚧 Gate 1 draft (deeper renderer/proxy audio contract work).
- [`litert-cpp-bridge-runtime-validation-spec.md`](./litert-cpp-bridge-runtime-validation-spec.md) — 🚧 macOS / Linux native bridge builds and full manual app round.
- [`litert-cpp-primary-backend-migration-spec.md`](./litert-cpp-primary-backend-migration-spec.md) — 🚧 Umbrella for promoting the C++ bridge to default once Track A passes on all three OSes.

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
