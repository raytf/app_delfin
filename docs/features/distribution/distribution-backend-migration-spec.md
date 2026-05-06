# Distribution — Backend Migration Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 — awaiting approval (**2026-05-06: DM0 proxy wiring extended to macOS arm64 + Linux x64 — see revision banner**) |
| **Created** | 2026-05-01 |
| **Revised** | 2026-05-02 (hybrid Path 2 — additive, not replacement) |
| **Revised** | 2026-05-02 (proxy approach — zero changes to Electron main IPC layer) |
| **Revised** | 2026-05-03 (llamafile superseded; DM0 replaced by LiteRT-LM C++ proxy wiring for Windows) |
| **Revised** | **2026-05-06 (DM0 proxy wiring extended to macOS arm64 and Linux x64; Python sidecar retained as developer fallback only — see revision banner below)** |
| **Depends on** | Inference benchmark results (`inference-benchmarking-spec.md`) reviewed and accepted |
| **Blocks** | `distribution-packaging-spec.md` (packaging requires a working cross-platform backend) |

---

## Revision — 2026-05-06

### What changed and why

The 2026-05-03 revision wired `scripts/litert-cpp-proxy.mjs` into the **packaged Windows** runtime only. The CI workflow `build-litert-cpp-bridge.yml` now produces validated native bridge binaries for **macOS arm64** and **Linux x64** as well. The unified C++ backend is now the packaged backend on all three OSes.

The PyInstaller frozen Python sidecar (DP3 in `distribution-packaging-spec.md`) is **removed from the distribution MVP scope**. The Python sidecar (`sidecar/`) remains in the repository and continues to function as a **developer fallback** via `npm run dev:sidecar` (or `npm run dev:full`) — it is not present in any packaged installer.

| Track | 2026-05-03 scope | 2026-05-06 scope |
|---|---|---|
| **DM0** | Wire `litert-cpp-proxy.mjs` into packaged **Windows** startup | **Wire `litert-cpp-proxy.mjs` into packaged Windows x64, macOS arm64, and Linux x64 startup** |
| **DM1** | `INFERENCE_BACKEND=litert-cpp` build-time value for Windows | **`INFERENCE_BACKEND=litert-cpp` for all three packaged builds** |
| **DM2** | `npm run dev:litert-cpp` already exists for Windows | **Unchanged** — dev mode uses Python sidecar on macOS/Linux; `dev:litert-cpp` on Windows |
| **DM3** | Piper selected for Windows packaged TTS | **Piper on all three packaged platforms** via `LITERT_CPP_TTS_BACKEND=piper` |

### Updated architecture (2026-05-06)

```
Renderer ──IPC──► Electron Main ──WebSocket──► litert-cpp-proxy.mjs     [all packaged builds]
                  (wsClient.ts                 port 8321
                   UNCHANGED)                      │
                                               JSONL stdio
                                                   │
                                               delfin_litert_bridge       (exe / binary)
                                               + libGemmaModelConstraintProvider (.dll / .dylib / .so)

               └──WebSocket──► Python FastAPI (LiteRT-LM)                [dev mode: macOS / Linux / WSL2]
                               port 8321
```

---

## Revision — 2026-05-03

### What changed and why

The llamafile integration path described in this spec (DM0 — llamafile WebSocket proxy; DM1 — env var selector; DM2 — dev-mode script; DM3 — TTS binary) is **superseded** by the LiteRT-LM C++ bridge, which has been validated on Windows for text, vision, audio input, and KV-cache reuse.

`scripts/litert-cpp-proxy.mjs` is **already implemented and validated**. It speaks the identical Delfin sidecar WebSocket protocol on port 8321, manages the bridge subprocess, forwards image/audio blobs, handles interrupts, and emits Piper sentence-level `audio_*` messages when `LITERT_CPP_TTS_BACKEND=piper`. No new proxy code is required; DM0 is reduced to wiring the existing proxy into the packaged Electron runtime startup flow.

| Track | 2026-05-02 scope | 2026-05-03 scope |
|---|---|---|
| **DM0** | New `scripts/llamafile-proxy.mjs` (~120 lines) | **Wire existing `scripts/litert-cpp-proxy.mjs` into packaged Windows startup via `INFERENCE_BACKEND=litert-cpp`** |
| **DM1** | `INFERENCE_BACKEND` env-var selector in `src/main/index.ts` | Same — switch value `llamafile` → `litert-cpp` |
| **DM2** | `npm run dev:llamafile` dev-mode script | `npm run dev:litert-cpp` (already exists) — no new script needed |
| **DM3** | Investigate Piper TTS vs frozen kokoro-onnx | **Piper** selected — `LITERT_CPP_TTS_BACKEND=piper`; `npm run voice:install` provisions voices |

The remaining implementation work for this spec is now: wiring `INFERENCE_BACKEND=litert-cpp` into the packaged Electron startup path and ensuring the bridge binary is resolved from `app.getPath('userData')` or the app resources directory in packaged mode.

The `llamafile` value for `INFERENCE_BACKEND` is removed from all runtime paths. The standalone benchmark harness (`scripts/benchmark/`) retains a llamafile adapter for comparison purposes only.

---

## Goal _(original, partially superseded — see 2026-05-03 revision above)_

~~Add a llamafile integration path so that **all packaged Windows users** — whether or not they have WSL2 — can run the full app without WSL2 or a Python virtual environment.~~ **Updated goal:** Wire `scripts/litert-cpp-proxy.mjs` into the packaged Electron runtime so that all Windows users get the LiteRT-LM C++ backend without WSL2 or a Python virtual environment. The LiteRT-LM path must continue to work unchanged for macOS, Linux, and Windows + WSL2 users **running from source**. **No changes to the Electron IPC layer or renderer are required.**

> **Packaging decision (updated 2026-05-03):** Packaged Windows builds use the LiteRT-LM C++ bridge (`delfin_litert_bridge.exe`) via `scripts/litert-cpp-proxy.mjs`. See `desktop-distribution-mvp-spec.md` §Revision 2026-05-03 for the full rationale.

---

## Architecture

### Current (LiteRT only)

```
Renderer ──IPC──► Electron Main ──WebSocket──► Python FastAPI (LiteRT-LM + kokoro-onnx)
                  (wsClient.ts)                port 8321
```

### After (hybrid proxy approach)

```
Renderer ──IPC──► Electron Main ──WebSocket──► Python FastAPI (LiteRT-LM)   [macOS/Linux/WSL2]
                  (wsClient.ts                 port 8321
                   UNCHANGED)
                               └──WebSocket──► llamafile-proxy.mjs           [Windows no WSL2]
                                               port 8321
                                                   │
                                               REST/SSE
                                                   │
                                               llamafile server
                                               port 8081
```

### Why the proxy approach

The previous revision of this spec proposed adding a REST/SSE client inside the Electron main process and a backend selector in `sidecarBridge.ts`. That approach works but requires changes to `wsClient.ts`, `sidecarBridge.ts`, `index.ts`, and shared types.

A better approach is to put a **lightweight Node.js WebSocket proxy** between the Electron main process and the llamafile REST server. The proxy speaks the **identical WebSocket protocol** as the Python sidecar, so `wsClient.ts`, `sidecarBridge.ts`, and every IPC channel remain completely unchanged. The only new code is the proxy itself and the wiring to spawn it.

The proxy is ~120 lines of Node.js and handles everything the Python sidecar does on the inference side:
- Incoming WebSocket message → `POST /v1/chat/completions` (REST/SSE)
- SSE token chunks → `{type: "token", text}` WebSocket frames
- `[DONE]` → `{type: "done"}` WebSocket frame
- Conversation history accumulated across turns (llamafile is stateless REST)
- System prompt injection from `preset_id` (TypeScript preset registry)
- `GET /health` HTTP endpoint so existing health check logic works unchanged
- `{type: "interrupt"}` → `AbortController` abort on the in-flight fetch

TTS: the LiteRT C++ reference proxy can now emit `audio_*` messages directly when `LITERT_CPP_TTS_BACKEND=piper` is enabled. Proxy paths that do not emit `audio_*` messages still fall back to Web Speech automatically.

---

## Scope

### Track DM0 — llamafile WebSocket proxy

**New file: `scripts/llamafile-proxy.mjs`** (~120 lines)

Starts two servers on startup:
1. **WebSocket server** on `SIDECAR_PORT` (default 8321) — accepts the existing sidecar protocol
2. **HTTP server** on the same port for `GET /health` — returns `{"status": "ok"}`

For each incoming WebSocket connection:
- Receives `{text, image, preset_id}` messages (same shape as sent by `wsClient.ts`)
- Resolves `preset_id` to a system prompt string from a local preset registry
- Maintains a `messages: {role, content}[]` array for the current session
- On each turn: appends user message, POSTs full history to `http://LLAMAFILE_HOST/v1/chat/completions` with `stream: true`
- Streams SSE chunks back as `{type: "token", text}` WebSocket frames
- On `[DONE]`: appends completed assistant response to history, sends `{type: "done"}`
- On `{type: "interrupt"}`: calls `AbortController.abort()` on the in-flight request
- On WebSocket close: clears conversation history (session ended)

Vision content format sent to llamafile:
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Summarise this slide." },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
  ]
}
```

**New file: `scripts/llamafile-presets.mjs`**

Exports a `resolvePreset(presetId)` function returning the system prompt string. Mirrors `sidecar/prompts/presets.py`. Imported by the proxy.

```js
export function resolvePreset(presetId) {
  return PRESETS[presetId] ?? PRESETS['generic-screen']
}
```

This is the only place preset strings are duplicated. If `sidecar/prompts/` changes, this file must be updated in the same PR.

### Track DM1 — run script updates

**Modify: `scripts/run-llamafile.mjs`**

Currently only spawns the llamafile binary. Update to also spawn the proxy:

```
npm run dev:llamafile
  → spawns llamafile binary (port 8081, or LLAMAFILE_PORT)
  → spawns llamafile-proxy.mjs (port 8321, or SIDECAR_PORT)
```

Both processes share stdout/stderr inheritance. SIGINT/SIGTERM forwarded to both.

The proxy reads `LLAMAFILE_PORT` to know where to find the llamafile server, and `SIDECAR_PORT` to know which port to bind its WebSocket server on.

### Track DM2 — Electron main spawning

**Modify: `src/main/index.ts`**

When `INFERENCE_BACKEND=llamafile`, spawn `scripts/run-llamafile.mjs` (via `node`) instead of the Python uvicorn sidecar. The `SIDECAR_WS_URL` env var already controls where `wsClient.ts` connects — no change needed there since the proxy listens on the same port.

The spawn logic mirrors the existing `dev:sidecar` pattern in `scripts/run-sidecar.mjs`.

`.env.example` gains `INFERENCE_BACKEND=litert` with a comment.

### Track DM3 — health check

**Modify: `src/main/sidecar/healthCheck.ts`** (currently a placeholder)

Implement polling of `GET http://localhost:{SIDECAR_PORT}/health`:
- Works for both backends — the Python sidecar and the proxy both expose this endpoint
- No backend-specific branching needed

### Track DM4 — Off-Python TTS for packaged proxy paths (partially validated, packaging deferred)

The LiteRT C++ reference proxy now has a working Piper-backed implementation that emits `audio_*` messages and preserves the existing renderer contract. Packaging/distribution work for proxy-path TTS is still deferred; proxy paths that do not yet ship a server-side TTS backend continue to rely on the renderer's Web Speech fallback.

Future candidates for full TTS support on the packaged proxy path:

| Candidate | Approach | Size | Quality |
|---|---|---|---|
| **Piper TTS** | Pre-built binary, pipe text → raw PCM | ~80 MB | Good English |
| **Native Kokoro track** | `kokoro-js` or native/C++ ONNX wrapper, emit `audio_*` without Python | ~80–250 MB depending on quantization/runtime | Best quality / closest to current sidecar |

Decision updated 2026-05-03: prototype **Piper first** for the off-Python path because it best matches Delfin's existing `audio_start` / `audio_chunk` / `audio_end` flow and has the lowest packaging risk. The reference implementation is now validated in `scripts/litert-cpp-proxy.mjs`; keep **native Kokoro** as the follow-up quality track once packaged proxy paths are stable.

---

## Out of scope

- Changes to `wsClient.ts`, `sidecarBridge.ts`, or any renderer code
- Changes to the existing Python sidecar
- VAD pipeline changes
- Electron packaging (handled in `distribution-packaging-spec.md`)
- GPU inference (handled in `distribution-packaging-spec.md` stretch goal)

---

## New files

| File | Purpose |
|---|---|
| `scripts/llamafile-proxy.mjs` | WebSocket server that speaks the sidecar protocol and proxies to llamafile REST |
| `scripts/llamafile-presets.mjs` | Preset registry for system prompt injection in the proxy |

## Modified files

| File | Change |
|---|---|
| `scripts/run-llamafile.mjs` | Also spawn `llamafile-proxy.mjs` alongside the llamafile binary |
| `src/main/index.ts` | When `INFERENCE_BACKEND=llamafile`, spawn `run-llamafile.mjs` instead of Python sidecar |
| `src/main/sidecar/healthCheck.ts` | Implement `GET /health` polling (works for both backends via proxy) |
| `.env.example` | Add `INFERENCE_BACKEND=litert` |

**Explicitly not modified:** `wsClient.ts`, `sidecarBridge.ts`, `src/shared/types.ts`, `src/shared/schemas.ts`, `src/preload/index.ts`, any renderer file.

---

## Interface contract

### New env vars

| Variable | Default | Purpose |
|---|---|---|
| `INFERENCE_BACKEND` | `litert` | `litert` or `llamafile` — selects which sidecar to spawn |

Existing env vars reused by the proxy:

| Variable | Used by proxy as |
|---|---|
| `SIDECAR_PORT` | Port the proxy WebSocket server binds to (default `8321`) |
| `LLAMAFILE_PORT` | Port where llamafile REST server is listening (default `8081`) |

### WebSocket protocol (proxy input — unchanged from current sidecar)

Inbound (Electron → proxy, same as `wsOutboundMessageSchema`):
```json
{ "text": "Explain this slide", "image": "<base64>", "preset_id": "lecture-slide" }
{ "type": "interrupt" }
```

Outbound (proxy → Electron, same as `wsInboundMessageSchema`):
```json
{ "type": "token", "text": "..." }
{ "type": "done" }
{ "type": "error", "message": "..." }
```

### Health endpoint (proxy output)

`GET http://localhost:8321/health` → `{"status": "ok"}`

---

## Acceptance criteria

- [ ] `INFERENCE_BACKEND=litert-cpp npm run dev:litert-cpp` on Windows connects to the proxy and completes a text prompt end-to-end
- [ ] `INFERENCE_BACKEND=litert-cpp` packaged app on macOS arm64 connects to the proxy and completes a text prompt end-to-end
- [ ] `INFERENCE_BACKEND=litert-cpp` packaged app on Linux x64 connects to the proxy and completes a text prompt end-to-end
- [ ] Vision prompt (screenshot attached) produces a valid multimodal response on all three platforms
- [ ] Multi-turn conversation: follow-up turns receive context from prior turns in the session
- [ ] `interrupt` cancels in-progress generation within 500 ms
- [ ] Piper TTS emits `audio_start` / `audio_chunk` / `audio_end` on all three platforms; Web Speech fallback fires if Piper is unavailable
- [ ] `npm run dev:sidecar` continues to work unchanged on macOS/Linux/WSL2 (Python sidecar dev fallback)
- [ ] Status indicator correctly reflects connected/disconnected for all paths
- [ ] `wsClient.ts`, `sidecarBridge.ts`, and all renderer files have zero diffs

---

## Risks / open questions

1. **Vision projector (mmproj)**: llamafile requires a separate `mmproj-*.gguf` file passed via `--mmproj` for image input. `scripts/setup-llamafile.mjs` already downloads it; `scripts/run-llamafile.mjs` already passes `--mmproj` if present. **Resolved** — confirmed working via S2 benchmark.
2. **AbortController and generation halt**: aborting the `fetch()` stops the proxy receiving tokens, but verify llamafile actually halts generation server-side (not just stops streaming). If not, slot cancellation via `DELETE /slots/{id}` may be needed.
3. **Context window overflow**: the proxy accumulates full history per session. Long sessions approach the 8192-token context limit. The proxy should trim oldest non-system turns when the estimated token count nears the limit.
4. **Preset sync**: `scripts/llamafile-presets.mjs` duplicates the Python preset strings. Changes to `sidecar/prompts/` must be reflected here. Enforce via a PR checklist note in `AGENTS.md`.
5. **ws package availability**: the proxy uses the `ws` npm package (already in `package.json` dependencies) — no new install needed.
