# Voice & Audio Pipeline — How It Works

## The Big Picture

The voice pipeline closes the loop so the AI can **listen** (VAD), **speak** (TTS), and the user can **interrupt** it mid-sentence (barge-in). There are four stages:

```
[Mic] → VAD detects speech end
      → WAV blob + screenshot sent to sidecar
      → Gemma 4 processes audio + image natively
      → Model streams text tokens back to renderer
      → TTS converts text to speech, sentence by sentence
      → Renderer plays audio chunks via Web Audio API
```

Every layer is connected by the same WebSocket + IPC bus used for normal text prompts — audio is just another message type on top.

---

## Stage 1 — Capturing the User's Voice (VAD)

**What is VAD?** Voice Activity Detection. It listens to the microphone continuously and tells you when someone *starts* and *stops* speaking. The library used is [`@ricky0123/vad-web`](https://github.com/ricky0123/vad), which runs the **Silero** ONNX model entirely in the browser — no cloud needed.

### What happens on speech end

When the user stops speaking, the VAD fires `onSpeechEnd` with a raw `Float32Array` of audio samples at 16 kHz. The hook:

1. Converts the float samples → a proper **WAV file** (RIFF header + 16-bit mono PCM) encoded as a base64 string using `float32ToWavBase64()` in `src/renderer/utils/audioUtils.ts`
2. Takes a screenshot of the foreground window at the same moment
3. Calls `window.api.submitSessionPrompt({ text: VOICE_TURN_TEXT, audio: wavBase64 })` — the text field is always the fixed string `"Please respond to what the user just asked."` so the model knows it has audio to process

> **Why a fixed text string?** The `sessionHandlers.ts` IPC handler has an empty-text guard that rejects blank prompts. The fixed string satisfies that guard and also gives the model a clear instruction about its role when it receives an audio blob.

### SharedArrayBuffer requirement

Silero WASM needs `SharedArrayBuffer`, which browsers lock behind two security headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. In Electron, these are injected on every response via `session.defaultSession.webRequest.onHeadersReceived` in `src/main/index.ts`.

---

## Stage 2 — The Sidecar Processes Audio + Image

The sidecar receives a WebSocket message shaped like:

```json
{ "text": "Please respond to what the user just asked.", "image": "<base64 JPEG>", "audio": "<base64 WAV>" }
```

Inside `handle_turn` in `sidecar/server.py`, the content list sent to Gemma 4 is built as:

```
[audio blob] + [image blob] + [text instruction]
```

Gemma 4 is a **multimodal** model — it can process audio and images natively in the same forward pass, so no external speech-to-text step is needed. The model understands what the user said *and* sees their screen simultaneously.

Tokens stream back exactly like a normal text prompt: `{"type": "token", "text": "..."}` followed by `{"type": "done"}`.

---

## Stage 3 — TTS Converts the Response to Speech

After the final `done` token, the sidecar's TTS pipeline kicks in (when `TTS_ENABLED=true`).

```
full_text → split into sentences → for each sentence:
  TTSPipeline.generate(sentence) → int16 PCM samples
  base64-encode → send {"type": "audio_chunk", "audio": "<b64>"}
```

The message sequence over WebSocket looks like:

```
{"type": "audio_start"}
{"type": "audio_chunk", "audio": "..."}   ← sentence 1
{"type": "audio_chunk", "audio": "..."}   ← sentence 2
{"type": "audio_end"}
```

**Sentence-by-sentence streaming** means the first sentence starts playing before the last one is even synthesised — low perceived latency.

### TTS backends

| Backend | When used | Notes |
|---|---|---|
| `kokoro` | `TTS_BACKEND=kokoro` | kokoro-onnx, Linux/WSL2, best quality |
| `mlx` | `TTS_BACKEND=mlx` | macOS only, not yet implemented |
| `web-speech` | default or any other value | Browser's built-in `speechSynthesis`, zero setup |

When `TTS_BACKEND=web-speech`, the sidecar sends **no audio messages at all** — the renderer's `App.tsx` detects that no `audio_start` arrived within 500 ms of `done` and falls back to `speechSynthesis.speak(responseText)`.

---

## Stage 4 — The Renderer Plays Audio

These IPC events (forwarded from the sidecar by `sidecarBridge.ts`) drive playback:

| Event | What the renderer does |
|---|---|
| `sidecar:audio_start` | Creates an `AudioContext` (sample rate 24 kHz for kokoro), resets playback state |
| `sidecar:audio_chunk` | Decodes base64 → `Int16Array` → `Float32Array` → `AudioBuffer`; schedules it to play back-to-back using `streamNextTime` so there are no gaps between sentences |
| `sidecar:audio_end` | Queue drains naturally; clears `isAudioPlaying` flag when last buffer finishes |

The decode step (`decodeAudioChunk` in `audioUtils.ts`) converts the sidecar's raw int16 PCM into the float32 format that `AudioContext` expects:

```
base64 string → Uint8Array → Int16Array → Float32Array (÷ 32768) → AudioBuffer
```

---

## Barge-In Protection

"Barge-in" is when the user speaks while the AI is still talking. Without protection, the mic would pick up the AI's own voice and trigger a feedback loop.

Two guards are in place inside the `useVAD` hook:

1. **Threshold raise** — While `isAudioPlaying` is `true`, Silero's positive-speech threshold is raised from `0.50` → `0.92`. The AI's voice played through speakers is quieter and less consistent than direct microphone speech, so it scores below 0.92 and gets ignored.

2. **Grace period** — For 800 ms after `audio_start`, any `onSpeechStart` events are silently dropped. This covers the brief moment before the threshold raise takes effect.

When the user genuinely interrupts:
- `onSpeechStart` fires (threshold crossed)
- The renderer immediately stops the `AudioContext` (cutting off playback)
- `window.api.sidecarInterrupt()` is called → sends `{"type": "interrupt"}` over WebSocket → the sidecar's `interrupted` event is set → the inference loop and TTS loop both break on the next iteration

---

## How the Pieces Connect

```
[Renderer]                    [Electron Main]             [Sidecar]
useVAD (Silero WASM)
  onSpeechEnd →
    float32ToWavBase64()
    submitSessionPrompt() ──── SESSION_SUBMIT_PROMPT ────→ handle_turn()
                                captureForegroundWindow()    ↓ token stream
                          ←── sidecar:token ─────────────── {"type":"token"}
    appendAssistantText()                                    ↓ done
                          ←── sidecar:done ──────────────── {"type":"done"}
    finishAssistantResponse()                                ↓ TTS
                          ←── sidecar:audio_start ───────── {"type":"audio_start"}
                          ←── sidecar:audio_chunk ───────── {"type":"audio_chunk"}
    decodeAudioChunk()
    AudioContext.play()
    [user barges in]
    AudioContext.stop()
    sidecarInterrupt() ─────── sidecar:interrupt ─────────→ interrupted.set()
```
