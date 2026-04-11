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

### What is Silero VAD?

Silero VAD is a small (~2 MB) neural network trained to answer one binary question per audio frame: *"Is this speech or silence?"* It is **not** speech recognition — it never transcribes words. Its only output is a probability score between 0.0 and 1.0 indicating how likely the current audio frame contains human speech. That narrow scope is what makes it fast enough to run in real-time on every frame while the user is talking.

The model is distributed as an ONNX file (`silero_vad_v5.onnx`). ONNX (Open Neural Network Exchange) is a portable format that can be executed by any compatible runtime — including **ONNX Runtime Web**, which runs in the browser via WebAssembly.

### What is WebAssembly (WASM) and why does Silero need it?

**WebAssembly (WASM)** is a binary instruction format that browsers (and Electron's Chromium runtime) can execute at near-native CPU speed. It lets code originally written in C++, Rust, or similar languages run inside the browser's sandbox — something JavaScript alone cannot do efficiently for compute-heavy tasks.

Running a neural network in real-time means doing matrix multiplications on every ~96 ms audio frame. JavaScript is too slow for this. The solution is **ONNX Runtime Web** (`onnxruntime-web`), which is compiled to WASM and therefore can do those calculations at native speed. The project copies the required WASM binaries into the renderer build output via Vite's static-copy plugin:

```
ort-wasm-simd-threaded.wasm      ← the WASM binary (SIMD + threaded, for performance)
ort-wasm-simd-threaded.mjs       ← JS glue that loads and initialises the WASM binary
ort-wasm-simd-threaded.asyncify.wasm  ← async variant used for certain ORT operations
ort-wasm-simd-threaded.asyncify.mjs   ← JS glue for the asyncify variant
```

`simd-threaded` indicates two performance features are active:
- **SIMD** — vectorised CPU instructions that process multiple values in one operation (critical for matrix math)
- **Threaded** — WASM workers run in parallel threads rather than blocking the main thread

### Why WASM threading needs SharedArrayBuffer

WASM threads work by spawning Web Workers that **share a region of memory** rather than copying data between them. The browser API for shared memory is `SharedArrayBuffer`. Without it, every audio frame would have to be copied across the worker boundary — far too slow for real-time operation.

**The security constraint:** `SharedArrayBuffer` was disabled by default in Chromium after the Spectre/Meltdown CPU vulnerabilities (2018). Shared memory combined with high-resolution timers creates a potential side-channel that lets malicious pages read memory they shouldn't. Chromium only re-enables it when the page is **cross-origin isolated**, which is proved by two HTTP response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

In Electron, there is no real HTTP server for production builds (files load via `file://`), so `src/main/index.ts` injects these headers on every response using Electron's request interception API. As a belt-and-suspenders measure it also forces the feature flag directly via a Chromium command-line switch:

```typescript
app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
// ...
headers["Cross-Origin-Opener-Policy"] = ["same-origin"];
headers["Cross-Origin-Embedder-Policy"] = ["credentialless"];
```

In development mode, the Vite dev server sets the same headers itself (via `renderer.server.headers` in `electron.vite.config.ts`) because Electron's `webRequest` fires after the initial document is already parsed.

### How `@ricky0123/vad-web` works internally

`vad-web` is the library that connects the microphone, the WASM runtime, and the Silero model. It has three internal layers:

**Layer 1 — AudioWorklet (runs on the audio thread)**

The browser's `AudioContext` runs a dedicated low-latency audio processing thread separate from the main JS thread. `vad-web` installs `vad.worklet.bundle.min.js` as an `AudioWorkletProcessor` on this thread. Its job is to:
- Receive raw PCM frames from the microphone at 16 kHz
- Buffer them into fixed-size chunks (the size Silero expects, roughly every 96 ms)
- Post each chunk to the main thread or a dedicated Worker

**Layer 2 — ONNX Runtime inference (runs in a Worker via WASM)**

Each buffered audio chunk is fed into the Silero ONNX model through `onnxruntime-web`. The model processes the chunk and returns a single float: the probability that this frame contains speech. This runs in a background Worker thread so it never blocks the UI.

**Layer 3 — State machine (inside `vad-web`)**

`vad-web` accumulates the per-frame scores and applies a **hysteresis state machine** using two configurable thresholds:

| Threshold | Value (normal) | Value (barge-in) | Meaning |
|---|---|---|---|
| `positiveSpeechThreshold` | 0.50 | 0.92 | Score above this counts as a "speech" frame |
| `negativeSpeechThreshold` | 0.35 | 0.77 | Score below this counts as a "silence" frame |

The gap between the two thresholds prevents rapid flickering between states when the score hovers near the boundary. The state machine transitions work like this:

```
SILENCE → SPEECH:  enough consecutive frames score above positiveSpeechThreshold
SPEECH → SILENCE:  enough consecutive frames score below negativeSpeechThreshold
                   → fires onSpeechEnd(Float32Array) with all accumulated PCM samples
```

`minSpeechMs: 250` discards segments shorter than 250 ms (prevents clicks and taps from triggering), and `preSpeechPadMs: 300` prepends 300 ms of audio before the detected speech start so the first syllable is never clipped.

### Why the model must run locally

There are three alternatives and why each was rejected:

| Alternative | Problem |
|---|---|
| Cloud VAD API | Adds round-trip latency, requires internet, violates the project's privacy-first constraint — audio leaves the machine |
| Browser's built-in `SpeechRecognition` | Chrome's implementation sends audio to Google's servers — unacceptable for a local-first app |
| Simple amplitude threshold | Cannot distinguish speech from background noise (fans, music, ambient sound) reliably; too many false positives and false negatives |

Silero running locally via WASM is the only option that is simultaneously **private** (no data leaves the machine), **accurate** (a trained neural network, not a volume gate), and **fast enough** (SIMD-threaded WASM executes in real-time on consumer hardware).

### What happens on speech end

When the VAD fires `onSpeechEnd`, the `useVAD` hook in `src/renderer/hooks/useVAD.ts` receives a raw `Float32Array` of all accumulated audio samples at 16 kHz. The hook:

1. Converts the float samples → a proper **WAV file** (RIFF header + 16-bit mono PCM) encoded as a base64 string using `float32ToWavBase64()` in `src/renderer/utils/audioUtils.ts`
2. Takes a screenshot of the foreground window at the same moment
3. Calls `window.api.submitSessionPrompt({ text: VOICE_TURN_TEXT, audio: wavBase64 })` — the text field is always the fixed string `"Please respond to what the user just asked."` so the model knows it has audio to process

> **Why a fixed text string?** The `sessionHandlers.ts` IPC handler has an empty-text guard that rejects blank prompts. The fixed string satisfies that guard and also gives the model a clear instruction about its role when it receives an audio blob.

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
