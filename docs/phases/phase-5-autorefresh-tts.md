# Phase 5 — Auto-Refresh + TTS

> **Goal**: Implement automatic slide change detection (auto-refresh with hash diffing and debounce) and text-to-speech audio playback. At the end of this phase, advancing a slide triggers automatic capture, and the AI reads its response aloud.

**Depends on**: Phase 4 (working end-to-end integration)

---

## 5.1 Auto-refresh with hash diffing

### src/main/capture/autoRefresh.ts

Implement the `AutoRefreshManager` class:

```typescript
export class AutoRefreshManager {
  private intervalId: NodeJS.Timeout | null = null;
  private lastHash: string = '';
  private debounceTimeout: NodeJS.Timeout | null = null;
  private frameCallback: ((frame: CaptureFrame) => void) | null = null;
  private overlayWindowId: number;
  private debounceMs: number = 2000;

  constructor(overlayWindowId: number) {
    this.overlayWindowId = overlayWindowId;
  }

  onNewFrame(callback: (frame: CaptureFrame) => void): void {
    this.frameCallback = callback;
  }

  start(intervalMs: number = 5000): void {
    this.stop();
    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
    this.intervalId = null;
  }

  private async tick(): Promise<void> {
    const frame = await captureForegroundWindow(this.overlayWindowId);

    // Rolling sample: hash chars at 0%, 25%, 50%, 75% of the base64 string.
    // Sampling only the head risks collision on slides that share the same
    // header/background template. A rolling sample is nearly as fast and
    // detects changes anywhere in the image.
    const b64 = frame.imageBase64;
    const len = b64.length;
    const sample =
      b64.slice(0, 2000) +
      b64.slice(Math.floor(len * 0.25), Math.floor(len * 0.25) + 2000) +
      b64.slice(Math.floor(len * 0.50), Math.floor(len * 0.50) + 2000) +
      b64.slice(Math.floor(len * 0.75), Math.floor(len * 0.75) + 2000);

    const hash = createHash('md5').update(sample).digest('hex');

    if (hash !== this.lastHash) {
      this.lastHash = hash;

      // Debounce: wait 2 seconds of stability before emitting
      if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
      this.debounceTimeout = setTimeout(() => {
        this.frameCallback?.(frame);
      }, this.debounceMs);
    }
  }
}
```

Key design decisions:
- **Polling interval**: 5 seconds by default (configurable via IPC)
- **Hash method**: MD5 of a rolling 4×2000-char sample at 0%, 25%, 50%, 75% of the base64 string. Sampling only the head risks collision on slides that share the same background template (e.g., a university slide deck). The rolling sample detects changes anywhere in the image with negligible extra cost (~8 KB read vs. a full 200 KB string).
- **Debounce**: After detecting a change, wait 2 seconds of stability before emitting the frame. This avoids capturing partial slide transitions (animations, scrolling). If another change happens during the debounce window, the timer resets.

### Wire into IPC

In `src/main/ipc/handlers.ts`, update the `capture:auto-refresh` handler:

```typescript
let autoRefreshManager: AutoRefreshManager | null = null;

ipcMain.on('capture:auto-refresh', (_e, opts: { enabled: boolean; intervalMs: number }) => {
  if (opts.enabled) {
    if (!autoRefreshManager) {
      autoRefreshManager = new AutoRefreshManager(mainWindow.id);
      autoRefreshManager.onNewFrame((frame) => {
        mainWindow.webContents.send('frame:captured', frame);
      });
    }
    autoRefreshManager.start(opts.intervalMs);
  } else {
    autoRefreshManager?.stop();
  }
});
```

### UI changes

In `CapturePreview.tsx`:
- The "Auto" button toggles auto-refresh via `window.electronAPI.setAutoRefresh({ enabled: true/false, intervalMs: 5000 })`
- When auto-refresh is enabled, show a pulsing indicator or "Auto" badge
- When a new frame arrives via auto-refresh, show "New slide detected" briefly

In `ChatPanel.tsx`:
- When a new frame arrives via auto-refresh, optionally auto-submit a "Summarize this slide" query (make this a toggleable behaviour, default: just update the preview, don't auto-submit)

## 5.2 TTS pipeline (sidecar)

### sidecar/tts.py

Implement the full `TTSPipeline` class:

```python
import os
import platform
import numpy as np

class TTSPipeline:
    def __init__(self):
        backend = os.environ.get("TTS_BACKEND", "web-speech")
        self.voice = os.environ.get("KOKORO_VOICE", "af_heart")
        self.speed = float(os.environ.get("KOKORO_SPEED", "1.1"))

        if backend == "kokoro" and is_apple_silicon():
            self._backend = MLXBackend()   # Apple GPU
        elif backend == "kokoro":
            self._backend = ONNXBackend()  # CPU, auto-download via HF
        else:
            self._backend = None
    
    def is_available(self) -> bool:
        return self._backend != "none"
    
    def generate(self, text: str) -> np.ndarray:
        if self._backend is None:
            return np.array([], dtype=np.int16)
        return self._backend.generate(text, voice=self.voice, speed=self.speed)
```

### Wire TTS into handle_turn

After the inference response is complete, if TTS is enabled and the pipeline is available:

```python
if tts_pipeline and tts_pipeline.is_available():
    response_text = tool_result.get("answer", "") if tool_result else full_text
    
    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', response_text)
    
    await ws.send_json({
        "type": "audio_start",
        "sample_rate": tts_pipeline.sample_rate,
        "sentence_count": len(sentences),
    })
    
    for index, sentence in enumerate(sentences):
        if interrupt.is_set():
            break
        if not sentence.strip():
            continue
        
        pcm = await loop.run_in_executor(None, tts_pipeline.generate, sentence)
        b64 = base64.b64encode(pcm.tobytes()).decode()
        await ws.send_json({"type": "audio_chunk", "audio": b64, "index": index})
    
    await ws.send_json({"type": "audio_end", "tts_time": elapsed})
    await ws.send_json({"type": "done"})
```

## 5.3 Audio playback (renderer)

### Web Audio API playback

In the renderer, handle audio chunks:

```typescript
// Audio context (create once)
let audioContext: AudioContext | null = null;
let audioQueue: AudioBuffer[] = [];
let isPlaying = false;

function initAudio() {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: sampleRateFromAudioStart });
  }
}

function decodeAudioChunk(base64Pcm: string, sampleRate: number): AudioBuffer {
  const bytes = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0));
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  
  const buffer = audioContext!.createBuffer(1, float32.length, sampleRate);
  buffer.getChannelData(0).set(float32);
  return buffer;
}

async function playQueue() {
  if (isPlaying || audioQueue.length === 0) return;
  isPlaying = true;
  
  while (audioQueue.length > 0) {
    const buffer = audioQueue.shift()!;
    const source = audioContext!.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext!.destination);
    
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }
  
  isPlaying = false;
}
```

Wire IPC listeners:
- `onSidecarAudioStart`: call `initAudio()`, clear queue
- `onSidecarAudioChunk`: decode chunk, add to queue, call `playQueue()`
- `onSidecarAudioEnd`: (queue drains naturally)

### Web Speech API fallback

If `TTS_BACKEND=web-speech` in .env (or the sidecar TTS is disabled), the renderer can use the browser's built-in `speechSynthesis` API:

```typescript
function speakText(text: string) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    speechSynthesis.speak(utterance);
  }
}
```

When `sidecar:done` arrives and no `audio_start` followed for that turn, trigger Web Speech on the final assistant text. This provides TTS on all platforms with zero server-side setup.

### UI: TTS indicator / waveform

In the renderer, show a reusable waveform component that:

- is visible in the approved expanded and minimized session views while speech input is toggled on
- uses existing design tokens for state colour:
  - `--success` (green) for user speech
  - `--primary` (blue) for AI speech
  - `--warning` (orange) for processing and idle states
- uses faster orange motion while processing and slower/subtler orange motion while idle
- tracks analyser-driven per-bar mic activity while listening is enabled, but only turns green once VAD classifies speech
- routes streamed TTS chunks through a shared Web Audio analysis chain so blue playback bars stay visually continuous across chunk boundaries
- keeps the compact minimized overlay large enough and simple enough that the waveform, status row, and actions do not clip
- keeps a persistent minimized voice header in prompt-input / prompt-response so the overlay does not fall back to a text-only view during processing or TTS
- automatically returns minimized voice turns to compact mode after assistant playback/response completion

---

## ✅ Phase 5 — Verification Checklist

- [ ] Enable auto-refresh: click "Auto" button — it shows as active/toggled
- [ ] Open a presentation and advance slides — within ~7 seconds (5s poll + 2s debounce), the new slide appears in CapturePreview
- [ ] Rapidly advance slides (click through 3 slides in 2 seconds) — only the final stable slide is captured (debounce works)
- [ ] The same slide content does not re-trigger capture (hash diffing works)
- [ ] Disable auto-refresh: click "Auto" again — polling stops
- [x] With `TTS_ENABLED=true` and `TTS_BACKEND=kokoro` on Linux/WSL2: after a response, audio plays from the sidecar
- [x] Audio plays sentence by sentence — first sentence starts before all sentences are generated
- [ ] Clicking Stop while audio is playing stops both the inference and audio playback
- [ ] With `TTS_BACKEND=web-speech`: after a structured response, the browser's speech synthesis reads the answer (no sidecar audio)
- [ ] With `TTS_ENABLED=false`: no audio plays at all
- [ ] The waveform appears in expanded and minimized session views while speech is enabled
- [ ] User speech drives the waveform green, AI speech drives it blue, and idle/processing show orange motion with different intensity
- [ ] In minimized voice turns, the waveform remains visible during processing and assistant playback instead of disappearing in response mode
- [ ] Audio playback does not block the UI (main thread stays responsive)
- [ ] Auto-refresh + TTS combined: advance a slide → auto-capture → auto-summarise (if enabled) → TTS reads the summary
