# Phase 4 — End-to-End Integration

> **Goal**: Wire the Electron app to the real Python sidecar (replacing the mock). Verify the complete flow: capture screen → send to LiteRT-LM → receive structured response → display in UI. Handle error states gracefully. At the end of this phase, the core demo works: open a lecture slide, capture it, click "Summarize this slide", and see a structured answer.

**Depends on**: Phases 1 (sidecar), 2 (Electron shell), 3 (UI)

---

## 4.1 Connect to real sidecar

No code changes should be needed if Phases 1–3 followed the protocol correctly. The integration work is:

1. Start the real sidecar: `cd sidecar && uvicorn server:app --host 0.0.0.0 --port 8321`
2. Start the Electron app: `npm run dev`
3. The WebSocket client in main process should connect automatically

**If the connection fails**: check that `SIDECAR_WS_URL` in `.env` matches the sidecar's address. On WSL2, you may need to use the WSL IP instead of `localhost`.

## 4.2 Integration test flow

Walk through each scenario manually and fix any issues:

### Scenario 1: Basic text query (no image)
1. Don't capture a screenshot
2. Type "What is photosynthesis?" in the chat input
3. Press Enter
4. **Expected**: The message is sent without an `image` field. The sidecar processes it as text-only. A response streams back.

### Scenario 2: Image + text query
1. Open a lecture slide in another window (PDF viewer, Google Slides, PowerPoint)
2. Click "Capture" — screenshot appears in preview
3. Click "Summarize this slide" (QuickAction)
4. **Expected**: The message includes the base64 image. The sidecar returns a structured response with summary, answer, and key_points. The UI renders a StructuredCard.

### Scenario 3: Interrupt mid-stream
1. Capture a slide and ask a question
2. While the response is streaming, click "Stop"
3. **Expected**: Streaming stops. The partial response is displayed. `isStreaming` resets to false. The input becomes usable again.

### Scenario 4: Error recovery
1. Stop the sidecar while the app is running
2. **Expected**: StatusIndicator shows "Disconnected". WebSocket client retries every 2 seconds.
3. Restart the sidecar
4. **Expected**: StatusIndicator shows "Connected" again. Next query works normally.

### Scenario 5: Multi-turn conversation
1. Capture a slide and ask "Summarize this slide"
2. After the response, ask "Explain the first key point in more detail"
3. **Expected**: The sidecar uses conversation history. The second response builds on the first.

### Scenario 6: Preset switching
1. Set preset to "Lecture Slides", ask a question
2. Switch to "Generic Screen"
3. Capture a browser tab and ask "What am I looking at?"
4. **Expected**: The sidecar uses the generic-screen system prompt. Response style changes accordingly.

## 4.3 Error state handling

Ensure these error paths are handled gracefully (not crashing, not hanging):

### Sidecar not running
- On app launch, if the sidecar is unreachable, show "Disconnected" in StatusIndicator
- All send buttons remain functional but show an inline error when a message can't be delivered
- Do NOT show a blocking modal or alert

### Image too large
- If the captured image is very large (e.g., high-DPI 4K display), the base64 string could be several MB
- The sidecar's `resize_image_blob` handles this, but verify it works with large images
- The Electron capture should use `thumbnail.toJPEG(80)` (quality 80) to keep size reasonable

### Tool calling fails
- If the model returns free text instead of calling the tool, the sidecar falls back to streaming raw tokens
- The UI should display these tokens normally (no structured card, just text bubbles)
- This should NOT be treated as an error

### WebSocket message parsing fails
- If the sidecar sends malformed JSON, the main process should catch the parse error and log it
- Do not crash or disconnect

## 4.4 Status reporting

Enhance the health check flow:

1. On app startup (after WebSocket connects), the main process should call `GET /health` via HTTP
2. Parse the response to get `backend`, `model`, and `vision_tokens`
3. Send this to the renderer via `sidecar:status` IPC channel
4. The StatusIndicator displays: `Connected · E2B · CPU` (or GPU)

If the health check fails, just show `Connected` (the WebSocket works even if the HTTP health check doesn't).

## 4.5 Latency tracking

Add basic latency tracking:

1. In the main process, when `sidecar:send` is received from the renderer, record `Date.now()`
2. When the first `token` or `structured` message arrives from the sidecar, compute the delta
3. Include this in the `sidecar:done` message (or as a separate `sidecar:latency` event) so the UI can display it
4. Show in the StatusIndicator: `2.1s` for time-to-first-token

## 4.6 .env validation on startup

Add a startup check in `src/main/index.ts` that:

1. Reads `.env` using dotenv
2. Warns (console.warn) if `.env` doesn't exist (fall back to defaults)
3. Warns if `SIDECAR_WS_URL` is not set
4. Does NOT crash — the app should always start, even without a .env file

---

## ✅ Phase 4 — Verification Checklist

- [ ] Start the real sidecar (`uvicorn server:app --host 0.0.0.0 --port 8321`) — health endpoint returns `model_loaded: true`
- [ ] Start the Electron app (`npm run dev`) — StatusIndicator shows "Connected" with model name and backend
- [ ] Open a lecture slide in another window, click Capture — screenshot appears in preview
- [ ] Click "Summarize this slide" — structured response appears (summary card + key points + answer)
- [ ] Type a follow-up question — response uses conversation context from the previous turn
- [ ] Click Stop during streaming — response stops, UI returns to idle state
- [ ] Stop the sidecar — StatusIndicator changes to "Disconnected" within a few seconds
- [ ] Restart the sidecar — StatusIndicator returns to "Connected" automatically
- [ ] Send a question while sidecar is disconnected — error appears inline in chat (not a crash or modal)
- [ ] Switch from "Lecture Slides" to "Generic Screen" preset — QuickActions update, next response uses the generic prompt
- [ ] Capture a browser tab in "Generic Screen" mode — response describes the web page content
- [ ] Time-to-first-token is displayed in the StatusIndicator after a query completes
- [ ] No console errors related to malformed WebSocket messages
- [ ] The app starts cleanly even if `.env` is missing (uses defaults)
- [ ] On macOS: the app has Screen Recording permission (prompt appears on first capture)
