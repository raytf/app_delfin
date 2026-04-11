# Phase 3 — React Sidebar UI

> **Goal**: Build all React components for the sidebar overlay, Zustand stores for state management, and wire up IPC listeners. At the end of this phase, the UI is fully functional against the mock sidecar: capture preview, streaming chat, structured response cards, quick actions, preset picker, stop button, and status indicator.

**Depends on**: Phase 2 (Electron shell, preload API, IPC handlers)

---

## 3.1 Zustand stores

### src/renderer/stores/captureStore.ts

```typescript
interface CaptureState {
  currentFrame: CaptureFrame | null;
  isCapturing: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMs: number;

  setFrame: (frame: CaptureFrame) => void;
  setCapturing: (v: boolean) => void;
  setAutoRefresh: (enabled: boolean, intervalMs?: number) => void;
}
```

### src/renderer/stores/sessionStore.ts

```typescript
interface SessionState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentStreamingText: string;
  activePreset: PresetId;

  addMessage: (msg: ChatMessage) => void;
  appendStreamingToken: (text: string) => void;
  finaliseStreaming: () => void;
  setStreaming: (v: boolean) => void;
  setPreset: (id: PresetId) => void;
  clearMessages: () => void;
}
```

Key behaviour for streaming:
- When `isStreaming` is true, incoming tokens are appended to `currentStreamingText`
- When a `structured` message arrives, create a ChatMessage with `structuredData` field
- When `done` arrives, if `currentStreamingText` is non-empty, finalise it into a ChatMessage, then set `isStreaming = false`
- Generate a unique message ID using `crypto.randomUUID()` (or a simple counter)

### src/renderer/stores/settingsStore.ts

```typescript
interface SettingsState {
  sidecarStatus: SidecarStatus;
  setSidecarStatus: (status: SidecarStatus) => void;
}
```

## 3.2 IPC listener setup

### In App.tsx (or a dedicated hook)

Create a `useEffect` in the top-level `App` component that registers all IPC listeners on mount:

```typescript
useEffect(() => {
  const api = window.electronAPI;

  api.onFrameCaptured((frame) => captureStore.setFrame(frame));
  
  api.onSidecarToken((data) => {
    sessionStore.appendStreamingToken(data.text);
  });
  
  api.onSidecarStructured((data) => {
    sessionStore.addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: data.answer,
      timestamp: Date.now(),
      structuredData: data,
    });
  });
  
  api.onSidecarDone(() => {
    sessionStore.finaliseStreaming();
  });
  
  api.onSidecarError((data) => {
    sessionStore.addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Error: ${data.message}`,
      timestamp: Date.now(),
    });
    sessionStore.setStreaming(false);
  });
  
  api.onSidecarStatus((status) => {
    settingsStore.setSidecarStatus(status);
  });

  return () => {
    // Remove all listeners on unmount to prevent duplicates on hot-reload
    api.removeAllListeners('frame:captured');
    api.removeAllListeners('sidecar:token');
    api.removeAllListeners('sidecar:structured');
    api.removeAllListeners('sidecar:done');
    api.removeAllListeners('sidecar:error');
    api.removeAllListeners('sidecar:status');
    api.removeAllListeners('sidecar:audio_start');
    api.removeAllListeners('sidecar:audio_chunk');
    api.removeAllListeners('sidecar:audio_end');
  };
}, []);
```

## 3.3 Components

### App.tsx — Layout

The root component renders the sidebar layout:

```
<div className="flex flex-col h-screen w-[420px] bg-white text-gray-900 select-none">
  {/* Title bar / drag handle */}
  <TitleBar />
  
  {/* Preset picker */}
  <PresetPicker />
  
  {/* Capture preview */}
  <CapturePreview />
  
  {/* Chat panel (scrollable, flex-1) */}
  <ChatPanel />
  
  {/* Quick actions */}
  <QuickActions />
  
  {/* Input + stop */}
  <ChatInput />
  
  {/* Status bar */}
  <StatusIndicator />
</div>
```

### TitleBar (new component, or inline in App)

A drag handle region with the app name and close/minimize buttons:
- `-webkit-app-region: drag` on the container for window dragging
- Close button: `window.close()`
- Minimize button: uses IPC to minimize (or toggles sidebar collapse — nice-to-have)

### CapturePreview.tsx

Shows the last captured screenshot and capture controls:

- If no frame captured: show a placeholder ("Click Capture to take a screenshot")
- If frame exists: show the image as a thumbnail (`<img src={`data:image/jpeg;base64,${frame.imageBase64}`} />`)
- Below the image: source label + "Captured Xs ago" (relative time)
- Two buttons:
  - **Capture**: calls `window.electronAPI.captureNow()` and sets `isCapturing` briefly
  - **Auto**: toggles auto-refresh (Phase 5 — for now just toggles state, no backend wiring)

### ChatPanel.tsx

Scrollable message list:

- Maps over `sessionStore.messages` and renders each
- **User messages**: right-aligned, blue background
- **Assistant messages (plain text)**: left-aligned, gray background
- **Assistant messages (structured)**: renders a `StructuredCard` sub-component:
  - Summary in a highlighted box
  - Key points as a bullet list
  - Answer as the main text
- **Streaming state**: while `isStreaming` is true and `currentStreamingText` is non-empty, show a "typing" message at the bottom with the accumulated text
- Auto-scroll to bottom when new messages arrive (use `useEffect` + `scrollIntoView`)
- **Error messages**: show with red text/border

### ChatInput.tsx

Text input + send button:

- Text input field with placeholder "Ask about this..."
- Send button (or Enter key) that:
  1. Creates a user ChatMessage and adds to store
  2. Sets `isStreaming = true`
  3. Calls `window.electronAPI.sendToSidecar({ text, preset_id: activePreset, image: currentFrame?.imageBase64 })`
  4. Clears the input
- Input is disabled while `isStreaming` is true
- Below the input: **StopButton** (visible only when streaming)

### StopButton.tsx

A button that:
- Is only visible when `sessionStore.isStreaming` is true
- Renders as "■ Stop" with a red/dark style
- On click:
  1. Calls `window.electronAPI.interruptSidecar()` to signal the sidecar
  2. **Immediately** calls `sessionStore.setStreaming(false)` and `sessionStore.finaliseStreaming()` to reset client state — do **not** wait for a `sidecar:done` message, because the sidecar may stop mid-stream without emitting one after an interrupt

### QuickActions.tsx

A 2×2 grid of buttons showing starter questions for the active preset:

- Read `starterQuestions` from the active preset in `PRESETS`
- Each button, when clicked:
  1. Fills the chat input with that question
  2. Auto-submits it (same logic as ChatInput send)
- Buttons are disabled when streaming

### PresetPicker.tsx

A dropdown (or tab bar) to switch between presets:

- Maps over `PRESETS` from constants
- Shows the `label` of each preset
- On change: updates `sessionStore.activePreset`
- The current preset is highlighted
- Disabled while streaming

### StatusIndicator.tsx

A small status bar at the bottom showing:

- Connection status: green dot + "Connected" or red dot + "Disconnected"
- Backend: "CPU" or "GPU" (from sidecar health)
- Model: "E2B" or "E4B"
- Latency: show the time since the last `capture:now` to the first `sidecar:token` response (if available)

Format: `WS Connected · E2B · CPU · 2.1s`

### MinimizeToggle.tsx

A simple button in the title bar that collapses the sidebar to a thin strip (just the title bar) and expands it back. Use a boolean state to toggle between full height and collapsed height.

## 3.4 Styling

Use Tailwind CSS utility classes exclusively. No component CSS files.

Design guidelines:
- Clean, minimal look with clear visual hierarchy
- White/light gray background
- Blue accent for interactive elements (buttons, active states)
- Monospace font for code-like content in responses
- Consistent spacing: `p-3` for sections, `gap-2` between elements
- Rounded corners on cards and buttons: `rounded-lg`
- Subtle borders between sections: `border-b border-gray-200`
- Scrollable chat panel: `overflow-y-auto flex-1`

## 3.5 Smoke test

Create a minimal renderer test file under `src/renderer/__tests__/`.

Current implementation uses `src/renderer/__tests__/minimizedOverlay.test.ts` to verify:

- voice turns auto-open minimized `compact` mode into `prompt-response`
- streamed/error response auto-advance still toggles between `prompt-input` and `prompt-response`
- non-voice compact mode does not auto-open through the standard auto-advance path

Use Vitest via `npm test`.

---

## ✅ Phase 3 — Verification Checklist

- [ ] `npm run dev` shows the full sidebar UI in the overlay window
- [ ] The sidebar is exactly 420px wide and fills the screen height
- [ ] The title bar allows dragging the window
- [ ] The PresetPicker shows "Lecture Slides" and "Generic Screen" options
- [ ] Clicking "Capture" triggers a screenshot and shows a thumbnail in CapturePreview
- [ ] The captured image label shows the source window name and a relative timestamp
- [ ] With mock sidecar running: typing a question and pressing Enter shows a user message (blue, right-aligned)
- [ ] The mock sidecar's structured response renders as a StructuredCard (summary box + bullet points + answer)
- [ ] Streaming tokens appear incrementally in a "typing" indicator
- [ ] After `done`, the streaming text is finalised into a proper message bubble
- [ ] The StopButton appears only during streaming and disappears after
- [ ] Clicking Stop sends an interrupt (verify in mock sidecar console)
- [ ] QuickActions shows 4 starter questions matching the active preset
- [ ] Clicking a QuickAction auto-submits it as a question
- [ ] Switching presets via PresetPicker changes the QuickActions buttons
- [ ] StatusIndicator shows "Disconnected" when mock sidecar is stopped, "Connected" when running
- [ ] Chat panel auto-scrolls to the bottom on new messages
- [ ] Error messages from sidecar display inline with red styling
- [ ] Input is disabled while streaming
- [x] Renderer unit tests pass (`npm test`) — minimized overlay voice behavior covered by Vitest
