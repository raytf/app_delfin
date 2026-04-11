import { BrowserWindow, screen } from "electron";
import { join } from "path";
import type { MinimizedOverlayVariant, OverlayMode } from "../../shared/types";

const EXPANDED_WINDOW_WIDTH = 1100;
const EXPANDED_WINDOW_HEIGHT = 760;
const MINIMIZED_WINDOW_WIDTH = 290;
const MINIMIZED_WINDOW_HEIGHT = 75;
const MINIMIZED_PROMPT_INPUT_WINDOW_WIDTH = 420;
const MINIMIZED_PROMPT_INPUT_WINDOW_HEIGHT = 120;
const MINIMIZED_PROMPT_RESPONSE_WINDOW_WIDTH = 420;
const MINIMIZED_PROMPT_RESPONSE_WINDOW_HEIGHT = 420;
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

function getCompactMinimizedBounds(): Electron.Rectangle {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    x: width - MINIMIZED_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_WINDOW_WIDTH,
    height: MINIMIZED_WINDOW_HEIGHT,
  };
}

function getPromptInputMinimizedBounds(): Electron.Rectangle {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    x: width - MINIMIZED_PROMPT_INPUT_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_PROMPT_INPUT_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_PROMPT_INPUT_WINDOW_WIDTH,
    height: MINIMIZED_PROMPT_INPUT_WINDOW_HEIGHT,
  };
}

function getPromptResponseMinimizedBounds(): Electron.Rectangle {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    x: width - MINIMIZED_PROMPT_RESPONSE_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_PROMPT_RESPONSE_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_PROMPT_RESPONSE_WINDOW_WIDTH,
    height: MINIMIZED_PROMPT_RESPONSE_WINDOW_HEIGHT,
  };
}

function getMinimizedBounds(
  variant: MinimizedOverlayVariant,
): Electron.Rectangle {
  if (variant === "prompt-input") {
    return getPromptInputMinimizedBounds();
  }

  if (variant === "prompt-response") {
    return getPromptResponseMinimizedBounds();
  }

  return getCompactMinimizedBounds();
}

function getWindowBounds(
  mode: OverlayMode,
  minimizedVariant: MinimizedOverlayVariant,
): Electron.Rectangle {
  return mode === "expanded"
    ? getExpandedBounds()
    : getMinimizedBounds(minimizedVariant);
}

function loadRenderer(window: BrowserWindow): void {
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    return;
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"));
}

export function createOverlayWindow(
  mode: OverlayMode,
  minimizedVariant: MinimizedOverlayVariant,
): BrowserWindow {
  const initialBounds = getWindowBounds(mode, minimizedVariant);
  const isMinimizedMode = mode === "minimized";

  const window = new BrowserWindow({
    ...initialBounds,
    frame: mode === "expanded",
    alwaysOnTop: isMinimizedMode,
    resizable: mode === "expanded",
    maximizable: false,
    minimizable: mode === "expanded",
    fullscreenable: mode === "expanded",
    skipTaskbar: isMinimizedMode,
    show: false,
    transparent: isMinimizedMode,
    hasShadow: !isMinimizedMode,
    backgroundColor: isMinimizedMode ? "#00000000" : "#f8fcfd",
    title: "Delfin",
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

export function setOverlayMode(
  window: BrowserWindow,
  mode: OverlayMode,
  minimizedVariant: MinimizedOverlayVariant,
): void {
  window.setBounds(getWindowBounds(mode, minimizedVariant), true);
  window.setAlwaysOnTop(mode === "minimized");
  window.setSkipTaskbar(mode === "minimized");
}
