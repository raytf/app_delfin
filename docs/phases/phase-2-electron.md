# Phase 2 — Electron Shell + Capture

> **Goal**: Build the Electron main process with the overlay window, screen capture via desktopCapturer, WebSocket client, and IPC handlers. At the end of this phase, clicking a button in the renderer captures the foreground window and the main process can send/receive WebSocket messages to the sidecar (or mock sidecar).

**Depends on**: Phase 0 (project scaffold, shared types)

---

## 2.1 Overlay window

### src/main/overlay/overlayWindow.ts

Create and export a function `createOverlayWindow()` that:

1. Creates a `BrowserWindow` with these properties:
   - Width: 420px (from `SIDEBAR_WIDTH` constant)
   - Height: full screen height (use `screen.getPrimaryDisplay().workAreaSize.height`)
   - X position: right edge of screen (`workAreaSize.width - 420`)
   - Y position: 0
   - `frame: false` (frameless)
   - `alwaysOnTop: true`
   - `resizable: false`
   - `skipTaskbar: true` (don't show in taskbar)
   - `transparent: false`
   - `backgroundColor: '#ffffff'`
   - `webPreferences.preload`: path to preload script
   - `webPreferences.contextIsolation: true`
   - `webPreferences.nodeIntegration: false`
   - `title: 'Delfin'`

2. Load the Vite dev server URL (dev) or production HTML (prod)
3. Return the window instance

### src/main/index.ts

Update the main entry point:

1. Call `createOverlayWindow()` in `app.whenReady()`
2. Store the window reference for use by capture and IPC
3. Handle `app.on('window-all-closed')` to quit
4. Handle `app.on('activate')` to recreate window on macOS

## 2.2 Preload script

### src/preload/index.ts

Expose IPC methods to the renderer via `contextBridge.exposeInMainWorld`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type {
  CaptureFrame,
  WsOutboundMessage,
  WsInterruptMessage,
  WsInboundMessage,
  StructuredResponse,
  SidecarStatus,
} from '../../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer → Main
  captureNow: () => ipcRenderer.send('capture:now'),
  setAutoRefresh: (opts: { enabled: boolean; intervalMs: number }) =>
    ipcRenderer.send('capture:auto-refresh', opts),
  sendToSidecar: (msg: WsOutboundMessage | WsInterruptMessage) =>
    ipcRenderer.send('sidecar:send', msg),
  interruptSidecar: () => ipcRenderer.send('sidecar:interrupt'),

  // Main → Renderer (listeners)
  onFrameCaptured: (cb: (frame: CaptureFrame) => void) =>
    ipcRenderer.on('frame:captured', (_e, frame: CaptureFrame) => cb(frame)),
  onSidecarToken: (cb: (data: { text: string }) => void) =>
    ipcRenderer.on('sidecar:token', (_e, data: { text: string }) => cb(data)),
  onSidecarStructured: (cb: (data: StructuredResponse) => void) =>
    ipcRenderer.on('sidecar:structured', (_e, data: StructuredResponse) => cb(data)),
  onSidecarAudioStart: (cb: () => void) =>
    ipcRenderer.on('sidecar:audio_start', () => cb()),
  onSidecarAudioChunk: (cb: (data: { audio: string; index: number }) => void) =>
    ipcRenderer.on('sidecar:audio_chunk', (_e, data: { audio: string; index: number }) => cb(data)),
  onSidecarAudioEnd: (cb: () => void) =>
    ipcRenderer.on('sidecar:audio_end', () => cb()),
  onSidecarDone: (cb: () => void) =>
    ipcRenderer.on('sidecar:done', () => cb()),
  onSidecarError: (cb: (data: { message: string }) => void) =>
    ipcRenderer.on('sidecar:error', (_e, data: { message: string }) => cb(data)),
  onSidecarStatus: (cb: (status: SidecarStatus) => void) =>
    ipcRenderer.on('sidecar:status', (_e, status: SidecarStatus) => cb(status)),

  // Cleanup
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
});
```

> **No `any` types**: The preload script imports and uses all types from `../../shared/types`. This matches the `ElectronAPI` interface declared below and satisfies the no-`any` rule in SPEC.md. `WsInboundMessage` is imported to satisfy the `wsClient.ts` type contract even if not directly used in the preload.

Also add a TypeScript declaration file (`src/preload/index.d.ts` or in `src/renderer/`) so the renderer can use `window.electronAPI` with type safety:

```typescript
interface ElectronAPI {
  captureNow: () => void;
  setAutoRefresh: (opts: { enabled: boolean; intervalMs: number }) => void;
  sendToSidecar: (msg: WsOutboundMessage | WsInterruptMessage) => void;
  interruptSidecar: () => void;
  onFrameCaptured: (cb: (frame: CaptureFrame) => void) => void;
  onSidecarToken: (cb: (data: { text: string }) => void) => void;
  onSidecarStructured: (cb: (data: StructuredResponse) => void) => void;
  onSidecarDone: (cb: () => void) => void;
  onSidecarError: (cb: (data: { message: string }) => void) => void;
  onSidecarStatus: (cb: (status: SidecarStatus) => void) => void;
  // ... audio callbacks
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

## 2.3 Screen capture

### src/main/capture/captureService.ts

Export `captureForegroundWindow(overlayWindowId: number): Promise<CaptureFrame>`

1. Call `desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1920, height: 1080 } })`
2. Filter out sources whose `name` includes `'Delfin'` (the overlay itself)
3. Take the first remaining source (this is the foreground window)
4. Convert `source.thumbnail` to JPEG buffer: `source.thumbnail.toJPEG(80)`
5. Convert to base64 string
6. Return a `CaptureFrame` object with `imageBase64`, `width`, `height`, `capturedAt` (Date.now()), and `sourceLabel` (source.name)

If no valid sources are found, throw a descriptive error.

### src/main/capture/focusDetector.ts

For this phase, this is a thin wrapper. Export `getActiveWindowSource()` that calls `desktopCapturer.getSources` and returns the first non-overlay source. This will be expanded in Phase 5 for auto-refresh.

### src/main/capture/autoRefresh.ts

Create the `AutoRefreshManager` class (placeholder for now — full implementation in Phase 5):

```typescript
export class AutoRefreshManager {
  start(intervalMs: number): void { /* Phase 5 */ }
  stop(): void { /* Phase 5 */ }
  onNewFrame(callback: (frame: CaptureFrame) => void): void { /* Phase 5 */ }
}
```

## 2.4 WebSocket client

### src/main/sidecar/wsClient.ts

Export functions to manage the WebSocket connection to the sidecar:

```typescript
import WebSocket from 'ws';
import { WsOutboundMessage, WsInterruptMessage, WsInboundMessage } from '../../shared/types';

let socket: WebSocket | null = null;
let messageHandler: ((msg: WsInboundMessage) => void) | null = null;
let statusHandler: ((connected: boolean) => void) | null = null;

export function connectSidecar(wsUrl: string): void {
  socket = new WebSocket(wsUrl);

  socket.on('open', () => {
    console.log('Sidecar WebSocket connected');
    statusHandler?.(true);
  });

  socket.on('message', (data) => {
    try {
      const msg: WsInboundMessage = JSON.parse(data.toString());
      messageHandler?.(msg);
    } catch (e) {
      console.error('Failed to parse sidecar message:', e);
    }
  });

  socket.on('close', () => {
    console.log('Sidecar WebSocket closed, reconnecting in 2s...');
    statusHandler?.(false);
    setTimeout(() => connectSidecar(wsUrl), 2000);
  });

  socket.on('error', (err) => {
    console.error('Sidecar WebSocket error:', err.message);
  });
}

export function sendToSidecar(msg: WsOutboundMessage | WsInterruptMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function onSidecarMessage(handler: (msg: WsInboundMessage) => void): void {
  messageHandler = handler;
}

export function onSidecarStatus(handler: (connected: boolean) => void): void {
  statusHandler = handler;
}

export function disconnectSidecar(): void {
  socket?.close();
  socket = null;
}
```

### src/main/sidecar/healthCheck.ts

Export `checkHealth(port: number): Promise<any>` that does a simple HTTP GET to `http://localhost:{port}/health` and returns the parsed JSON. Use Node's built-in `fetch` (available in Node 18+).

## 2.5 IPC handlers

### src/main/ipc/handlers.ts

Register all IPC handlers. This is the bridge between the renderer and the main process services:

```typescript
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const wsUrl = process.env.SIDECAR_WS_URL || 'ws://localhost:8321/ws';
  
  // Connect to sidecar
  connectSidecar(wsUrl);
  
  // Forward sidecar messages to renderer
  onSidecarMessage((msg) => {
    switch (msg.type) {
      case 'token':
        mainWindow.webContents.send('sidecar:token', { text: msg.text });
        break;
      case 'structured':
        mainWindow.webContents.send('sidecar:structured', msg.data);
        break;
      case 'done':
        mainWindow.webContents.send('sidecar:done');
        break;
      case 'error':
        mainWindow.webContents.send('sidecar:error', { message: msg.message });
        break;
      // ... audio events (Phase 5)
    }
  });
  
  // Forward sidecar connection status
  onSidecarStatus((connected) => {
    mainWindow.webContents.send('sidecar:status', { connected });
  });
  
  // Handle capture request
  ipcMain.on('capture:now', async () => {
    try {
      const frame = await captureForegroundWindow(mainWindow.id);
      mainWindow.webContents.send('frame:captured', frame);
    } catch (e) {
      mainWindow.webContents.send('sidecar:error', { message: `Capture failed: ${e}` });
    }
  });
  
  // Handle sidecar send
  ipcMain.on('sidecar:send', (_e, msg) => {
    sendToSidecar(msg);
  });
  
  // Handle interrupt
  ipcMain.on('sidecar:interrupt', () => {
    sendToSidecar({ type: 'interrupt' });
  });
  
  // Auto-refresh (placeholder — Phase 5)
  ipcMain.on('capture:auto-refresh', (_e, opts) => {
    // Will be implemented in Phase 5
    console.log('Auto-refresh:', opts);
  });
}
```

## 2.6 Wire up main process

### src/main/index.ts (final)

1. Load `.env` using `dotenv.config()`
2. Create overlay window
3. Register IPC handlers
4. Fetch initial health status from sidecar and send to renderer
5. Handle app lifecycle events

---

## ✅ Phase 2 — Verification Checklist

- [ ] `npm run dev` opens a frameless 420px-wide window pinned to the right edge of the screen
- [ ] The window is always-on-top
- [ ] The window title is "Delfin" (visible in task manager, not in window chrome)
- [ ] The renderer shows the placeholder React content from Phase 0
- [ ] With the mock sidecar running (`node scripts/mock-sidecar.js`): the main process connects and logs "Sidecar WebSocket connected"
- [ ] Using Electron DevTools console: `window.electronAPI` is defined and has all expected methods
- [ ] Calling `window.electronAPI.captureNow()` from DevTools results in a `frame:captured` event (verify by adding a temporary listener)
- [ ] The captured frame does NOT include the Delfin overlay window
- [ ] Calling `window.electronAPI.sendToSidecar({text: "test", preset_id: "lecture-slide"})` sends a message to the mock sidecar (verify in mock sidecar console)
- [ ] Mock sidecar responses arrive in the main process and are forwarded to renderer (verify with temporary IPC listener)
- [ ] If the mock sidecar is stopped, the WebSocket client auto-reconnects after 2 seconds
- [ ] `window.electronAPI.interruptSidecar()` sends `{"type":"interrupt"}` (verify in mock sidecar console)
