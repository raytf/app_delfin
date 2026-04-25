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
| `home` | `expanded` | `compact` | `HomeScreen` | 1100×760, centred, frameless, resizable |
| `active` | `expanded` | `compact` | `ExpandedSessionView` | 1100×760, centred, frameless, resizable |
| `active` | `minimized` | `compact` | `MinimizedSessionBar` | 380×64, bottom-right, frameless, always-on-top, transparent |
| `active` | `minimized` | `prompt-input` | `MinimizedSessionBar` | 460×115, bottom-right, frameless, always-on-top, transparent |
| `active` | `minimized` | `prompt-response` | `MinimizedSessionBar` | 460×360, bottom-right, frameless, always-on-top, transparent |

> **home + minimized** is invalid — you can't be on the home screen and minimized at the same time. Session start always restores a specific window shape.

The window is always created with `frame: false` and `transparent: true`. The visible differences between expanded and minimized modes come from toggling `alwaysOnTop`, `skipTaskbar`, `resizable`, `fullscreenable`, `hasShadow`, and the `backgroundColor` at runtime — not from recreating the window.

---

## Switching Modes Without a Rebuild

Switching between `expanded` and `minimized` (and between the three `minimized` variants) does **not** destroy the window. `setOverlayMode(window, mode, variant)` in `overlayWindow.ts` updates the live `BrowserWindow` in place:

```
setOverlayMode(window, mode, variant):
  window.setBounds(getWindowBounds(mode, variant), true)
  window.setAlwaysOnTop(mode === 'minimized')
  window.setSkipTaskbar(mode === 'minimized')
  window.setResizable(mode === 'expanded')
  window.setFullScreenable(mode === 'expanded')
  window.setHasShadow(mode === 'expanded')
  window.setBackgroundColor(mode === 'minimized' ? '#00000000' : '#f8fcfd')
```

`switchOverlayMode` in `src/main/index.ts` only creates a fresh `BrowserWindow` when the main window is `null` or destroyed — the normal path is an in-place resize. The renderer keeps running; `App.tsx` listens for `overlay:state` updates from the main process and updates its local mirrors without remounting.

---

## State Transitions

### Start Session
**Trigger**: User clicks "Start Session" on `HomeScreen`

```
handleStartSession() in App.tsx
  → window.api.startSession()
  → [IPC] sessionHandlers.ts: switchOverlayMode('minimized')
  → [Window resized in place to 380×64 compact pill via setOverlayMode]
  → setSessionMode('active'), setOverlayMode('minimized'), setMinimizedVariant('compact')
  → sessionStore.clearConversation()
```

### Stop Session
**Trigger**: User clicks "Stop" / "End Session"

```
handleStopSession() in App.tsx
  → window.api.stopSession()
  → [IPC] sessionHandlers.ts: switchOverlayMode('expanded')
  → [Window resized in place to 1100×760 centred via setOverlayMode]
  → setSessionMode('home'), setOverlayMode('expanded')
  → sessionStore.clearConversation()
```

### Expand (minimized → expanded)
**Trigger**: User clicks the expand button in `MinimizedSessionBar`

```
handleRestoreOverlay() in App.tsx
  → window.api.restoreOverlay()
  → [IPC] overlayHandlers.ts: switchOverlayMode('expanded')
  → [Window resized in place to 1100×760]
  → setOverlayMode('expanded')
```

### Minimize (expanded → minimized)
**Trigger**: User clicks the minimize button in `ExpandedSessionView`

```
handleMinimizeOverlay() in App.tsx
  → window.api.minimizeOverlay()
  → [IPC] overlayHandlers.ts: setMinimizedVariant('compact'), switchOverlayMode('minimized')
  → [Window resized in place to 380×64 compact]
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

> Every transition above calls the same `setOverlayMode(window, mode, variant)` helper on the existing `BrowserWindow`. `switchOverlayMode` only falls back to creating a new window when the main window has been closed or destroyed.

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

So when the model finishes streaming and there's a response, the pill automatically grows from `prompt-input` (115px tall) to `prompt-response` (360px tall) without any explicit user action.

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
