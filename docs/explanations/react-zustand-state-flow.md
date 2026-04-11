# React & Zustand State Flow

## What State Exists and Where

The renderer has two kinds of state:

| State | Held in | Persisted? |
|---|---|---|
| Conversation messages, submission status, session history, speech-listening preference | `sessionStore` (Zustand) | ✅ localStorage (survives hot reload) |
| Session mode, overlay mode, window variant | `useState` in `App.tsx` | ❌ initialised from main process on mount |
| Sidecar connection status, capture source label | `useState` in `App.tsx` | ❌ ephemeral |

> **Note**: `captureStore` and `settingsStore` are currently stubs (`{}`). All real state lives in either `sessionStore` or `App.tsx` local state.

---

## sessionStore — The Only Real Store

`sessionStore` (`src/renderer/stores/sessionStore.ts`) manages the conversation. Its key fields:

```
messages[]                 — the full chat history (user + assistant bubbles)
isSubmitting               — true while waiting for a response
errorMessage               — set when something goes wrong
activeAssistantMessageId   — ID of the assistant bubble currently being filled
sessionHistory[]           — list of past sessions (shown on HomeScreen)
vadListeningEnabled        — persisted manual on/off switch for VAD listening
```

It uses `zustand/middleware persist` to write to `localStorage` under the key `'delfin-active-session'`. This means conversation state survives a hot-module-replacement reload during development.

`App.tsx` reads `vadListeningEnabled` and synchronises it to the live `useVAD()` instance with `toggleMute()`, so the MicVAD runtime stays mounted while speech detection is paused/resumed from the UI.

---

## The Assistant Placeholder Pattern

When a prompt is submitted, `beginPromptSubmission(text)` creates **both** messages at once before any response arrives:

```
messages before submit:   [user_msg_1, assistant_msg_1]
                                              ↑
                                    content: ""   ← empty placeholder
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

  window.api.onSidecarToken((data) => {
    appendAssistantText(data.text)               // sessionStore action
  })

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
    // Cleanup on unmount — critical to prevent duplicate listeners on hot-reload
    window.api.removeAllListeners('sidecar:token')
    window.api.removeAllListeners('sidecar:done')
    window.api.removeAllListeners('sidecar:error')
    window.api.removeAllListeners('sidecar:status')
    window.api.removeAllListeners('frame:captured')
  }
}, [appendAssistantText, failAssistantResponse, finishAssistantResponse])
```

The cleanup matters: without it, every hot-reload would add another set of listeners, causing tokens to be appended multiple times per event.

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
