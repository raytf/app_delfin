# React & Zustand State Flow

## What State Exists and Where

The renderer has two kinds of state:

| State | Held in | Persisted? |
|---|---|---|
| Conversation messages, submission status, session history, speech-listening preference, minimized-response anchor, session start time | `sessionStore` (Zustand) | ✅ localStorage (survives hot reload) |
| User name | `settingsStore` (Zustand) | ✅ localStorage (`screen-copilot-settings`) |
| Session mode, overlay mode, window variant | `useState` in `App.tsx` | ❌ initialised from main process on mount |
| Sidecar connection status, capture source label | `useState` in `App.tsx` | ❌ ephemeral |

> **Note**: `captureStore` is still a stub (`{}`). All capture-related data flows through `frame:captured` IPC into `App.tsx` local state rather than a dedicated store.

---

## sessionStore — The Main Store

`sessionStore` (`src/renderer/stores/sessionStore.ts`) manages the conversation. Its key fields:

```
messages[]                      — the full chat history (user + assistant bubbles)
isSubmitting                    — true while waiting for a response
errorMessage                    — set when something goes wrong
activeAssistantMessageId        — ID of the assistant bubble currently being filled
sessionHistory[]                — list of past sessions (shown on HomeScreen)
vadListeningEnabled             — persisted manual on/off switch for VAD listening
minimizedResponseMessageId      — id of the assistant message the minimized overlay is
                                  currently displaying (lets the response bubble persist
                                  across minimize/restore transitions)
sessionStartTime                — epoch ms when the current session started; drives the
                                  "Session time: MM:SS" chip in the expanded view
```

It uses `zustand/middleware persist` to write to `localStorage` under the key `'delfin-active-session'`. This means conversation state survives a hot-module-replacement reload during development.

## settingsStore — The User Name Store

`settingsStore` (`src/renderer/stores/settingsStore.ts`) persists a single field — `userName` — under the `localStorage` key `'screen-copilot-settings'`. The name is collected on first run by `HomeScreen` and used to personalise the greeting. There is no other user-facing setting today.

`App.tsx` reads `vadListeningEnabled` and synchronises it to the live `useVAD()` instance with `toggleMute()`, so the MicVAD runtime stays mounted while speech detection is paused/resumed from the UI.

---

## The Assistant Placeholder Pattern

When a prompt is submitted, `beginPromptSubmission({ messageId, prompt })` creates **both** messages at once before any response arrives. The caller (`App.tsx`) generates the user-message id with `crypto.randomUUID()` and passes it in so it can reattach the saved screenshot path when the IPC promise resolves:

```
messages before submit:   [user_msg_1, assistant_msg_1]
                              ↑              ↑
                    id: messageId   content: ""   ← empty placeholder
                                    id: "abc-123" ← stored as activeAssistantMessageId
```

Every incoming `sidecar:token` event calls `appendAssistantText(token)`, which finds the message by `activeAssistantMessageId` and concatenates to its `content`:

```typescript
messages.map((msg) =>
  msg.id === activeAssistantMessageId
    ? { ...msg, content: msg.content + text }
    : msg
)
```

The component renders all messages unconditionally — the assistant bubble is visible from the first token, growing character by character. When `sidecar:done` arrives, `finishAssistantResponse()` clears `activeAssistantMessageId` and sets `isSubmitting: false`. The bubble is now complete.

On error, `failAssistantResponse(message)` replaces the placeholder bubble's content with the error string, and sets `errorMessage` so the UI can style it differently.

---

## IPC Listeners — Where They Live

All IPC listeners are registered in a single `useEffect` in `App.tsx` that runs **once on mount**:

```typescript
useEffect(() => {
  window.api.onFrameCaptured((frame) => {
    setCaptureSourceLabel(frame.sourceLabel)     // local useState
  })

  window.api.onOverlayError((data) => { /* log IPC errors from overlay handlers */ })

  window.api.onSidecarToken((data) => {
    appendAssistantText(data.text)               // sessionStore action
  })

  window.api.onSidecarAudioStart((data) => { /* open AudioContext, buffer resume */ })
  window.api.onSidecarAudioChunk((data) => { /* decode base64 PCM → queue buffer */ })
  window.api.onSidecarAudioEnd((data) => { /* drain queue, schedule playback-complete */ })

  window.api.onSidecarDone(() => {
    finishAssistantResponse()                    // sessionStore action
  })

  window.api.onSidecarError((data) => {
    failAssistantResponse(data.message)          // sessionStore action
  })

  window.api.onSidecarStatus((status) => {
    setSidecarStatus(status)                     // local useState
  })

  return () => {
    // Cleanup on unmount — critical to prevent duplicate listeners on hot-reload.
    // One removeAllListeners() per channel registered above.
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR)
    window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS)
  }
}, [appendAssistantText, failAssistantResponse, finishAssistantResponse, /* ... */])
```

The cleanup matters: without it, every hot-reload would add another set of listeners, causing tokens to be appended multiple times per event. Every channel passed to `window.api.on*` must have a matching `removeAllListeners` in the cleanup.

---

## From IPC Event to Re-render

```
[Main process fires webContents.send('sidecar:token', { text: "Hello" })]
        ↓
[Preload: ipcRenderer.on('sidecar:token', cb) → cb({ text: "Hello" })]
        ↓
[App.tsx onSidecarToken callback → appendAssistantText("Hello")]
        ↓
[sessionStore mutates: finds message by activeAssistantMessageId, appends text]
        ↓
[Zustand notifies all subscribers of messages[]]
        ↓
[ExpandedSessionView re-renders → chat list shows updated bubble]
```

React only re-renders components that subscribe to the slice of store that changed. A component reading `isSubmitting` does not re-render when `messages` changes.

---

## How Components Subscribe to the Store

Components use the `useSessionStore` hook with a selector:

```typescript
// Only re-renders when messages[] changes
const messages = useSessionStore((state) => state.messages)

// Only re-renders when isSubmitting changes
const isSubmitting = useSessionStore((state) => state.isSubmitting)
```

`App.tsx` reads most of the store at the top level and passes props down. Child components that need store state can also call `useSessionStore` directly with their own selector.

---

## Local State vs. Store — Decision Rule

| Use `useState` in App.tsx | Use `sessionStore` |
|---|---|
| UI-only, not needed outside App | Shared across multiple components |
| Ephemeral (doesn't survive reload) | Needs to survive hot-reload |
| Comes from main process on mount | Driven by sidecar events over time |
| `sessionMode`, `overlayMode`, `sidecarStatus`, `captureSourceLabel` | `messages`, `isSubmitting`, `errorMessage`, `sessionHistory`, `vadListeningEnabled` |
