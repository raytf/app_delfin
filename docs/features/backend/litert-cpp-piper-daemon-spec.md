# LiteRT-LM C++ Proxy — Long-Lived Piper Daemon

> Gate 1 — awaiting approval. Sub-spec under `litert-cpp-primary-backend-migration-spec.md` (M3 follow-up). Eliminates per-turn Piper cold-start to reduce time-to-first-audio.

## Gate Resolution

| Field          | Value                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Status**     | Gate 1 — awaiting approval                                                                                       |
| **Created**    | 2026-05-06                                                                                                       |
| **Depends on** | `litert-cpp-proxy-piper-tts-spec.md` (✅ archived) — establishes the existing per-turn Piper subprocess + `audio_start` / `audio_chunk` / `audio_end` contract |
| **Parent**     | `litert-cpp-primary-backend-migration-spec.md` (M3 — TTS off-Python) — consolidate into §Completed sub-specs once ✅ |

---

## Goal

Keep a single Piper subprocess alive for the lifetime of `scripts/litert-cpp-proxy.mjs` and reuse it across turns, so the Python + onnxruntime + voice-model load (currently ~1–3 s) is paid once at proxy startup instead of once per response. Time-to-first `audio_chunk` after the first sentence boundary becomes bounded by Piper's actual synthesis time (typically 100–300 ms) rather than synthesis + cold-start.

## Background

Today `createPiperTtsBackend` in `scripts/litert-cpp-proxy.mjs` calls `spawn(piper.exe, ['--model', …, '--output-raw'])` inside `startStream()`, which is invoked on the first non-empty token of each turn. The spawned process imports Python, loads onnxruntime, loads the voice ONNX, and then begins processing stdin lines. After the turn finishes (`finish()` calls `child.stdin.end()`), Piper exits. The next turn pays the same cost again.

User-observed symptom: a multi-second gap between `token` events (text shows up immediately) and the first `audio_chunk` (TTS playback). On warm runs the gap is dominated by Piper cold-start, not by sentence-boundary buffering.

---

## Scope

| File | Change |
| --- | --- |
| `scripts/litert-cpp-proxy.mjs` | Replace `createPiperTtsBackend` with a daemon-style implementation: one long-lived child created during `createTtsBackend()` (proxy startup), reused across turns. Add per-turn framing using a stdout quiescence timer (`PIPER_DAEMON_QUIESCENCE_MS`, default 120 ms) to detect end-of-utterance. Serialise turns via an internal `Promise` queue so concurrent calls (in practice rare — bridge already serialises) cannot interleave PCM. Add automatic respawn on unexpected child exit, with a single retry per turn before falling back to no-op TTS. |
| `scripts/litert-cpp-proxy.test.mjs` | Add tests: (a) Piper spawns once and survives across two sequential turns; (b) per-turn `audio_start` / `audio_chunk+` / `audio_end` ordering preserved; (c) quiescence timer fires `audio_end` once; (d) child exit between turns triggers respawn on the next turn; (e) interrupt during a turn cancels in-flight synthesis but does not kill the daemon; (f) backend stays usable after a single mid-turn Piper failure. Existing per-turn-spawn test flipped to assert daemon behaviour. |
| `.env.example` | Document `PIPER_DAEMON_QUIESCENCE_MS` (default 120). |
| `docs/SPEC.md` §Validated Technical Decisions and `AGENTS.md` §Validated Technical Decisions | Update the "LiteRT C++ proxy TTS" entry to note that Piper is now a long-lived daemon spawned at proxy startup rather than per turn. |

### Out of scope

- Replacing Piper with a different TTS engine (Kokoro, Coqui, etc.).
- Bundling a different voice or changing voice-management UI.
- Any change to the C++ bridge binary or its protocol.
- Lower the sentence-boundary threshold (option A from the discussion); pursued only if daemonising alone is insufficient, and in a separate spec.
- Multi-voice / per-session voice selection (single global voice retained).
- Native Piper CLI daemon mode (none exists upstream); we drive the existing one-shot CLI with framing on top.

---

## Interface contract

### Lifecycle

1. On `startLitertCppProxy()`, `createTtsBackend()` resolves Piper config via the existing `resolveLitertCppTtsConfig()` and, if `ready`, spawns Piper once with `--model`, `--config`, `--output-raw`. The daemon-startup duration is logged to stderr (`[piper] daemon ready in Xms`).
2. The proxy does not block on Piper startup; turns that arrive before Piper finishes loading are queued (Piper buffers stdin until it begins consuming).
3. On `closeProxy()` (existing teardown), the daemon's stdin is ended and the child is awaited for graceful exit; SIGKILL after 1 s.

### Per-turn framing (internal)

Public `start(text, handlers)` and `startStream(handlers)` return values keep their existing shape (`{ promise, enqueue?, finish?, cancel }`). Internally each call acquires the daemon's turn-mutex, then:

- writes the text segment(s) to the daemon's stdin,
- on first stdout byte after the write, fires `handlers.onStart({ sampleRate, sentenceCount: 0 })`,
- forwards each stdout chunk via `handlers.onChunk({ audio, index })`,
- starts a quiescence timer (`PIPER_DAEMON_QUIESCENCE_MS`, default 120 ms) that resets on every stdout byte; when it elapses without new bytes after `finish()` was called, fires `handlers.onEnd({ ttsTime })` and resolves `promise`.

### Failure / respawn

If the daemon child exits unexpectedly:
- the active turn (if any) rejects its `promise` with a descriptive error so the proxy emits `done` without `audio_*` (existing fallback path is unchanged),
- the daemon is respawned in the background; a single failure to respawn flips the backend to `noop` and surfaces via `tts_error` in `/health`.

### WebSocket contract

Unchanged. The renderer continues to receive `token* → audio_start → audio_chunk+ → audio_end → done` for successful turns, and falls back to Web Speech when audio is absent.

---

## Acceptance criteria

| ID | Condition |
| --- | --- |
| AC1 | `scripts/litert-cpp-proxy.test.mjs` proves Piper is spawned exactly once across two sequential turns (count `spawnProcess` invocations). |
| AC2 | The existing per-turn `audio_start` / `audio_chunk+` / `audio_end` test still passes against the daemon implementation. |
| AC3 | Quiescence timer test: after `finish()`, no further chunks arrive, and `audio_end` fires exactly once after `PIPER_DAEMON_QUIESCENCE_MS` of stdout silence. |
| AC4 | Mid-turn child-exit test: rejecting the in-flight `promise` does not crash the proxy; the next turn respawns Piper and produces audio. |
| AC5 | Interrupt test: `cancel()` mid-turn does not terminate the daemon; the next turn proceeds normally. |
| AC6 | Live measurement on Windows packaged build: time from first `token` to first `audio_chunk` on the **second** consecutive turn is at least 1 s lower than on `main` (recorded informally in PR description). |
| AC7 | `npm test` and `npx vitest run scripts/litert-cpp-proxy.test.mjs` pass. |
| AC8 | `/health` continues to report `tts_backend`, `tts_ready`, `tts_model`, `tts_error` correctly; error string is populated when respawn fails. |

---

## Risks and open questions

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Quiescence-based end-of-utterance is heuristic; under load Piper could produce a stall longer than `PIPER_DAEMON_QUIESCENCE_MS`, splitting one utterance into two `audio_end`s. | Medium | Default of 120 ms is conservative versus typical Piper inter-chunk gap (≪ 30 ms). Make threshold configurable. AC3 + a saturation test verify no false splits on long sentences. |
| Long-lived Piper child holds ~150–250 MB resident even when idle. | Medium | Already paid implicitly: same cost shows up during every turn today. Acceptable trade-off for latency. Document in `.env.example`. |
| Daemon dies silently (e.g. OS OOM) and the next turn takes the full cold-start anyway. | Low | Respawn logic + `/health` `tts_error` make the failure visible; renderer fallback already covers single-turn audio loss. |
| Race between `finish()` and a slow first stdout byte producing `audio_end` before `audio_start`. | Low | Internal state machine asserts ordering: `audio_end` is only emitted after `audio_start` has fired (otherwise the turn resolves with `emittedAudio: false` and no `audio_*` events). |
| Open question — should `--output-raw` be replaced with a JSON-input mode that includes explicit per-utterance markers? | n/a | Piper's upstream `--output-raw` does not currently emit per-utterance markers in stdout; the JSON-input mode adds metadata to stderr only. Quiescence remains the simplest reliable boundary. Revisit only if AC3 fails. |
