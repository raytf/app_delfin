import { BrowserWindow, screen } from "electron";
import { join } from "path";
import type { OverlayMode } from "../../shared/types";

const EXPANDED_WINDOW_WIDTH = 1100;
const EXPANDED_WINDOW_HEIGHT = 760;
const MINIMIZED_WINDOW_WIDTH = 320;
const MINIMIZED_WINDOW_HEIGHT = 88;
const WINDOW_MARGIN = 16;

function getExpandedBounds(): Electron.Rectangle {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    x: Math.round((width - EXPANDED_WINDOW_WIDTH) / 2),
    y: Math.round((height - EXPANDED_WINDOW_HEIGHT) / 2),
    width: EXPANDED_WINDOW_WIDTH,
    height: EXPANDED_WINDOW_HEIGHT,
  };
}

function getMinimizedBounds(): Electron.Rectangle {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    x: width - MINIMIZED_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_WINDOW_WIDTH,
    height: MINIMIZED_WINDOW_HEIGHT,
  };
}

function getWindowBounds(mode: OverlayMode): Electron.Rectangle {
  return mode === "expanded" ? getExpandedBounds() : getMinimizedBounds();
}

function loadRenderer(window: BrowserWindow): void {
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    return;
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"));
}

export function createOverlayWindow(mode: OverlayMode): BrowserWindow {
  const initialBounds = getWindowBounds(mode);

  const window = new BrowserWindow({
    ...initialBounds,
    frame: mode === "expanded",
    alwaysOnTop: mode === "minimized",
    resizable: mode === "expanded",
    maximizable: false,
    minimizable: mode === "expanded",
    fullscreenable: mode === "expanded",
    skipTaskbar: mode === "minimized",
    show: false,
    backgroundColor: "#111827",
    title: "Screen Copilot",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  loadRenderer(window);

  return window;
}

export function setOverlayMode(window: BrowserWindow, mode: OverlayMode): void {
  window.setBounds(getWindowBounds(mode), true);
  window.setAlwaysOnTop(mode === "minimized");
  window.setSkipTaskbar(mode === "minimized");
}
