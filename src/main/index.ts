import { app, BrowserWindow, nativeImage, session } from "electron";

// ---------------------------------------------------------------------------
// SharedArrayBuffer — must be re-enabled before app.whenReady().
// Chromium disabled SAB by default (Spectre mitigation) and requires
// cross-origin isolation (COOP + COEP headers) to re-enable it.
// In Electron the header-based approach is unreliable across versions, so we
// also force-enable it via the Chromium feature flag as a belt-and-suspenders
// approach. The Vite dev server + webRequest handler still set the headers so
// window.crossOriginIsolated is true (required by some browser APIs).
// ---------------------------------------------------------------------------
app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
import { join } from "node:path";
import { config } from "dotenv";
import { registerIpcHandlers } from "./ipc/handlers";
import { createOverlayWindow, setOverlayMode } from "./overlay/overlayWindow";
import { SessionPersistenceService } from "./session/sessionPersistenceService";
import { disconnectFromSidecar, getSidecarStatus } from "./sidecar/wsClient";
import { startSidecar, stopSidecar } from "./sidecar/sidecarProcess";
import { validateEnv } from "./envValidation";
import { FileSessionStorage } from "./storage/fileSessionStorage";
import {
  MAIN_TO_RENDERER_CHANNELS,
  type EndedSessionSnapshot,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type OverlayState,
  type SessionMode,
} from "../shared/types";

config(); // load .env from repo root
validateEnv(); // warn on missing / invalid env vars — never throws

app.setName("Delfin");

let mainWindow: BrowserWindow | null = null;
let overlayMode: OverlayMode = "expanded";
let minimizedVariant: MinimizedOverlayVariant = "compact";
let sessionMode: SessionMode = "home";
let sessionPersistence: SessionPersistenceService | null = null;
let endedSessionData: EndedSessionSnapshot | null = null;

function createWindow(mode: OverlayMode): BrowserWindow {
  const window = createOverlayWindow(mode, minimizedVariant);
  overlayMode = mode;
  mainWindow = window;
  window.webContents.once("did-finish-load", () => {
    window.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS, getSidecarStatus());
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  return window;
}

function getOverlayState(): OverlayState {
  return {
    overlayMode,
    minimizedVariant,
    sessionMode,
    endedSessionData,
  };
}

function setSessionMode(mode: SessionMode): void {
  sessionMode = mode;
}

function setMinimizedVariant(variant: MinimizedOverlayVariant): void {
  minimizedVariant = variant;
}

function setEndedSessionData(data: EndedSessionSnapshot | null): void {
  endedSessionData = data;
}

function clearEndedSessionData(): void {
  endedSessionData = null;
}

async function switchOverlayMode(mode: OverlayMode): Promise<void> {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    const nextWindow = createWindow(mode);
    nextWindow.focus();
    return;
  }

  overlayMode = mode;
  setOverlayMode(mainWindow, mode, minimizedVariant);
  mainWindow.focus();
}

app.whenReady().then(async () => {
  console.log("Delfin started");

  // Set app icon for the macOS dock (and window title bar on other platforms)
  const isDev = !!process.env["ELECTRON_RENDERER_URL"];
  const iconPath = isDev
    ? join(app.getAppPath(), "src/renderer/assets/logo.png")
    : join(__dirname, "../renderer/assets/logo.png");
  const appIcon = nativeImage.createFromPath(iconPath);
  if (!appIcon.isEmpty()) {
    if (process.platform === "darwin") {
      app.dock?.setIcon(appIcon);
    }
  }

  // ------------------------------------------------------------------
  // COOP/COEP headers — required for SharedArrayBuffer used by
  // @ricky0123/vad-web (Silero VAD runs in a SharedArrayBuffer-backed
  // AudioWorklet).
  //
  // Dev mode: the Vite server sets these headers itself (renderer.server.headers
  // in electron.vite.config.ts) because webRequest fires after the initial
  // document is already parsed.
  //
  // Production: file:// loads have no server, so we inject via webRequest here.
  // We scrub any pre-existing COOP/COEP keys (case-insensitive) first to avoid
  // duplicate conflicting headers from the app:// / file:// protocol handler.
  // ------------------------------------------------------------------
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(
      details.responseHeaders as Record<string, string[]>,
    )) {
      const lower = key.toLowerCase();
      if (
        lower === "cross-origin-opener-policy" ||
        lower === "cross-origin-embedder-policy"
      ) {
        continue; // drop existing value — we set our own below
      }
      headers[key] = value;
    }
    headers["Cross-Origin-Opener-Policy"] = ["same-origin"];
    // credentialless (not require-corp) — see comment in electron.vite.config.ts
    headers["Cross-Origin-Embedder-Policy"] = ["credentialless"];
    callback({ responseHeaders: headers });
  });

  // ------------------------------------------------------------------
  // Grant microphone (getUserMedia) permission automatically.
  // The user will still see the OS-level mic permission prompt on first
  // run — this just prevents Electron from blocking the request itself.
  // ------------------------------------------------------------------
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ["media", "microphone"];
      callback(allowed.includes(permission));
    },
  );

  sessionPersistence = new SessionPersistenceService(
    new FileSessionStorage(join(app.getPath("userData"), "storage")),
  );
  const sidecarResult = await startSidecar();
  if (!sidecarResult.success) {
    console.warn("[main] Failed to auto-start sidecar:", sidecarResult.error);
  }

  registerIpcHandlers({
    getOverlayState,
    getMainWindow: () => mainWindow,
    sessionPersistence,
    sidecarWsUrl: sidecarResult.success
      ? sidecarResult.url
      : (process.env.SIDECAR_WS_URL ?? "ws://localhost:8321/ws"),
    clearEndedSessionData,
    setEndedSessionData,
    setMinimizedVariant,
    switchOverlayMode,
    setSessionMode,
  });

  mainWindow = createWindow("expanded");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(overlayMode);
    }
  });
});

app.on("window-all-closed", () => {
  mainWindow = null;
  disconnectFromSidecar();
  stopSidecar();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
