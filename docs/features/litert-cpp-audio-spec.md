# LiteRT-LM C++ Bridge — Native Audio Input Support

> Gate 5 — docs updated. Rebuilt binary + runtime validation completed on Windows.
> Sub-feature of Track A in `native-windows-backend-research-spec.md`.
> Closes the audio-input gap called out in `native-windows-backend-research-spec.md` §Current acceptance status and `litert-cpp-bridge-runtime-validation-spec.md` §Risks (silent audio drop / crash).
> Restores voice-turn parity between the LiteRT C++ bridge and the Python sidecar so `npm run dev:litert-cpp` can serve the default voice-first demo without crashing on `audio` content parts.

## Gate Resolution

| Field          | Value                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | ✅ Gate 5 complete — source implemented, binary rebuilt, Windows runtime validated, docs updated                                                                                                                                                     |
| **Created**    | 2026-05-03                                                                                                                                                                                                                                            |
| **Approved**   | 2026-05-03                                                                                                                                                                                                                                            |
| **Implemented** | `native/litert-cpp-bridge/delfin_litert_bridge.cc` (`--audio_backend` flag, `EngineSettings::CreateDefault(..., vision_backend, audio_backend)`, session `SetVisionModalityEnabled` / `SetAudioModalityEnabled`, `MessageHasContentType` audio-disabled guard); source-contract coverage in `native/litert-cpp-bridge/delfin_litert_bridge.test.mjs` |
| **Validated**  | 2026-05-03 — Bridge emits `ready` with `--audio_backend=cpu`; text turn streams via proxy; fake audio blob reaches miniaudio decoder (error -10 = invalid data, proving path is open); `--audio_backend=none` returns exact JSONL error `"Audio input is disabled for this LiteRT C++ bridge."`; `npm test` passes (21/21) |
| **Depends on** | `litert-cpp-vision-spec.md` source implementation (commit `570d2fa` ✅), `native-windows-backend-research-spec.md` A0 build ✅, A3 proxy ✅                                                                                                            |
| **Blocks**     | Voice-turn parity for `npm run dev:litert-cpp`; lifting the explicit audio-not-supported guard described in `litert-cpp-bridge-runtime-validation-spec.md` §Risks; Track A acceptance for the voice-first demo on the native Windows / macOS / Linux bridges |

---

## Goal

Add native audio-input support to the LiteRT C++ bridge so that the existing Delfin voice payload (`{ image, audio, text, preset_id }` produced by the renderer VAD pipeline) is accepted by `delfin_litert_bridge.exe` without crashing, and the model's response references both the spoken request and (when present) the captured screen — matching the Python sidecar's voice-turn behaviour.

---

## Background

The renderer/main/proxy pipeline already produces and forwards audio correctly:

- `useVAD.ts` captures mic audio, `audioUtils.ts` encodes it as 16 kHz mono WAV.
- `sessionHandlers.ts` submits voice turns with `text = VOICE_TURN_TEXT`, the captured screenshot, and the base64 WAV.
- `scripts/litert-cpp-proxy.mjs` (`buildUserMessage`) already converts that payload into the LiteRT-LM C++ content shape:

```js
if (request.image) content.push({ type: "image", blob: request.image });
if (request.audio) content.push({ type: "audio", blob: request.audio });
if (request.text)  content.push({ type: "text",  text: request.text });
```

The native bridge is the only layer that does not understand audio. Two upstream LiteRT-LM C++ facts make the fix small:

1. **`data_utils.cc` already handles `{"type":"audio","blob":"<base64>"}`** by `absl::Base64Unescape` → `InMemoryFile::Create`. No temp files, no schema changes (matches the "Image blobs work" decision in `AGENTS.md` §Validated Technical Decisions).
2. **`Gemma4DataProcessor` already preprocesses audio items** into the `<start_of_audio>` / `<audio_soft_token>` template slots, matching the same nested-content shape we already use for image+text.

The current `delfin_litert_bridge.cc` calls `EngineSettings::CreateDefault(model_assets, backend, vision_backend)` with no audio backend, so `GetAudioExecutorSettings()` returns `nullopt` and the audio executor is never loaded. Forwarding an `audio` content part in this state is the most likely cause of the `3221225477` (Windows access-violation) crash observed during voice turns: the data processor sees an audio item but no audio executor exists to handle the resulting `<audio_soft_token>` placeholders.

The companion change is that `Conversation::Create` is called with the default `SessionConfig`, which has `AudioModalityEnabled() == false` (and `VisionModalityEnabled() == false`) by default. Upstream only loads modality-specific executors at session time when these flags are set, so we must enable them explicitly based on what the engine settings actually contain. Enabling vision modality on the session at the same time is a no-cost alignment with the already-landed vision changes.

---

## Scope

| File | Change |
|------|--------|
| `native/litert-cpp-bridge/delfin_litert_bridge.cc` | (1) Add `--audio_backend` flag (default `cpu`, accepts `cpu`/`gpu`/`npu`/`none`). (2) Pass parsed audio backend into `EngineSettings::CreateDefault(..., vision_backend, audio_backend)`. When `--audio_backend=none`, pass `std::nullopt` so no audio executor is created. (3) In `CreateConversation`, call `session_config.SetAudioModalityEnabled(...)` and `session_config.SetVisionModalityEnabled(...)` based on whether `engine.GetEngineSettings().GetAudioExecutorSettings()` / `GetVisionExecutorSettings()` are present. (4) In `Generate`, before `SendMessageAsync`, validate that if `request["message"]["content"]` contains an `audio` part, the engine has an audio executor — otherwise return `absl::InvalidArgumentError("Audio input is disabled for this LiteRT C++ bridge.")` so the proxy emits a clean inline error instead of risking a crash. |
| `native/litert-cpp-bridge/delfin_litert_bridge.test.mjs` | Source-contract assertions: `FLAGS_audio_backend` declared; `GetAudioExecutorSettings` referenced; `SetAudioModalityEnabled` and `SetVisionModalityEnabled` called; an audio-disabled validation guard exists; `request["message"]` (singular) is still what is passed to `SendMessageAsync` (no regression of the KV-cache contract). |
| `native/litert-cpp-bridge/README.md` | After implementation lands: drop the "Audio input is not yet wired through the bridge" note in the Current status section; document the `--audio_backend` flag and the `none` escape hatch. |

---

## Out of scope

- Renderer or main-process changes (`useVAD.ts`, `audioUtils.ts`, `sessionHandlers.ts`, `useActiveSession.ts`).
- `src/shared/types.ts` / `src/shared/schemas.ts` — voice payload shape is unchanged.
- `scripts/litert-cpp-proxy.mjs` and `scripts/litert-cpp-presets.mjs` — `buildUserMessage` already handles audio; no protocol change.
- `scripts/benchmark/backends/litert_cpp.py` — existing benchmark scenarios (S1/S2/S3) do not exercise audio; an audio-specific benchmark scenario is a separate spec.
- Server-side TTS on the C++ track — separate spec (called out in `litert-cpp-bridge-runtime-validation-spec.md` §Out of scope).
- electron-builder / packaging changes for any audio executor co-located shared libraries (covered by `distribution-packaging-spec.md`).
- Cross-platform native builds — covered by `litert-cpp-bridge-runtime-validation-spec.md` Phases 3–4. This spec only changes the source; cross-platform validation rides along with the existing runtime-validation work.
- Sample-rate / channel conversion in the bridge — Delfin already produces 16 kHz mono WAV; if Gemma 4 requires a different shape that is a renderer-side concern.

---

## Interface contract

### App-level WebSocket payload — unchanged

```jsonc
{
  "text": "Please respond to what the user just asked.",
  "image": "<base64 JPEG>",
  "audio": "<base64 WAV, 16 kHz mono>",
  "preset_id": "lecture-slide"
}
```

### Bridge JSONL protocol — unchanged

The `generate` request shape, the `token` / `done` / `error` event shapes, and the `interrupt` / `reset_session` commands are all unchanged. The only protocol-adjacent addition is the new `--audio_backend` CLI flag on the bridge binary itself.

### Bridge CLI — new flag

| Flag | Default | Values | Behaviour |
|------|---------|--------|-----------|
| `--audio_backend` | `cpu` | `cpu`, `gpu`, `npu`, `none` | Selects the LiteRT audio executor backend. `cpu` matches the Python sidecar's validated decision (`AGENTS.md` §Validated Technical Decisions — "Audio backend is always CPU"). `none` disables audio entirely; the bridge then returns a clean error for any request whose `message.content` contains an `audio` part. |

The proxy continues to spawn the bridge with only `--model_path`; the `cpu` default is correct for all current target hardware. An optional follow-up may have the proxy honour an `LITERT_CPP_AUDIO_BACKEND` env var (mirroring the existing `LITERT_AUDIO_BACKEND` used by the Python sidecar) and forward it as `--audio_backend`; that wiring is **not** required by this spec.

### Engine initialisation — extended

```cpp
// Before
EngineSettings::CreateDefault(std::move(model_assets), backend,
                              vision_backend);

// After
EngineSettings::CreateDefault(std::move(model_assets), backend,
                              vision_backend,
                              audio_backend);  // std::optional<Backend>; std::nullopt when --audio_backend=none
```

### Session configuration — modality flags driven by engine settings

```cpp
auto session_config = SessionConfig::CreateDefault();
session_config.SetVisionModalityEnabled(
    engine.GetEngineSettings().GetVisionExecutorSettings().has_value());
session_config.SetAudioModalityEnabled(
    engine.GetEngineSettings().GetAudioExecutorSettings().has_value());
```

### Bridge-side audio validation guard

```cpp
// In Generate(), after request validation, before AcquireConversation/SendMessageAsync.
if (MessageHasContentType(request["message"], "audio") &&
    !engine.GetEngineSettings().GetAudioExecutorSettings().has_value()) {
  return absl::InvalidArgumentError(
      "Audio input is disabled for this LiteRT C++ bridge.");
}
```

`MessageHasContentType` is a small private helper that walks `message["content"]` (when array) and returns true if any element has the requested `type`.

### Environment variables — none required

`.env.example` already documents `LITERT_AUDIO_BACKEND=CPU` for the Python sidecar. No new variable is required for this spec; the bridge's `cpu` default is correct.

---

## Acceptance criteria

| # | Criterion |
| - | --------- |
| AC1 | `delfin_litert_bridge[.exe]` starts with the default `--audio_backend=cpu` and emits the standard `{type:"ready"}` event. |
| AC2 | Text-only turn (S1) still streams `token` events and ends with `done`; baseline TTFT/throughput within ±10 % of the numbers recorded by `litert-cpp-bridge-runtime-validation-spec.md` Phase 1. |
| AC3 | Vision-only turn (S2) still streams a coherent response; no regression vs. the validation-spec Phase 1 numbers. |
| AC4 | Voice-only minimal turn (`text` + `audio`, no `image`) through `wscat → litert-cpp-proxy → bridge` returns a coherent text response that references the spoken content; no Windows access-violation (`3221225477`) or other crash. |
| AC5 | Voice + image + text turn (the production app voice payload) through `npm run dev:litert-cpp` returns a coherent response that uses both the spoken request and the captured screen. |
| AC6 | `{"type":"interrupt","requestId":"<id>"}` mid-voice-turn cancels generation; no further `token` events for that request and no orphan tokens leak into the next turn. |
| AC7 | KV-cache reuse from `litert-cpp-vision-spec.md` is preserved: Turn 2+ TTFT (text follow-up after a voice turn) ≤ 700 ms. |
| AC8 | Closing the WebSocket triggers `reset_session` and a fresh connection starts a clean session with no state bleed. |
| AC9 | With `--audio_backend=none`, an audio-bearing turn returns a single `error` event (`"Audio input is disabled for this LiteRT C++ bridge."`) and the bridge stays alive for subsequent text/vision turns. |
| AC10 | `npm test` passes including the new source-contract assertions in `delfin_litert_bridge.test.mjs`. |

The runtime-validation cross-platform builds (macOS arm64, Linux x64) ride along with `litert-cpp-bridge-runtime-validation-spec.md` Phases 3–4 and are not gated separately by this spec; AC1–AC10 must be observed on Windows (the platform where the original crash was reported).

---

## Risks and open questions

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **Gemma 4 E2B `.litertlm` does not bundle the audio executor weights.** If the audio executor needs separately packaged tensors that the current model file lacks, `EngineSettings::CreateDefault(..., audio_backend=CPU)` will fail at engine construction time and break text/vision too. | Medium | Smoke-test the existing Python sidecar load with `audio_backend=CPU` against the same `.litertlm` file before claiming the bridge change is safe — the sidecar already uses `audio_backend=litert_lm.Backend.CPU` on both load paths and is known to start cleanly, which is strong evidence the model contains the audio executor. If construction fails, fall back to `--audio_backend=none` as the bridge default and document the limitation. |
| **WAV vs raw PCM container.** `data_utils.cc` decodes the base64 blob into bytes and hands it to the audio executor; if Gemma 4's audio preprocessor expects raw 16 kHz mono PCM rather than a WAV container, the existing renderer payload will not work. | Medium | The Python sidecar already accepts the same WAV-encoded blob successfully; this is strong evidence the WAV container is acceptable. If runtime testing shows otherwise, add a renderer-side raw-PCM mode and route it through the existing payload — out of scope for this spec but tracked here. |
| **Memory and startup-time cost of loading the audio executor by default.** The Gemma 4 audio executor adds load time and resident memory beyond text+vision. | Medium | Acceptable for the voice-first demo. `--audio_backend=none` provides an escape hatch for text/vision-only deployments and for debugging memory/startup regressions. Measure RSS before vs. after on Windows during AC1 verification; if the increase exceeds 500 MB, document and revisit. |
| **`SetVisionModalityEnabled` was previously absent.** This spec introduces it alongside the audio modality flag. If the upstream engine implicitly enabled vision based on the executor presence, an explicit call still set to `true` is a no-op. If it gated on the flag and vision was silently off in the rebuild, this change may also affect already-pending vision-spec runtime numbers. | Low | Coordinate the rebuild with the runtime-validation phase (`litert-cpp-bridge-runtime-validation-spec.md` Phase 1) so AC2/AC3 here and AC2/AC4 there share a single binary; record both spec-numbers from the same benchmark run. |
| **Audio crash recurs despite the fix.** Even with the audio executor enabled, the upstream Gemma 4 audio path may have a bug that surfaces on Windows. | Low | Keep the `MessageHasContentType` guard in place and gate it on `--audio_backend=none` so the demo can still ship with text+vision while the upstream fix is pursued. |
| **Concurrent audio + interrupt path.** A long audio prompt cancelled mid-prefill may exercise an upstream code path that text/vision interrupts have not. | Low | AC6 explicitly tests this; if interrupts misbehave, fall back to enabling audio behind a feature flag for the demo and file an upstream issue. |
