# Session & Overlay State Machine

## Three Variables, One UI

The entire visible state of the app is determined by three variables that live in two places simultaneously — mirrored between the main process and the renderer:

| Variable | Values | Who reads it |
|---|---|---|
| `sessionMode` | `'home'` \| `'active'` | Renderer (which component to render) |
| `overlayMode` | `'expanded'` \| `'minimized'` | Main process (window size/position) + Renderer |
| `minimizedVariant` | `'compact'` \| `'prompt-input'` \| `'prompt-response'` | Main process (window size) + Renderer |

The main process holds the authoritative copy. The renderer initialises from it via `window.api.getOverlayState()` on mount, then keeps its own local copy in sync.

---

## Valid State Combinations

| sessionMode | overlayMode | minimizedVariant | Component rendered | Window |
|---|---|---|---|---|
| `home` | `expanded` | `compact` | `HomeScreen` | 1100×760, centred, with frame |
| `active` | `expanded` | `compact` | `ExpandedSessionView` | 1100×760, centred, with frame |
| `active` | `minimized` | `compact` | `MinimizedSessionBar` | 320×88, bottom-right, no frame, always-on-top |
| `active` | `minimized` | `prompt-input` | `MinimizedSessionBar` | 420×120, bottom-right, no frame, always-on-top |
| `active` | `minimized` | `prompt-response` | `MinimizedSessionBar` | 420×420, bottom-right, no frame, always-on-top |

> **home + minimized** is invalid — you can't be on the home screen and minimized at the same time. Session start always restores a specific window shape.

---

## The Window Rebuild Trick

Switching between `expanded` and `minimized` doesn't resize the window — it **destroys and recreates it**. This is because `expanded` has a frame, is resizable, and appears in the taskbar; `minimized` is transparent, frameless, always-on-top, and skips the taskbar. These properties cannot all be changed on a live `BrowserWindow`.

```
switchOverlayMode('minimized'):
  1. createWindow('minimized')   → new BrowserWindow with minimized config
  2. previousWindow.destroy()    → old window gone
  3. nextWindow.focus()
```

The new window loads the same React app. On mount, `App.tsx` calls `getOverlayState()` and the renderer picks up where it left off.

---

## State Transitions

### Start Session
**Trigger**: User clicks "Start Session" on `HomeScreen`

```
handleStartSession() in App.tsx
  → window.api.startSession()
  → [IPC] sessionHandlers.ts: switchOverlayMode('minimized')
  → [Window destroyed + recreated as 320×88 compact pill]
  → setSessionMode('active'), setOverlayMode('minimized'), setMinimizedVariant('compact')
  → sessionStore.clearConversation()
```

### Stop Session
**Trigger**: User clicks "Stop" / "End Session"

```
handleStopSession() in App.tsx
  → window.api.stopSession()
  → [IPC] sessionHandlers.ts: switchOverlayMode('expanded')
  → [Window destroyed + recreated as 1100×760 centred window]
  → setSessionMode('home'), setOverlayMode('expanded')
  → sessionStore.clearConversation()
```

### Expand (minimized → expanded)
**Trigger**: User clicks the expand button in `MinimizedSessionBar`

```
handleRestoreOverlay() in App.tsx
  → window.api.restoreOverlay()
  → [IPC] overlayHandlers.ts: switchOverlayMode('expanded')
  → [Window recreated as 1100×760]
  → setOverlayMode('expanded')
```

### Minimize (expanded → minimized)
**Trigger**: User clicks the minimize button in `ExpandedSessionView`

```
handleMinimizeOverlay() in App.tsx
  → window.api.minimizeOverlay()
  → [IPC] overlayHandlers.ts: setMinimizedVariant('compact'), switchOverlayMode('minimized')
  → [Window recreated as 320×88 compact]
  → setOverlayMode('minimized'), setMinimizedVariant('compact')
```

### Minimized Variant Changes
**Trigger**: User interaction within `MinimizedSessionBar`

```
handleSetMinimizedVariant(variant) in App.tsx
  → window.api.setMinimizedOverlayVariant(variant)
  → [IPC] overlayHandlers.ts: setMinimizedVariant(variant), switchOverlayMode('minimized')
  → [Window resizes: stays minimized but changes dimensions]
  → setOverlayMode('minimized'), setMinimizedVariant(variant)
```

> Here the mode stays `minimized` so `switchOverlayMode` only calls `setOverlayMode()` on the existing window (resize via `setBounds`) rather than destroying and recreating it.

---

## Auto-Advance of minimizedVariant

There's a `useEffect` in `App.tsx` that automatically advances `minimizedVariant` based on session state — without the user clicking anything:

```
watches: [errorMessage, isMinimizedPromptComposing, isSubmitting, latestResponseText]

if (sessionMode === 'active' && overlayMode === 'minimized' && variant !== 'compact'):
  hasContent = errorMessage !== null || latestResponseText?.length > 0
  isComposing = isMinimizedPromptComposing (user has opened the input)

  nextVariant = (hasContent && !isComposing) ? 'prompt-response' : 'prompt-input'
```

So when the model finishes streaming and there's a response, the pill automatically grows from `prompt-input` (120px tall) to `prompt-response` (420px tall) without any explicit user action.

Voice turns add one extra rule in `App.tsx`: if the overlay is currently `compact` and a voice turn is actually submitted, the renderer immediately promotes the minimized window to `prompt-response` before the sidecar request is sent. That makes the loading state and streamed tokens visible during hands-free use instead of leaving the response hidden inside the compact pill.

---

## Where Each Variable Lives

```
[Main process — index.ts]           [Renderer — App.tsx]
  let overlayMode                     const [overlayMode, setOverlayMode]
  let minimizedVariant                const [minimizedVariant, setMinimizedVariant]
  let sessionMode                     const [sessionMode, setSessionMode]

  getOverlayState() → { overlayMode, minimizedVariant, sessionMode }
                     ←── window.api.getOverlayState() on mount
```

Every IPC call that changes overlay state does two things:
1. Updates the main process variables (the truth)
2. The renderer updates its own mirrors via the callback return / local setState

They stay in sync because every transition goes through an IPC call that updates both sides atomically.
