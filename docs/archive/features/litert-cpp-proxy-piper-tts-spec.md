# LiteRT-LM C++ Proxy — Piper Off-Python TTS

> 📦 Archived on 2026-05-03 after Gate 5.
> Consolidated into `docs/features/backend/native-windows-backend-research-spec.md` (§Completed sub-specs) and referenced from `docs/features/distribution/distribution-backend-migration-spec.md`.
> Historical record of the Piper-first off-Python TTS implementation for `scripts/litert-cpp-proxy.mjs`.

## Gate Resolution

| Field | Value |
| --- | --- |
| **Status** | ✅ Gate 5 complete — implemented, reviewed, documented, and archived |
| **Created** | 2026-05-03 |
| **Approved** | 2026-05-03 |
| **Implemented / validated** | 2026-05-03 |
| **Depends on** | `native-windows-backend-research-spec.md`, `distribution-backend-migration-spec.md`, existing `audio_start` / `audio_chunk` / `audio_end` renderer contract |
| **Blocked** | Off-Python TTS closure for the LiteRT C++ proxy path until implementation landed |

---

## Goal

Add an optional Piper-backed TTS mode to `scripts/litert-cpp-proxy.mjs` so LiteRT C++ turns can stream native audio to the renderer without using Python, while preserving the existing WebSocket protocol and Web Speech fallback behavior.

---

## Scope delivered

| File | Outcome |
| --- | --- |
| `scripts/litert-cpp-proxy.mjs` | Added Piper config resolution, health metadata, sentence-level streaming TTS, `audio_*` emission, and interrupt cleanup for active TTS processes. |
| `scripts/litert-cpp-proxy.test.mjs` | Added tests for health metadata, Piper audio ordering, sentence-level early audio, fallback/no-op behavior, and interrupt safety. |
| `.env.example` | Documented `LITERT_CPP_TTS_BACKEND`, `PIPER_BIN`, `PIPER_MODEL`, `PIPER_CONFIG`, and `PIPER_SAMPLE_RATE`. |
| `docs/SPEC.md` and related docs | Updated to describe the proxy TTS env vars and the now-implemented `audio_*` path on `npm run dev:litert-cpp`. |

### Out of scope (unchanged)

- Replacing the Python sidecar TTS path
- Native Kokoro / `kokoro-js` implementation
- Auto-downloading or packaging Piper binaries/models
- Bundling a production Piper voice before license review
- Any change to the LiteRT C++ bridge binary itself

---

## Interface contract delivered

### Env vars

```env
LITERT_CPP_TTS_BACKEND=none|piper
PIPER_BIN=./bin/piper/piper.exe
PIPER_MODEL=./models/piper/en_US-lessac-medium.onnx
PIPER_CONFIG=./models/piper/en_US-lessac-medium.onnx.json
PIPER_SAMPLE_RATE=22050
```

### WebSocket response contract

Message names stayed unchanged:

- `{ type: "audio_start", sample_rate, sentence_count }`
- `{ type: "audio_chunk", audio, index }`
- `{ type: "audio_end", tts_time }`
- `{ type: "done" }`

`audio` remains base64-encoded raw signed 16-bit PCM.

### Ordering contract

For successful Piper turns, the proxy now emits:

1. streamed `token` messages
2. `audio_start`
3. one or more `audio_chunk`
4. `audio_end`
5. final `done`

After the sentence-streaming follow-up, `audio_start` can arrive before bridge `done` as soon as the first completed sentence is available.

### Health contract

`GET /health` keeps the existing bridge fields and adds:

- `tts_backend: "none" | "piper"`
- `tts_ready: boolean`
- `tts_model?: string`
- `tts_error?: string`

### Failure contract

If inference succeeds but Piper is disabled, misconfigured, interrupted, or fails mid-synthesis:

- assistant text still streams normally
- the proxy still sends final `done`
- no crash occurs
- missing audio causes the renderer to fall back to Web Speech

---

## Acceptance criteria outcome

| ID | Result |
| --- | --- |
| AC1 | ✅ `/health` reports `tts_backend`, `tts_ready`, `tts_model`, and `tts_error` as appropriate. |
| AC2 | ✅ Successful LiteRT C++ turns emit `token* → audio_start → audio_chunk+ → audio_end → done`. |
| AC3 | ✅ Disabled or invalid Piper config produces no `audio_*` events and still completes with `done`. |
| AC4 | ✅ Interrupting or closing a session cancels the active Piper subprocess/run. |
| AC5 | ✅ `scripts/litert-cpp-proxy.test.mjs`, `npm test`, and live smoke validation passed. |

---

## Validation summary

- `npx vitest run scripts/litert-cpp-proxy.test.mjs` ✅
- `npm test` ✅
- Live smoke test against the real LiteRT C++ bridge + real Piper showed `audio_start` before final `done` and additional tokens continuing after audio began ✅
- Manual user confirmation: Piper is now working with earlier audio start on the streaming path ✅

---

## Follow-up kept outside this spec

- Package Piper binaries and voice assets for distribution (`distribution-packaging-spec.md`)
- Decide whether Windows packaged builds should ship a default voice or download one on first run
- Evaluate native Kokoro as a higher-quality follow-up once packaged proxy paths are stable
