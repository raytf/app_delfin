# LiteRT-LM C++ Bridge — Runtime Validation & Cross-Platform Builds

> Gate 1 — spec draft awaiting human approval. Phase 1 (Windows rebuild + benchmark) completed 2026-05-03.
> Closes out the pending items in `native-windows-backend-research-spec.md` phases A1–A4 and the runtime-validation gate in `litert-cpp-vision-spec.md`. If all acceptance criteria pass, triggers A5: update `desktop-distribution-mvp-spec.md` and `distribution-backend-migration-spec.md` to make the LiteRT C++ bridge the primary Windows backend and remove llamafile from the active distribution plan.

## Gate Resolution

| Field          | Value                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | 🚧 Gate 1 — spec draft, awaiting human approval. Phase 1 (Windows rebuild + S1/S2/S3 benchmark) completed 2026-05-03. Phase 2 (manual app validation) is partially complete: proxy/WebSocket checks and repeated voice-turn validation now pass on Windows; lecture-slide/interrupt/error/reconnect checks remain pending. Phases 3–4 (macOS/Linux builds) pending. |
| **Created**    | 2026-05-03                                                                                                                                                                      |
| **Depends on** | `litert-cpp-vision-spec.md` source implementation (commit `570d2fa` ✅), `native-windows-backend-research-spec.md` A0 build ✅, A3 proxy ✅                                       |
| **Blocks**     | `desktop-distribution-mvp-spec.md` Windows backend decision; `distribution-backend-migration-spec.md` revision (llamafile removal); `distribution-packaging-spec.md` bridge packaging |

---

## Goal

Rebuild `delfin_litert_bridge` from the current source, run the full S1/S2/S3 benchmark sweep on Windows, complete the manual lecture-slide validation round, then produce and validate native bridge builds on macOS and Linux. If all criteria pass, update the distribution plan to adopt the LiteRT C++ bridge as the primary backend on all platforms and retire the llamafile fallback from the active Windows packaging plan.

---

## Background

The source-level vision + KV-cache fix landed in commit `570d2fa` (see `litert-cpp-vision-spec.md`). The remaining gap is purely runtime: the `bin/delfin_litert_bridge.exe` in-tree binary predates these changes, so benchmark S2 (vision) and Turn 2+ KV-cache TTFT have not yet been measured. The proxy (`scripts/litert-cpp-proxy.mjs`) and benchmark infrastructure (`scripts/run-benchmark.mjs`, `scripts/benchmark/backends/litert_cpp.py`) are already wired. There is no new code to write for the validation itself; the work is: build, run, measure, decide.

Per `native-windows-backend-research-spec.md` §A5, a passing Track A validation is the prerequisite for revising `desktop-distribution-mvp-spec.md` (hybrid llamafile → C++ bridge on Windows) and `distribution-backend-migration-spec.md` (proxy swap + removal of `llamafile-proxy.mjs` from the Windows packaging plan). Cross-platform builds on macOS and Linux are also required before the C++ track can replace the Python sidecar on those platforms.

---

## Scope

### Phase 1 — Windows rebuild + full benchmark ✅ Completed 2026-05-03

| Step | Command / Action | Result |
| ---- | ---------------- | ------ |
| 1a   | `npm run build:litert-cpp-bridge -- -- --litert-lm-dir <path-to-LiteRT-LM>` → verify `bin/delfin_litert_bridge.exe` and `bin/libGemmaModelConstraintProvider.dll` are up-to-date. | ✅ Built with `--output_user_root=D:\b` workaround; binary copied to `bin/` |
| 1b   | `node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s2,s3'` on the native Windows host with the rebuilt binary. Capture JSON + CSV in `results/`. | ✅ Completed; JSON + CSV written to `results/` |
| 1c   | Record S1 TTFT, S1 throughput, S2 TTFT, S2 throughput, S3 throughput, and Turn 2+ TTFT (KV-cache reuse). Compare S1 baseline to previous run (`S1 TTFT 5433.9±83.6 ms`, throughput `20.4±0.9 tok/s`). | ✅ **S1** TTFT 5,414±66 ms / 22.0±1.3 tok/s (within 20% baseline); **S2** TTFT 10,639±104 ms / 20.3±0.6 tok/s; **S3** Turn 1 ~5,400 ms, Turn 2+ ~647 ms (KV-cache reuse confirmed) |

### Phase 2 — Windows manual app validation (proxy/WebSocket round)

| Step | Check | Result |
| ---- | ----- | ------ |
| 2a   | `npm run dev:litert-cpp` starts without error; `GET /health` returns `{"backend":"litert-cpp","status":"ok"}`. | ✅ Proxy starts; health returns `{"status":"ok","backend":"litert-cpp","model":"..."}` |
| 2b   | Text turn: send a plain-text question; receive streamed tokens ending with `{type:"done"}`. | ✅ WebSocket text turn streams token `"Hello"` + `done` |
| 2c   | Vision turn: capture a lecture slide screenshot; send with a "Explain this slide" prompt; receive a structured explanation referencing visual content. | ⚠️ Image decode path validated (base64 reaches decoder); full lecture-slide round deferred to Electron app test |
| 2d   | KV-cache multi-turn: send three follow-up turns on the same session; Turn 2+ TTFT should be ≤ 700 ms (vs. ~5,300 ms without session reuse). | ✅ Benchmark S3 confirms Turn 2+ TTFT ~647 ms |
| 2e   | Interrupt/barge-in: click Stop mid-stream; no orphaned tokens appear in subsequent turns. | ⏸ Not tested in this round |
| 2f   | Error inline: point `LITERT_CPP_MODEL` at a non-existent file; confirm the error surfaces as a chat inline message, not a crash or alert dialog. | ⏸ Not tested in this round |
| 2g   | Reconnect: close and reopen the sidebar; the proxy spawns a new session correctly. | ⏸ Not tested in this round |
| 2h   | Voice repeat-turn round in the Electron app: after the assistant finishes speaking, a second voice turn re-arms the waveform and triggers VAD again. | ✅ Validated on Windows after renderer fixes in `useVAD.ts` and `useActiveSession.ts` |

### Phase 3 — macOS native bridge build + validation

| Step | Action |
| ---- | ------ |
| 3a   | On macOS (arm64 first, then x64 if available), run `npm run build:litert-cpp-bridge -- -- --litert-lm-dir <path>` with the macOS Bazel target. |
| 3b   | Verify `bin/delfin_litert_bridge` is produced and executable. |
| 3c   | Run `node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s2,s3'`. Record numbers alongside the Windows results. |
| 3d   | Run manual checks 2a–2g on macOS. |

### Phase 4 — Linux native bridge build + validation

| Step | Action |
| ---- | ------ |
| 4a   | On Linux x64 (or WSL2 Ubuntu as a proxy), build and verify `bin/delfin_litert_bridge` using the Linux Bazel target. |
| 4b   | Run the same benchmark sweep and manual checks. |

### Phase 5 — Distribution decision (conditional on Phases 1–4 passing)

If all acceptance criteria below are met:

1. Update `desktop-distribution-mvp-spec.md` §Revision — replace the hybrid llamafile/LiteRT table with an all-platform LiteRT C++ bridge table; set Windows backend to `litert-cpp-proxy.mjs + delfin_litert_bridge.exe`.
2. Update `distribution-backend-migration-spec.md` — change the target architecture diagram to the "Track A passes" variant already shown in `native-windows-backend-research-spec.md`; mark `llamafile-proxy.mjs` as deferred/removed from the active Windows plan.
3. Update `native-windows-backend-research-spec.md` — flip A1, A2, A4, A5 to ✅ and set overall status to Gate 4 complete.
4. Update `litert-cpp-vision-spec.md` — fill in measured S2 and Turn 2+ TTFT numbers; flip status to Gate 4 complete.
5. Open a follow-up spec for `distribution-packaging-spec.md` changes needed to package `delfin_litert_bridge[.exe]` as an `extraResource` in electron-builder (out of scope here).

---

## Out of scope

- Further audio-input contract/polish work on the C++ bridge (tracked separately in `litert-cpp-audio-input-spec.md`).
- ~~TTS strategy for the C++ track~~ — **resolved**: Piper via Node proxy (M3 complete 2026-05-03, see archived `litert-cpp-proxy-piper-tts-spec.md`).
- electron-builder packaging changes, first-run download UX, or installer creation (covered by `distribution-packaging-spec.md`).
- CI/CD automation of the bridge build (`distribution-cicd-spec.md`).
- Track B (Foundry Local) — this spec assumes Track A passes; activate Track B only if a blocking criterion fails (see `native-windows-backend-research-spec.md` §Track B).
- Windows arm64, Linux arm64, macOS x64 secondary (macOS arm64 is the primary macOS target).

---

## Acceptance criteria

| # | Criterion |
| - | --------- |
| AC1 | `bin/delfin_litert_bridge.exe` (Windows) is rebuilt from post-`570d2fa` source and launches without error. |
| AC2 | Benchmark S2 (vision scenario) completes without error on Windows; TTFT is recorded. |
| AC3 | Benchmark S1 Windows TTFT is within 20% of the previous run baseline (5,433 ms); regression indicates a build problem. |
| AC4 | Turn 2+ TTFT (KV-cache, same session, plain-text follow-up) is ≤ 700 ms on Windows. |
| AC5 | Manual lecture-slide vision round (2a–2g) passes on Windows with no crashes or unhandled errors. |
| AC6 | `bin/delfin_litert_bridge` is buildable and runnable on macOS arm64; S1/S2/S3 benchmark completes. |
| AC7 | `bin/delfin_litert_bridge` is buildable and runnable on Linux x64; S1/S2/S3 benchmark completes. |
| AC8 | All benchmark result files are written to `results/` and committed as `.gitkeep` only (raw JSON/CSV gitignored). |

---

## Risks and open questions

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Vision still fails at runtime despite source fix (e.g., LiteRT-LM C++ API changed between bridge write and build) | Medium | Run a minimal standalone image-decode smoke test before the full benchmark; compare against the LiteRT-LM C++ sample app. |
| macOS Bazel build requires Xcode toolchain changes not yet documented | Medium | Document exact Xcode + Bazelisk versions in `native/litert-cpp-bridge/README.md` as part of Gate 5. |
| KV-cache TTFT improvement is smaller than expected (> 700 ms) on real hardware | Low-Medium | Measure on at least two machines; confirm `Conversation` reuse is actually hitting the warm cache path (add a `{type:"cache_hit"}` debug event to the bridge if needed). |
| `libGemmaModelConstraintProvider.dll` dependency chain differs across platforms | Low | Verify with `ldd` (Linux) / `otool -L` (macOS) and document required co-located shared libs. |
| ~~Off-Python TTS remains missing on the `litert-cpp` proxy path~~ | **Resolved** | Piper via Node proxy implemented (2026-05-03). `scripts/litert-cpp-proxy.mjs` now emits sentence-level `audio_start` / `audio_chunk` / `audio_end`. Web Speech fallback retained for when Piper is disabled. |
