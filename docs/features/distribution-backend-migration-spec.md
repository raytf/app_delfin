# Distribution — Backend Migration Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 — awaiting approval |
| **Created** | 2026-05-01 |
| **Depends on** | Inference benchmark results (`inference-benchmarking-spec.md`) reviewed and accepted |
| **Blocks** | `distribution-packaging-spec.md` (packaging requires a working cross-platform backend) |

## Goal

Replace the LiteRT-LM Python sidecar with a `llama-server` binary integration so that inference runs natively on Windows, macOS, and Linux without WSL2 or a Python virtual environment. Simultaneously investigate and decide on a cross-platform TTS backend to replace or complement the existing `kokoro-onnx` pipeline.

## Background

The current architecture runs inference through `litert-lm-api-nightly`, which has no Windows wheel. The Electron renderer communicates with a Python FastAPI WebSocket server. The migration replaces the inference engine while preserving the renderer-facing IPC contract so that no renderer code changes are needed.

```
Before:
  Electron Main ──WebSocket──▶ Python FastAPI (LiteRT-LM, kokoro-onnx, FastAPI)

After:
  Electron Main ──REST/SSE──▶ llama-server binary (inference)
  Electron Main ──WebSocket──▶ TTS sidecar binary (Piper or frozen kokoro-onnx)
  (or Electron Main handles TTS directly if a JS-native option is chosen)
```

The renderer-facing IPC interface (`sidecar:send`, `sidecar:chunk`, `sidecar:done`, etc.) does not change — the bridge layer in Electron main absorbs the protocol difference.

## Scope

### Track DM0 — llama-server integration

| File | Change |
|---|---|
| `src/main/sidecar/wsClient.ts` | Replace WebSocket sidecar client with llama-server REST/SSE client |
| `src/main/sidecar/healthCheck.ts` | Update health check to hit `GET /health` on llama-server instead of sidecar WebSocket |
| `src/main/ipc/sidecarBridge.ts` | Rewrite to translate IPC calls → llama-server `POST /v1/chat/completions` (streaming) |
| `src/shared/types.ts` | Add `LlamaBackendConfig` type; retain existing IPC types unchanged |
| `scripts/download-llama-server.mjs` | New: download platform-appropriate llama-server binary from GitHub releases to `~/.delfin/bin/` |
| `scripts/run-llama-server.mjs` | New: spawn llama-server with correct flags; handle port conflict and crash recovery |
| `.env.example` | Add `LLAMA_SERVER_PORT`, `LLAMA_MODEL_PATH`, `LLAMA_SERVER_BIN` env vars |

### Track DM1 — sidecar bridge rewrite

The `sidecarBridge.ts` translation layer must map the existing turn protocol to llama-server's API:

| Existing (LiteRT WebSocket) | llama-server equivalent |
|---|---|
| `turn_start` + `image_data` + `prompt` | `POST /v1/chat/completions` with messages array (text + base64 image) |
| `chunk` streaming events | SSE `data:` lines with `choices[0].delta.content` |
| `done` event | SSE `data: [DONE]` |
| `audio_start` / `audio_chunk` / `audio_end` | Handled by TTS sidecar after `done` is received |
| `interrupt` | HTTP `POST /slots/{id}/cancel` (llama-server slot API) |

### Track DM2 — TTS investigation and decision

Evaluate two candidates. Pick one and implement it.

#### Candidate A: Piper TTS (pre-built binary)

- **What**: Neural TTS by Rhasspy/Nabu Casa. Pre-built binaries for Windows x64, macOS arm64/x64, Linux x64. ONNX-based, real-time speed on CPU.
- **Integration**: Electron main spawns `piper` CLI as a child process: `echo "text" | piper --model en_US-lessac-medium.onnx --output-raw | ...`; pipe raw PCM audio back.
- **Voice quality**: Good for English; fewer voice options than Kokoro.
- **Size**: ~20 MB binary + ~60 MB voice model.
- **Pros**: No Python, no freezing, small, fast.
- **Cons**: Voice quality may differ from Kokoro; limited language/voice options.

#### Candidate B: Frozen kokoro-onnx sidecar (PyInstaller)

- **What**: Keep the existing `kokoro-onnx` TTS pipeline but freeze it into a standalone binary per platform using PyInstaller, separate from the inference sidecar.
- **Integration**: Electron main spawns the frozen `tts-sidecar` binary; it exposes a minimal HTTP endpoint (`POST /tts` → streamed audio chunks).
- **Voice quality**: Identical to current (Kokoro voices already in use).
- **Size**: ~200–300 MB frozen binary (onnxruntime + kokoro).
- **Pros**: No regression in voice quality or streaming behaviour.
- **Cons**: Requires PyInstaller build in CI per platform; Windows build must be done on Windows runner.

#### Decision criteria

| Criterion | Piper | Frozen kokoro |
|---|---|---|
| Voice quality match vs current | Investigate | Same |
| Cross-platform binary availability | Yes (pre-built) | Yes (PyInstaller build) |
| CI complexity | Low (download binary) | Medium (3-platform PyInstaller builds) |
| Installer size impact | Low (+80 MB downloaded) | Medium (+250 MB downloaded) |
| espeak-ng path issue | Not applicable | Must be resolved for Linux/Windows |

Run a manual A/B listen test on a representative TTS sample before deciding. Document the decision in a "DM2 Decision" section appended to this spec after review.

## Out of scope

- Changes to the renderer or Zustand stores
- Changes to the existing Python sidecar code (it remains for `npm run dev:full` in dev mode)
- VAD pipeline changes
- Electron packaging (handled in `distribution-packaging-spec.md`)
- GPU inference (handled in `distribution-packaging-spec.md` stretch goal)

## Interface contract

### Environment variables added

| Variable | Default | Purpose |
|---|---|---|
| `LLAMA_SERVER_BIN` | `~/.delfin/bin/llama-server[.exe]` | Path to the llama-server binary |
| `LLAMA_SERVER_PORT` | `8321` | Port llama-server listens on |
| `LLAMA_MODEL_PATH` | `~/.delfin/models/gemma-4-e2b-q4_k_m.gguf` | Path to the GGUF model file |
| `LLAMA_SERVER_EXTRA_ARGS` | `` | Pass-through flags (e.g. `--n-gpu-layers 35`) |
| `TTS_BIN` | `~/.delfin/bin/piper[.exe]` or `~/.delfin/bin/tts-sidecar[.exe]` | Path to TTS binary (set after DM2 decision) |
| `TTS_MODEL_PATH` | `~/.delfin/models/tts/` | Directory containing TTS model files |

### llama-server launch flags (baseline)

```
llama-server \
  --model $LLAMA_MODEL_PATH \
  --port $LLAMA_SERVER_PORT \
  --host 127.0.0.1 \
  --ctx-size 8192 \
  --n-predict 1024 \
  --threads <cpu_count> \
  --no-mmap                  # avoid mmap on Windows for reliability
```

### New IPC types (`src/shared/types.ts`)

```ts
export type LlamaBackendConfig = {
  binPath: string;
  modelPath: string;
  port: number;
  extraArgs: string[];
};
```

No new renderer-facing IPC channels are introduced. The existing `sidecar:*` channels are preserved.

## Acceptance criteria

- [ ] `npm run dev:llama` (new script) starts llama-server and the Electron app; a prompt completes end-to-end on native Windows
- [ ] `npm run dev:llama` works on macOS arm64 and Linux x64 as well
- [ ] The existing `npm run dev:full` (Python sidecar) still works unchanged for contributors on Linux/Mac
- [ ] Interrupt (`stop` button) cancels in-progress generation within 500 ms
- [ ] Vision prompt (screenshot attached) produces a valid response from llama-server
- [ ] TTS plays audio after a response (using whichever backend is chosen in DM2)
- [ ] DM2 decision (Piper vs frozen kokoro) is documented with voice quality notes

## Risks / open questions

1. **Gemma 4 vision via GGUF**: confirm that llama-server with `gemma-4-e2b-q4_k_m.gguf` processes inline base64 images correctly via the OpenAI vision API format (`image_url` with `data:image/...;base64,...`).
2. **Slot cancellation**: llama-server's slot cancel API (`/slots/{id}/cancel`) requires knowing the slot ID assigned to the current request. Verify this is exposed in the streaming response headers or via a separate `/slots` endpoint.
3. **espeak-ng for frozen kokoro on Windows**: if Candidate B is chosen, the `espeak-ng` binary must be bundled with the frozen sidecar. The current path patch in `sidecar/tts.py` must be replaced with a proper resource-relative path lookup.
4. **Context window for multi-turn**: the current LiteRT sidecar maintains in-session state automatically. llama-server is stateless; the Electron bridge must maintain conversation history in memory and send it in each request.
