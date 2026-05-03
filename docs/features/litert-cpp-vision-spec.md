# LiteRT-LM C++ Bridge — Vision Support and KV-Cache Session Reuse

> Gate 3 — source implementation landed; awaiting runtime validation before Gate 4 review.
> Sub-feature of Track A in `native-windows-backend-research-spec.md`.
> Closes the vision blocker (S2, lecture-slide workflow) and adds session-level KV-cache for dramatic multi-turn latency improvement.

## Gate Resolution

| Field             | Value                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Gate 3 — source implementation landed (commit `570d2fa`); awaiting binary rebuild + runtime validation (S2 benchmark, KV-cache TTFT, manual lecture-slide round) before Gate 4 review                                                                                                                                                                       |
| **Created**       | 2026-05-02                                                                                                                                                                                                                                                                                                                                                  |
| **Approved**      | 2026-05-02                                                                                                                                                                                                                                                                                                                                                  |
| **Implemented**   | `native/litert-cpp-bridge/delfin_litert_bridge.cc` (`--vision_backend` flag, `JsonPreface`, `g_sessions` map, `AcquireConversation`/`ReleaseConversation`, `reset_session` handler, `SendMessageAsync` called with the singular new user turn); `scripts/litert-cpp-proxy.mjs` (per-connection `sessionId`, `buildUserMessage`, `bridge.resetSession` on close); source-contract tests in `native/litert-cpp-bridge/delfin_litert_bridge.test.mjs` |
| **Pending**       | Rebuild `bin/delfin_litert_bridge.exe` from post-`570d2fa` source; benchmark S2 run; KV-cache Turn 2+ TTFT measurement; manual lecture-slide round                                                                                                                                                                                                          |
| **Depends on**    | `native-windows-backend-research-spec.md` Track A (build ✅, text streaming ✅)                                                                                                                                                                                                                                                                             |
| **Blocks**        | Benchmark S2, Track A acceptance, full Delfin lecture-slide validation on native Windows                                                                                                                                                                                                                                                                    |

---

## Goal

Fix `delfin_litert_bridge.cc` so it correctly passes base64 image blobs into the LiteRT-LM C++ Conversation API (unblocking vision and benchmark S2), and simultaneously introduce bridge-side session state so the KV-cache is reused across turns (dropping Turn 2+ TTFT from ~5,300 ms to ~450 ms, matching the Python sidecar baseline). Both changes require the same architectural fix — calling `SendMessageAsync` with only the new user turn rather than the full history array — so they are delivered together.

---

## Background

The C++ bridge currently fails vision turns with `"Provided less images than expected in the prompt."` The root cause has two parts, both stemming from the same misuse of the Conversation API:

**Root cause 1 — wrong `SendMessageAsync` call shape.**
`Conversation::SendMessageAsync` expects a **single** `Message` (the current user turn). The current bridge passes the entire messages array (system + history + current user turn) directly to `SendMessageAsync`. For text-only turns this accidentally works because the C++ text extractor finds text parts regardless of nesting depth. For vision turns, `data_utils.cc` looks for `{"type":"image","blob":"..."}` parts in the top-level `content` array of the *current message*, but the image part is buried inside the wrong level of the messages array — so the base64 blob is never decoded, never reaches the vision encoder, and Gemma's prompt template counts image tokens that were never provided.

**Root cause 2 — vision backend not enabled.**
`EngineSettings::CreateDefault` is called with only the compute backend. For multimodal inference, the LiteRT-LM C++ API requires an additional `vision_backend` parameter. Without it, the vision preprocessor is not initialised and image parts are silently dropped.

**Fix strategy — KV-cache sessions, not per-request Preface reconstruction.**
The minimal correct fix for root cause 1 is to split the messages array: put the system message + history into a `JsonPreface` and send only the last user message to `SendMessageAsync`. This works but rebuilds the full KV-cache every turn (~5,300 ms TTFT on turn 2+). The better fix is to keep a long-lived `Conversation` per session in a `g_sessions` map. The `Conversation` accumulates history internally and preserves the KV-cache across turns, dropping Turn 2+ TTFT to ~450 ms. Both the vision fix and the KV-cache optimisation require the same change — `SendMessageAsync` receives only the new user turn — so they are implemented together.

**Proxy alignment required.**
`scripts/litert-cpp-proxy.mjs` currently maintains a `session.history` array and calls `buildConversation(history, request)` to reconstruct the full messages array for the bridge each turn. With bridge-side session state the proxy no longer needs to manage history. Instead it sends a `sessionId` (one UUID per WebSocket connection) plus the new user message only. `buildConversation` and `session.history` are removed from the proxy.

**Why `{"type":"image","blob":"..."}` works in the C++ API once called correctly.**
`data_utils.cc` in LiteRT-LM calls `absl::Base64Unescape` on the blob field, decodes it in-memory, and creates an `InMemoryFile`. No temp files are required. This matches Delfin's "Image blobs work" validated decision (AGENTS.md §Validated Technical Decisions).

---

## Scope

| File | Change |
|------|--------|
| `native/litert-cpp-bridge/delfin_litert_bridge.cc` | (1) Add `--vision_backend` flag; enable vision in `EngineSettings::CreateDefault`. (2) Replace per-request `Conversation` creation with `g_sessions` map (`session_id → unique_ptr<Conversation>`). (3) On `generate`: look up or create session; call `SendMessageAsync` with `request["message"]` (singular new user turn). (4) Add `reset_session` handler that erases the session from the map. |
| `native/litert-cpp-bridge/BUILD.bazel` | Confirm `JsonPreface` is transitively available; add a dep if not. |
| `native/litert-cpp-bridge/delfin_litert_bridge.test.mjs` | Add source-contract assertions: `vision_backend` flag; `g_sessions` referenced; `reset_session` handler; `request["message"]` (singular) used. |
| `scripts/litert-cpp-proxy.mjs` | (1) Generate `sessionId = randomUUID()` on each WebSocket connection. (2) Replace `buildConversation(history, message)` with `buildUserMessage(message)` + `sessionId` + `systemPrompt` fields. (3) Remove `session.history` array and `buildConversation`. (4) On `ws.on("close")`, send `reset_session` to bridge. (5) Optionally resize image blobs to ≤ 512 px wide before sending (see Risks). |

---

## Out of scope

- Changes to the Electron main process, renderer, IPC contract, or `wsClient.ts`.
- Changes to the Python sidecar — it is unaffected by the C++ bridge changes.
- Changes to `scripts/litert-cpp-presets.mjs` or any benchmark adapter — preset text strings are unchanged.
- Image resizing / downscaling inside the bridge binary — kept in the proxy (Node.js side) if needed; see Risks.
- TTS on the C++ path — out of scope for Track A per the research spec.
- Audio blob support — not used in the primary lecture-slide workflow; deferred.
- Tool-calling / `respond_to_user` — not sent by the proxy; deferred.
- Cross-platform (macOS / Linux) — all changes target the Windows native bridge path only.

---

## Interface contract

### JSONL protocol — updated

Two additions to the proxy → bridge message format. The bridge → proxy event frames (`token`, `done`, `error`) are unchanged. No renderer or IPC changes.

**`generate` — `sessionId` + `systemPrompt` added; `messages` array replaced by singular `message`:**

```jsonc
// Before
{
  "type": "generate",
  "requestId": "<uuid>",
  "messages": [
    { "role": "system", "content": "<system prompt>" },
    { "role": "user",   "content": "Turn 1 text" },
    { "role": "model",  "content": "Turn 1 reply" },
    { "role": "user",   "content": [
        { "type": "image", "blob": "<base64>" },
        { "type": "text",  "text": "Explain this slide" }
    ]}
  ]
}

// After
{
  "type": "generate",
  "requestId": "<uuid>",
  "sessionId": "<uuid>",              // NEW — KV-cache session key (one per WS connection)
  "systemPrompt": "You are Delfin…",  // NEW — used only on session creation; ignored on reuse
  "message": {                        // RENAMED: array → singular new user turn only
    "role": "user",
    "content": [
      { "type": "image", "blob": "<base64 JPEG>" },
      { "type": "text",  "text": "Explain this slide" }
    ]
  }
}
```

**`reset_session` — new command (bridge → frees the Conversation and its KV-cache):**

```jsonc
{ "type": "reset_session", "sessionId": "<uuid>" }
```

Sent by the proxy when the WebSocket connection closes. No response event is emitted by the bridge.

### Bridge — session map and `Generate()` shape

```cpp
// Module-level session state (replaces per-request Conversation creation).
std::mutex g_sessions_mutex;
std::unordered_map<std::string, std::unique_ptr<Conversation>> g_sessions;

absl::Status Generate(Engine& engine, const ordered_json& request) {
  const std::string request_id = request.value("requestId", "");
  const std::string session_id = request.value("sessionId", "");

  Conversation* conv = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_sessions_mutex);
    auto it = g_sessions.find(session_id);
    if (it == g_sessions.end()) {
      // First turn — create Conversation; put system prompt in Preface.
      const std::string system_prompt = request.value("systemPrompt", "");
      ordered_json preface_messages = ordered_json::array();
      if (!system_prompt.empty()) {
        preface_messages.push_back({{"role","system"},{"content",system_prompt}});
      }
      auto preface = litert::lm::JsonPreface{.messages = preface_messages};
      auto session_config = litert::lm::SessionConfig::CreateDefault();
      ASSIGN_OR_RETURN(auto config,
          ConversationConfig::Builder()
              .SetSessionConfig(session_config)
              .SetPreface(preface)
              .Build(engine));
      ASSIGN_OR_RETURN(auto new_conv, Conversation::Create(engine, config));
      conv = new_conv.get();
      g_sessions[session_id] = std::move(new_conv);  // store unique_ptr, not *ptr
    } else {
      conv = it->second.get();  // Reuse — KV-cache intact.
    }
    g_active[request_id] = conv;  // Register for interrupt (existing mechanism).
  }

  // Send only the new user turn; image blobs are decoded by data_utils.cc.
  absl::Status status = conv->SendMessageAsync(
      request["message"], std::move(callback), {.task_group_id = request_id});
  // … WaitUntilDone, EraseActive, done event unchanged …
}

void ResetSession(const ordered_json& request) {
  const std::string session_id = request.value("sessionId", "");
  std::lock_guard<std::mutex> lock(g_sessions_mutex);
  g_sessions.erase(session_id);
}
```

### Proxy — session management

```js
// On each new WebSocket connection:
const sessionId = randomUUID();
const session = { activeRequestId: null };  // history array removed

// On each user turn:
await bridge.generate({
  requestId,
  sessionId,
  systemPrompt: resolvePreset(message.preset_id),  // moved here from buildConversation
  message: buildUserMessage(message),               // single turn; no history array
}, handlers);

// On connection close:
bridge.resetSession(sessionId);
```

`buildConversation` and `session.history` are removed. `resolvePreset` remains in use; it moves from inside `buildConversation` to the `generate` payload directly.

### Engine initialisation — vision backend

```cpp
// Before (text-only):
EngineSettings::CreateDefault(std::move(model_assets), backend)

// After (vision-enabled):
EngineSettings::CreateDefault(std::move(model_assets), backend,
    /*vision_backend=*/litert::lm::Backend::CPU)
```

A new `--vision_backend` CLI flag (default `cpu`) mirrors the existing `--backend` flag.

### Environment variables — none new

`LITERT_CPP_BIN`, `LITERT_CPP_MODEL`, `SIDECAR_PORT` are unchanged. `--vision_backend` is a bridge binary flag only; the CPU default is correct for all demo hardware.

---

## Acceptance criteria

| Criterion | Threshold |
|-----------|-----------|
| **Vision round-trip** | A `wscat` turn containing a screenshot base64 (or `assets/test-slide.png`) returns a coherent text response with no `"Provided less images than expected"` error. |
| **Benchmark S2** | `node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios s2` completes without error and writes results to `results/`. |
| **Text regression** | S1 and S3 results within ±10 % of validated numbers (S1 TTFT `5433.9±83.6 ms`, throughput `20.4±0.9 tok/s`). |
| **KV-cache turn 2+ latency** | In a 3-turn `wscat` session, Turn 2 TTFT ≤ 1,000 ms (target ~450 ms, matching the Python LiteRT-LM WSL2 baseline). |
| **Lecture-slide workflow** | `npm run dev:litert-cpp` — capture a slide, receive a streaming explanation equivalent to the Python sidecar. |
| **Cancellation** | `{"type":"interrupt","requestId":"<id>"}` mid-stream stops generation; no further `token` events for that request. |
| **Session reset** | After `ws.close()`, the bridge releases the session; a fresh connection starts a new session with no state bleed. |
| **Stability** | 10 consecutive vision turns in one session: no crash, hang, or RSS growth > 200 MB above baseline. |
| **Source contract tests** | `npm test` passes including updated assertions in `delfin_litert_bridge.test.mjs`. |

---

## Risks & open questions

| Risk | Mitigation |
|------|------------|
| **`JsonPreface` header / Bazel dep.** The `JsonPreface` struct may live in a header not yet included in the bridge. Confirm the include path (`runtime/conversation/io_types.h` or a dedicated preface header) and whether `BUILD.bazel` needs an extra dep before implementing. | Check the upstream `conversation.h` include chain; add the dep in `BUILD.bazel` if needed. |
| **`g_sessions` map memory growth.** Each live `Conversation` holds a KV-cache (~200–600 MB for Gemma 4 E2B). If a WebSocket connection closes without triggering `reset_session` (e.g. crash, network drop), the entry leaks until the proxy process restarts. | Always send `reset_session` on `ws.on("close")`; add a proxy-side idle timeout that sends `reset_session` for connections silent > 10 min. |
| **Concurrent session writes.** Two concurrent WebSocket connections each call `Generate` simultaneously. Both attempt to insert into `g_sessions` under the same lock. | The `g_sessions_mutex` guard covers both the lookup and the insert atomically; verify no lock is dropped between them in the implementation. |
| **Image size / TTFT.** The Python sidecar caps images at 512 px wide; the C++ path receives the raw capture (~1920 px). The vision encoder may be slower or reject very large images. | If S2 TTFT exceeds 30 s or the engine errors on large inputs, add an image resize step in `litert-cpp-proxy.mjs` using the `sharp` npm package before building the blob. Confirm whether `sharp` is already in `package.json`; if not, seek explicit approval before installing. |
| **Unique_ptr move in session map.** The research snippet contains `g_sessions[session_id] = std::move(*new_conv)` which tries to move the `Conversation` value; the correct form is `std::move(new_conv)` (move the `unique_ptr`, not the dereferenced object). Apply the correct form in the implementation. | Code-reviewed before merge; covered by the source-contract test (checks `g_sessions` usage). |
| **Session ID absent from legacy test clients.** The benchmark adapter (`scripts/benchmark/backends/litert_cpp.py`) sends the old `messages` array format. It will break when the bridge expects `message` (singular) + `sessionId`. | Update the benchmark adapter to send the new format as part of this implementation. |
