# Electron IPC + WebSocket — The Full Message Journey

## The Problem to Solve

React runs in a sandboxed renderer process. The model runs in a Python process. They cannot talk to each other directly. Every prompt has to travel through three processes (renderer → Electron main → Python sidecar) and the response has to come back the same way.

---

## The Three Processes

```
[Renderer process]          [Main process]           [Python sidecar]
 React + Zustand             Node.js                  FastAPI + Gemma 4
      ↕ contextBridge IPC         ↕ WebSocket
```

The renderer is isolated for security — it has no direct access to the filesystem, OS APIs, or the network. The main process is the broker that owns both the WebSocket connection and the OS-level APIs.

---

## Step-by-Step: Submitting a Prompt

### 1. User types and submits (Renderer — `App.tsx`)

```
handleSubmitPrompt(text)
  → sessionStore.beginPromptSubmission(text)   // adds user message + empty assistant bubble
  → window.api.submitSessionPrompt({ text, presetId })
```

`beginPromptSubmission` immediately creates **two** messages in the store: the user's message (visible right away) and an empty assistant message with a freshly-generated UUID stored as `activeAssistantMessageId`. This placeholder fills in as tokens arrive.

### 2. Cross the context bridge (Preload — `src/preload/index.ts`)

`window.api` is not a real object — it's a thin bridge injected by the preload script via `contextBridge.exposeInMainWorld`. Calling `submitSessionPrompt(request)` translates directly to:

```
ipcRenderer.invoke('session:submit-prompt', request)
```

`invoke` is async (unlike `send`). It returns a `Promise` that resolves when the main process handler returns.

### 3. Main process handles the IPC call (`src/main/ipc/sessionHandlers.ts`)

```
ipcMain.handle('session:submit-prompt', async (_event, request) => {
  1. captureForegroundWindow()           → takes a screenshot right now
  2. mainWindow.webContents.send('frame:captured', frame)   → updates the preview
  3. sessionPersistence.recordUserPrompt(...)               → writes to disk
  4. sendToSidecar({ image, text, preset_id })              → fires over WebSocket
})
// handler returns → the Promise in the renderer resolves
```

The screenshot is taken at the moment of submission, not when the user clicked "Capture". This guarantees the image is always current.

### 4. WebSocket sends the message (`src/main/sidecar/wsClient.ts`)

```
socket.send(JSON.stringify({ image: "<base64 JPEG>", text: "...", preset_id: "lecture-slide" }))
```

The `socket` is a persistent `ws.WebSocket` instance opened at app startup. If it's not connected, `sendToSidecar` throws, which propagates back to the renderer as an error.

### 5. Sidecar receives and processes (`sidecar/server.py`)

The single `receiver()` coroutine puts the message on a queue. The main loop picks it up and calls `handle_turn()`:

```
image blob → resize_image_blob()
content = [{"type":"image","blob":...}, {"type":"text","text":"..."}]
conversation.send_message_async(content)  ← runs the model in a thread executor
```

Tokens come out of the model one at a time. Each one is sent immediately:

```python
await ws.send_json({"type": "token", "text": chunk})
```

When the stream ends:

```python
await ws.send_json({"type": "done"})
```

---

## Step-by-Step: The Response Coming Back

### 6. WebSocket receives tokens (`src/main/sidecar/wsClient.ts`)

The `socket.on('message', ...)` listener fires for every incoming frame. Each message is Zod-validated against `wsInboundMessageSchema` and passed to the registered `messageHandler`.

### 7. Sidecar bridge routes to the renderer (`src/main/ipc/sidecarBridge.ts`)

```typescript
switch (message.type) {
  case 'token':
    sessionPersistence.appendAssistantToken(message.text)   // write to disk
    mainWindow.webContents.send('sidecar:token', { text: message.text })
    break
  case 'done':
    sessionPersistence.finishAssistantResponse()
    mainWindow.webContents.send('sidecar:done')
    break
  case 'error':
    mainWindow.webContents.send('sidecar:error', { message: ... })
    break
}
```

`mainWindow.webContents.send(channel, payload)` is the main-to-renderer direction — it fires without waiting for an acknowledgement.

### 8. Preload delivers to the renderer (`src/preload/index.ts`)

```typescript
onSidecarToken: (cb) =>
  ipcRenderer.on('sidecar:token', (_event, data) => cb(data))
```

Each channel is registered once in a `useEffect` in `App.tsx`. The callback is invoked for every incoming event.

### 9. Zustand store updates (`src/renderer/stores/sessionStore.ts`)

```typescript
window.api.onSidecarToken((data) => {
  appendAssistantText(data.text)
})
```

`appendAssistantText` finds the message whose `id === activeAssistantMessageId` and appends to its `content` string. No new message is created — the existing empty placeholder grows.

### 10. React re-renders

Because the Zustand store mutated, every component subscribed to `messages` re-renders. The assistant bubble in the chat list shows the accumulated text so far. This cycle repeats for every token — typically dozens of times per second.

When `done` arrives, `finishAssistantResponse()` sets `isSubmitting: false` and clears `activeAssistantMessageId`. The assistant bubble is now final.

---

## Complete Flow Diagram

```
[Renderer]                  [Main process]              [Sidecar]
handleSubmitPrompt()
  beginPromptSubmission()   (adds placeholder bubble)
  window.api                
  .submitSessionPrompt() ── ipcRenderer.invoke ────────→ ipcMain.handle
                                                           captureForeground()
                                                           sendToSidecar() ────→ ws.send()
                                                                                  handle_turn()
                                                                                  ↓ tokens
                          ←─ webContents.send ──────────── sidecarBridge        ←─ ws.on('message')
  onSidecarToken fires
  appendAssistantText()
  [React re-renders]
                          ←─ webContents.send('done') ─── sidecarBridge        ←─ {"type":"done"}
  onSidecarDone fires
  finishAssistantResponse()
  [isSubmitting = false]
```

---

## Two Separate Async Channels

Notice that submitting a prompt and receiving the response use **different IPC mechanisms**:

| Direction | Mechanism | Why |
|---|---|---|
| Renderer → Main (submit) | `ipcRenderer.invoke` / `ipcMain.handle` | Request/response — renderer awaits confirmation that the message was sent |
| Main → Renderer (tokens) | `webContents.send` / `ipcRenderer.on` | Push events — main fires at any time without a pending request |

The `invoke` returns as soon as `sendToSidecar()` is called — **not** when the model finishes. Tokens flow back independently over the push channel while the `invoke` Promise has already resolved.
