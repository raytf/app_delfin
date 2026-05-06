import { MAIN_TO_RENDERER_CHANNELS } from "../../shared/types";
import { getSidecarStatus } from "./wsClient";
import { BrowserWindow } from "electron";

let interval: NodeJS.Timeout | null = null;
let lastHealthy = false;

export function startHealthPolling(getMainWindow: () => BrowserWindow | null): void {
  if (interval) return;

  const port = process.env.SIDECAR_PORT || "8321";
  const url = `http://localhost:${port}/health`;

  interval = setInterval(async () => {
    try {
      const resp = await fetch(url);
      const isHealthy = resp.ok;

      if (isHealthy !== lastHealthy) {
        lastHealthy = isHealthy;
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          // We combine WS status and health status for the UI?
          // For now just log it or forward a dedicated event if needed.
          // The spec says "forward SidecarStatus to the renderer via sidecar:status IPC"
          // but SidecarStatus currently only has 'connected' (from WebSocket).
          // Let's keep it simple: if /health is up, we are at least partially healthy.
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS, {
            ...getSidecarStatus(),
            healthy: isHealthy,
          });
        }
      }
    } catch (e) {
      if (lastHealthy) {
        lastHealthy = false;
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS, {
            ...getSidecarStatus(),
            healthy: false,
          });
        }
      }
    }
  }, 5000);
}

export function stopHealthPolling(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
