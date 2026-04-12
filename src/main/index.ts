import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { config } from "dotenv";
import { registerIpcHandlers } from "./ipc/handlers";
import { createOverlayWindow, setOverlayMode } from "./overlay/overlayWindow";
import { SessionPersistenceService } from "./session/sessionPersistenceService";
import { disconnectFromSidecar, getSidecarStatus } from "./sidecar/wsClient";
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
  if (
    overlayMode === mode &&
    mainWindow !== null &&
    !mainWindow.isDestroyed()
  ) {
    setOverlayMode(mainWindow, mode, minimizedVariant);
    mainWindow.focus();
    return;
  }

  const previousWindow = mainWindow;
  const nextWindow = createWindow(mode);

  if (previousWindow !== null && !previousWindow.isDestroyed()) {
    previousWindow.destroy();
  }

  nextWindow.focus();
}

app.whenReady().then(() => {
  console.log("Screen Copilot started");
  sessionPersistence = new SessionPersistenceService(
    new FileSessionStorage(join(app.getPath("userData"), "storage")),
  );
  registerIpcHandlers({
    getOverlayState,
    getMainWindow: () => mainWindow,
    sessionPersistence,
    sidecarWsUrl: process.env.SIDECAR_WS_URL ?? "ws://localhost:8321/ws",
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

  if (process.platform !== "darwin") {
    app.quit();
  }
});
