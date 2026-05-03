# LiteRT-LM C++ Bridge — Audio Input

> Gate 1 — spec draft awaiting human approval.
> Closes the audio-input gap called out in `native-windows-backend-research-spec.md` (current snapshot: "Audio input on the C++ bridge is not yet implemented") and the deferred audio item in `litert-cpp-vision-spec.md` §Out of scope. Prerequisite for `litert-cpp-primary-backend-migration-spec.md`.

## Gate Resolution

| Field          | Value                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Gate 1 — spec draft, awaiting human approval                                                                                                                                |
| **Created**    | 2026-05-03                                                                                                                                                                  |
| **Depends on** | `litert-cpp-vision-spec.md` source implementation (commit `570d2fa` ✅), `litert-cpp-bridge-runtime-validation-spec.md` Phase 1 (Windows rebuild + S2 vision validation)   |
| **Blocks**     | `litert-cpp-primary-backend-migration-spec.md` (the C++ bridge cannot become the default until voice turns work, since voice is a core demo flow)                          |

---

## Goal

Add audio-input parity to `delfin_litert_bridge.cc` so that voice turns sent over the existing WebSocket protocol (`{type:"audio", blob:<base64>}`) are forwarded to LiteRT-LM C++ and produce the same streamed response the Python sidecar currently produces.

---

## Background and rationale

Voice-driven turns are a core Delfin feature (see `phase-5-autorefresh-tts.md` and `voice-audio-pipeline.md`). The renderer captures mic audio with `@ricky0123/vad-web`, encodes it, and sends `{text, image?, audio?}` over the sidecar WebSocket. The Python sidecar passes the audio blob unchanged to LiteRT-LM via `{"type":"audio","blob":<b64>}`, relying on the engine's `audio_backend=Backend.CPU` setting (validated in §Validated Technical Decisions: "Audio backend").

The C++ bridge already carries the same intent end-to-end:

- `scripts/litert-cpp-proxy.mjs` `buildUserMessage()` already forwards `{type:"audio", blob:<base64>}` content parts.
- `delfin_litert_bridge.cc` already exposes `--audio_backend` (default `cpu`), already calls `session_config.SetAudioModalityEnabled(...)` based on the engine's `GetAudioExecutorSettings().has_value()`, and already returns an explicit `InvalidArgumentError("Audio input is disabled for this LiteRT C++ bridge.")` when audio content is sent against an engine that did not load an audio executor.

What is missing is the actual content-part decode + handoff: today the bridge's user-message path handles `text` and `image` parts but does not translate `{type:"audio", blob:<base64>}` into the LiteRT-LM C++ Conversation API audio input representation. Audio messages either short-circuit on the executor check or are silently dropped depending on model configuration. This spec implements the missing path mirroring the Python pass-through pattern.

The decision recorded in the migration spec is to **mirror the Python path exactly**: pass the base64 audio blob through to the C++ Conversation API as a `{type:"audio"}` content part and let the same engine that powers the Python sidecar (Gemma 3n E2B with audio executor enabled) handle decoding. No bridge-side WAV→PCM conversion in v1.

---

## Scope

| File                                                      | Change                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native/litert-cpp-bridge/delfin_litert_bridge.cc`        | Add an `audio` branch alongside the existing `text` / `image` branches in the user-message decode path. Decode the base64 blob and append it to the LiteRT-LM C++ user turn as the audio modality content part, using the same Conversation API call shape Gemma 3n E2B accepts in the Python LiteRT-LM path.              |
| `native/litert-cpp-bridge/delfin_litert_bridge.cc`        | Replace the silent / generic-error path for audio content with two explicit error responses: (a) `audio_executor_unavailable` when the loaded model has no audio executor, (b) `audio_decode_failed` when base64 decoding fails. Both surface as `{type:"error", message:"..."}` JSONL events to the proxy.                |
| `native/litert-cpp-bridge/delfin_litert_bridge.test.mjs`  | Add a smoke test that pipes a small fixture audio blob (or a stubbed JSONL message) and asserts the bridge emits `token` / `done` (when audio executor is available) or the new explicit error (when it is not).                                                                                                            |
| `scripts/litert-cpp-proxy.mjs`                            | No change to the WebSocket → JSONL mapping (`buildUserMessage` already forwards `audio`). Confirm the proxy surfaces the new error codes through `{type:"error"}` to the renderer unchanged.                                                                                                                                |
| `native/litert-cpp-bridge/README.md`                      | Document the audio-modality requirement on the model file (`.litertlm` must include the audio executor) and the `--audio_backend` flag.                                                                                                                                                                                     |

### Out of scope

- TTS (audio output). Covered by `litert-cpp-primary-backend-migration-spec.md` and the existing TTS/distribution specs.
- Audio resampling, format conversion, or VAD inside the bridge — the renderer already produces the format the model expects; if it doesn't, that is fixed in the renderer or proxy, not here.
- New WebSocket message types — the existing `{type:"audio", blob}` content-part shape is reused.
- Tool-calling parity — tracked in the migration spec.
- Cross-platform builds — covered by `litert-cpp-bridge-runtime-validation-spec.md` and the migration spec; this spec only touches source.

---

## Interface contract

### WebSocket (unchanged)

The renderer continues to send the existing voice-turn payload defined in `docs/SPEC.md` §WebSocket Message Protocol:

```json
{ "text": "Please respond to what the user just asked.",
  "audio": "<base64 PCM/WAV>",
  "preset_id": "lecture-slide" }
```

### JSONL bridge protocol (additions)

The proxy → bridge JSONL turn message gains an `audio` content-part branch (already forwarded by `buildUserMessage`):

```json
{ "sessionId": "...",
  "message": { "role": "user",
               "content": [ { "type": "audio", "blob": "<base64>" },
                            { "type": "text",  "text":  "..." } ] },
  "systemPrompt": "..." }
```

Bridge → proxy error-response additions:

| Error message                                              | Trigger                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `audio_executor_unavailable: model does not expose audio`  | `MessageHasContentType(... "audio")` AND `GetAudioExecutorSettings().has_value() == false`         |
| `audio_decode_failed: invalid base64 audio blob`           | base64 decode of the `blob` field fails before handoff to the Conversation API                     |

Both are emitted as the existing `{"type":"error","message":"..."}` JSONL event the proxy already forwards to the WebSocket as a sidecar `error` message (rendered inline in chat per the existing IPC error rule).

---

## Acceptance criteria

| #   | Criterion                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | `delfin_litert_bridge` rebuilt from post-audio-fix source loads `gemma-4-E2B-it.litertlm` with `--audio_backend cpu` and reports `audio executor available` in startup log. |
| AC2 | A voice turn sent through `npm run dev:litert-cpp` (mic capture → renderer → proxy → bridge) produces a streamed response indistinguishable in shape from the Python sidecar (`token` / `done`). |
| AC3 | Voice turn latency on Windows is within 25% of the Python sidecar baseline on the same hardware (measured manually; not added to the benchmark suite in this spec). |
| AC4 | Sending an `audio` blob against a model loaded **without** an audio executor returns `audio_executor_unavailable` and the renderer shows it as an inline chat error, not a crash. |
| AC5 | Sending an invalid base64 blob returns `audio_decode_failed` with the same inline error treatment.                                                              |
| AC6 | `delfin_litert_bridge.test.mjs` covers AC4 and AC5 paths with a stubbed JSONL fixture; runs under `npm test`.                                                  |
| AC7 | A two-turn voice session reuses the same `sessionId` and benefits from KV-cache reuse (Turn 2 voice TTFT ≤ 1.5× Turn 1 voice TTFT on the same machine).        |

---

## Risks and open questions

| Risk                                                                                                                                                              | Likelihood | Mitigation                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| LiteRT-LM C++ Conversation API exposes the audio content part with a different shape than the Python binding (e.g., requires raw PCM array instead of a blob).    | Medium     | Probe with a minimal C++ test before wiring into the bridge; if the API differs, do the smallest possible decode (base64→bytes→span) inside the bridge rather than introducing a separate audio pipeline. |
| The shipped `.litertlm` model file does not include the audio executor (Gemma variants ship with different modality bundles).                                     | Medium     | `setup-check` already verifies model presence; add a startup log line in the bridge that prints whether each modality executor was loaded so misconfigured models surface immediately. |
| Mic-capture format from `@ricky0123/vad-web` (16 kHz mono PCM by default) may not match what LiteRT-LM C++ expects, even if Python tolerated it.                  | Low-Medium | Document the expected sample rate and encoding in `voice-audio-pipeline.md` once validated; if a mismatch is found, normalize in the renderer before send (not in the bridge). |
| Voice-turn latency regresses vs. Python sidecar despite KV-cache reuse.                                                                                            | Low        | Measure manually per AC3; if regression is > 25%, escalate to an open question and pause the migration default-flip until resolved.                  |

---

## Documentation impact (Gate 5 preview)

- `STATUS.md` — rows for `delfin_litert_bridge.cc`, `delfin_litert_bridge.test.mjs`, `native/litert-cpp-bridge/README.md`.
- `docs/README.md` — add this spec under `docs/features/`; flip status when complete.
- `AGENTS.md` §Documentation Map — add this spec.
- `AGENTS.md` §Validated Technical Decisions — add a row recording how audio is passed to the C++ bridge (mirrors the Python "Image blobs work" decision).
- `docs/SPEC.md` §WebSocket Message Protocol — no change (existing audio content part is reused).
- `docs/explanations/voice-audio-pipeline.md` — note the C++ bridge as an additional consumer of the audio content part.
- `native-windows-backend-research-spec.md` — flip the audio-input ❌ in §Current validation snapshot once AC1–AC7 pass.
- `litert-cpp-vision-spec.md` — remove "Audio blob support — not used in the primary lecture-slide workflow; deferred." from §Out of scope; reference this spec instead.
