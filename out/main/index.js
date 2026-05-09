"use strict";
const electron = require("electron");
const node_path = require("node:path");
const dotenv = require("dotenv");
const promises = require("node:fs/promises");
const WebSocket = require("ws");
const zod = require("zod");
const path = require("path");
const fs = require("fs");
const RENDERER_TO_MAIN_CHANNELS = {
  SIDECAR_INTERRUPT: "sidecar:interrupt",
  OVERLAY_GET_STATE: "overlay:get-state",
  OVERLAY_SET_MODE: "overlay:set-mode",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window:toggle-maximize",
  WINDOW_CLOSE: "window:close",
  SESSION_START: "session:start",
  SESSION_STOP: "session:stop",
  SESSION_SUBMIT_PROMPT: "session:submit-prompt",
  SESSION_LIST: "session:list",
  SESSION_GET_DETAIL: "session:get-detail",
  SESSION_DELETE: "session:delete",
  SESSION_GET_MESSAGE_IMAGE: "session:get-message-image",
  SESSION_GET_MESSAGE_AUDIO: "session:get-message-audio"
};
const MAIN_TO_RENDERER_CHANNELS = {
  OVERLAY_ERROR: "overlay:error",
  SIDECAR_TOKEN: "sidecar:token",
  SIDECAR_AUDIO_START: "sidecar:audio_start",
  SIDECAR_AUDIO_CHUNK: "sidecar:audio_chunk",
  SIDECAR_AUDIO_END: "sidecar:audio_end",
  SIDECAR_DONE: "sidecar:done",
  SIDECAR_ERROR: "sidecar:error"
};
function forwardOverlayError(options, message) {
  const mainWindow2 = options.getMainWindow();
  if (mainWindow2 === null || mainWindow2.isDestroyed()) {
    return;
  }
  mainWindow2.webContents.send(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, { message });
}
function registerOverlayIpcHandlers(options) {
  electron.ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE, async () => options.getOverlayState());
  electron.ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MODE, async (_event, mode) => {
    const previousMode = options.getOverlayState().mode;
    try {
      await options.switchOverlayMode(mode);
    } catch (error) {
      await options.switchOverlayMode(previousMode);
      const errorMessage = error instanceof Error ? error.message : "Failed to set overlay mode.";
      console.error("[overlayHandlers] Failed to set overlay mode:", error);
      forwardOverlayError(options, errorMessage);
      throw error instanceof Error ? error : new Error(errorMessage);
    }
  });
  electron.ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.WINDOW_MINIMIZE, async () => {
    const mainWindow2 = options.getMainWindow();
    if (mainWindow2 === null || mainWindow2.isDestroyed()) {
      throw new Error("Main window is not available.");
    }
    mainWindow2.minimize();
  });
  electron.ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async () => {
    const mainWindow2 = options.getMainWindow();
    if (mainWindow2 === null || mainWindow2.isDestroyed()) {
      throw new Error("Main window is not available.");
    }
    if (mainWindow2.isMaximized()) {
      mainWindow2.unmaximize();
      return;
    }
    mainWindow2.maximize();
  });
  electron.ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.WINDOW_CLOSE, async () => {
    const mainWindow2 = options.getMainWindow();
    if (mainWindow2 === null || mainWindow2.isDestroyed()) {
      throw new Error("Main window is not available.");
    }
    mainWindow2.close();
  });
}
const CAPTURE_THUMBNAIL_SIZE = {
  width: 1920,
  height: 1080
};
function isCapturableSource(source) {
  return source.name.trim().length > 0 && !source.name.includes("Delfin");
}
async function getWindowSources() {
  return electron.desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: CAPTURE_THUMBNAIL_SIZE
  });
}
async function getScreenSources() {
  return electron.desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: CAPTURE_THUMBNAIL_SIZE
  });
}
async function getActiveWindowSource() {
  const windowSources = await getWindowSources();
  const windowSource = windowSources.find(isCapturableSource);
  if (windowSource !== void 0) {
    return windowSource;
  }
  const screenSources = await getScreenSources();
  const screenSource = screenSources.find(isCapturableSource);
  if (screenSource === void 0) {
    throw new Error(
      "No capturable source found (tried window and screen types)."
    );
  }
  return screenSource;
}
async function getPrimaryScreenSource() {
  const screenSources = await getScreenSources();
  const screenSource = screenSources.find(
    (source) => source.name.trim().length > 0
  );
  if (screenSource === void 0) {
    throw new Error("No capturable screen source found.");
  }
  return screenSource;
}
function isThumbnailBlank(image) {
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return true;
  const bitmap = image.toBitmap();
  for (const yFrac of [0.2, 0.4, 0.6, 0.8]) {
    for (const xFrac of [0.2, 0.4, 0.6, 0.8]) {
      const x = Math.floor(width * xFrac);
      const y = Math.floor(height * yFrac);
      const offset = (y * width + x) * 4;
      const b = bitmap[offset] ?? 0;
      const g = bitmap[offset + 1] ?? 0;
      const r = bitmap[offset + 2] ?? 0;
      if (r > 10 || g > 10 || b > 10) return false;
    }
  }
  return true;
}
async function captureForegroundWindow() {
  const source = await getActiveWindowSource();
  return captureSource(source, true);
}
async function capturePrimaryScreen() {
  const source = await getPrimaryScreenSource();
  return captureSource(source, false);
}
function captureSource(source, isWindowCapture) {
  const { width, height } = source.thumbnail.getSize();
  if (width === 0 || height === 0) {
    throw new Error(
      `Capture source "${source.name}" did not provide a usable thumbnail.`
    );
  }
  if (isThumbnailBlank(source.thumbnail)) {
    throw new Error(
      `Screenshot from "${source.name}" is blank (all black). This is a known WSL2 limitation: the display compositor does not support pixel readback via desktopCapturer. ` + (isWindowCapture ? "Try running the app on native Linux or Windows, or open a Linux GUI app (e.g. a browser) in the same WSLg session so it appears as a capturable window." : "Try running the app on native Linux or Windows, or capture from a display/compositor that supports screen thumbnails.")
    );
  }
  return {
    imageBase64: source.thumbnail.toJPEG(80).toString("base64"),
    width,
    height,
    capturedAt: Date.now(),
    sourceLabel: source.name
  };
}
var PresetId = /* @__PURE__ */ ((PresetId2) => {
  PresetId2["LectureSlide"] = "lecture-slide";
  PresetId2["GenericScreen"] = "generic-screen";
  return PresetId2;
})(PresetId || {});
var SidecarSessionInboundType = /* @__PURE__ */ ((SidecarSessionInboundType2) => {
  SidecarSessionInboundType2["Token"] = "token";
  SidecarSessionInboundType2["AudioStart"] = "audio_start";
  SidecarSessionInboundType2["AudioChunk"] = "audio_chunk";
  SidecarSessionInboundType2["AudioEnd"] = "audio_end";
  SidecarSessionInboundType2["Done"] = "done";
  SidecarSessionInboundType2["Error"] = "error";
  return SidecarSessionInboundType2;
})(SidecarSessionInboundType || {});
const sidecarSessionInboundMessageSchema = zod.z.object({
  type: zod.z.enum(SidecarSessionInboundType),
  text: zod.z.string().optional(),
  audio: zod.z.string().optional(),
  message: zod.z.string().optional(),
  sample_rate: zod.z.number().optional(),
  sentence_count: zod.z.number().optional(),
  index: zod.z.number().optional(),
  tts_time: zod.z.number().optional()
});
let socket = null;
let reconnectTimer = null;
let currentUrl = "";
let messageHandler = null;
function scheduleReconnect() {
  if (!currentUrl || reconnectTimer !== null) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToSidecar(currentUrl);
  }, 2e3);
}
function connectToSidecar(wsUrl) {
  currentUrl = wsUrl;
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    return;
  }
  socket = new WebSocket(wsUrl);
  socket.on("open", () => {
    console.log(`Connected to FastAPI sidecar WebSocket at ${wsUrl}`);
  });
  socket.on("message", (data) => {
    const raw = data.toString();
    try {
      const parsed = sidecarSessionInboundMessageSchema.parse(JSON.parse(raw));
      messageHandler?.(parsed);
    } catch (error) {
      console.error("[wsClient] Failed to parse sidecar message:", error);
      console.error(
        "[wsClient] Raw payload that failed:",
        raw.substring(0, 500)
      );
    }
  });
  socket.on("close", () => {
    socket = null;
    scheduleReconnect();
  });
  socket.on("error", (error) => {
    console.error("Sidecar WebSocket error:", error.message);
  });
}
function sendToSidecar(message) {
  if (socket?.readyState !== WebSocket.OPEN) {
    throw new Error("Sidecar WebSocket is not connected.");
  }
  socket.send(JSON.stringify(message));
}
function onSidecarMessage(handler) {
  messageHandler = handler;
}
function disconnectFromSidecar() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  currentUrl = "";
  socket?.close();
  socket = null;
}
function registerSessionIpcHandlers(options) {
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_START,
    async (_event, request) => {
      const sessionName = request.sessionName.trim();
      if (sessionName.length === 0) {
        throw new Error("Session name cannot be empty.");
      }
      const response = await options.sidecarSessionClient.createSession({
        sessionName,
        presetId: PresetId.LectureSlide
      });
      await options.switchOverlayMode("minimized-compact");
      return response;
    }
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_STOP,
    async (_event, request) => {
      await options.sidecarSessionClient.endSession(request.sessionId);
      await options.switchOverlayMode("expanded");
    }
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT,
    async (_event, request) => {
      const mainWindow2 = options.getMainWindow();
      if (mainWindow2 === null || mainWindow2.isDestroyed()) {
        throw new Error("Main window is not available.");
      }
      const text = request.text.trim();
      const isVoiceTurn = Boolean(request.audio);
      if (text.length === 0 && !isVoiceTurn) {
        throw new Error("Prompt cannot be empty.");
      }
      const frame = options.getOverlayState().mode === "expanded" ? await captureForegroundWindow() : await capturePrimaryScreen();
      try {
        sendToSidecar({
          session_id: request.sessionId,
          image: frame.imageBase64,
          text,
          preset_id: request.presetId,
          ...request.audio !== void 0 ? { audio: request.audio } : {}
        });
      } catch (error) {
        throw error;
      }
      return {
        messageId: request.messageId,
        imageDataUrl: `data:image/jpeg;base64,${frame.imageBase64}`
      };
    }
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_LIST,
    async () => options.sidecarSessionClient.listSessions()
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL,
    async (_event, request) => options.sidecarSessionClient.getSessionDetail(request.sessionId)
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE,
    async (_event, request) => options.sidecarSessionClient.deleteSession(request.sessionId)
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE,
    async (_event, request) => {
      const image = await promises.readFile(request.imagePath);
      return `data:image/jpeg;base64,${image.toString("base64")}`;
    }
  );
  electron.ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_AUDIO,
    async (_event, request) => {
      const audio = await promises.readFile(request.audioPath);
      return `data:audio/wav;base64,${audio.toString("base64")}`;
    }
  );
}
function registerSidecarBridge(options) {
  connectToSidecar(options.sidecarWsUrl);
  electron.ipcMain.on(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT, () => {
    try {
      sendToSidecar({ type: "interrupt" });
    } catch (error) {
      const mainWindow2 = options.getMainWindow();
      if (mainWindow2 !== null && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, {
          message: error instanceof Error ? error.message : "Failed to interrupt sidecar."
        });
      }
    }
  });
  onSidecarMessage(async (message) => {
    const mainWindow2 = options.getMainWindow();
    if (mainWindow2 === null || mainWindow2.isDestroyed()) {
      return;
    }
    try {
      switch (message.type) {
        case "token":
          mainWindow2.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, {
            text: message.text ?? ""
          });
          return;
        case "audio_start":
          mainWindow2.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START,
            {
              sampleRate: message.sample_rate ?? 24e3,
              sentenceCount: message.sentence_count ?? 0
            }
          );
          return;
        case "audio_chunk":
          if (message.audio !== void 0) {
            mainWindow2.webContents.send(
              MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK,
              { audio: message.audio, index: message.index }
            );
          }
          return;
        case "audio_end":
          mainWindow2.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END,
            { ttsTime: message.tts_time ?? 0 }
          );
          return;
        case "done":
          mainWindow2.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE);
          return;
        case "error":
          mainWindow2.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, {
            message: message.message ?? "Unknown error"
          });
          return;
      }
    } catch (error) {
      console.error(
        "[sidecarBridge] Failed to forward sidecar message:",
        error
      );
    }
  });
}
function registerIpcHandlers(options) {
  registerSidecarBridge(options);
  registerOverlayIpcHandlers(options);
  registerSessionIpcHandlers(options);
}
const EXPANDED_WINDOW_WIDTH = 1100;
const EXPANDED_WINDOW_HEIGHT = 760;
const MINIMIZED_WINDOW_WIDTH = 380;
const MINIMIZED_WINDOW_HEIGHT = 64;
const MINIMIZED_PROMPT_INPUT_WINDOW_WIDTH = 460;
const MINIMIZED_PROMPT_INPUT_WINDOW_HEIGHT = 115;
const MINIMIZED_PROMPT_RESPONSE_WINDOW_WIDTH = 460;
const MINIMIZED_PROMPT_RESPONSE_WINDOW_HEIGHT = 360;
const WINDOW_MARGIN = 16;
function getExpandedBounds() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.round((width - EXPANDED_WINDOW_WIDTH) / 2),
    y: Math.round((height - EXPANDED_WINDOW_HEIGHT) / 2),
    width: EXPANDED_WINDOW_WIDTH,
    height: EXPANDED_WINDOW_HEIGHT
  };
}
function getCompactMinimizedBounds() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  return {
    x: width - MINIMIZED_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_WINDOW_WIDTH,
    height: MINIMIZED_WINDOW_HEIGHT
  };
}
function getPromptInputMinimizedBounds() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  return {
    x: width - MINIMIZED_PROMPT_INPUT_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_PROMPT_INPUT_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_PROMPT_INPUT_WINDOW_WIDTH,
    height: MINIMIZED_PROMPT_INPUT_WINDOW_HEIGHT
  };
}
function getPromptResponseMinimizedBounds() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  return {
    x: width - MINIMIZED_PROMPT_RESPONSE_WINDOW_WIDTH - WINDOW_MARGIN,
    y: height - MINIMIZED_PROMPT_RESPONSE_WINDOW_HEIGHT - WINDOW_MARGIN,
    width: MINIMIZED_PROMPT_RESPONSE_WINDOW_WIDTH,
    height: MINIMIZED_PROMPT_RESPONSE_WINDOW_HEIGHT
  };
}
function getWindowBounds(mode) {
  switch (mode) {
    case "expanded":
      return getExpandedBounds();
    case "minimized-prompt-input":
      return getPromptInputMinimizedBounds();
    case "minimized-prompt-response":
      return getPromptResponseMinimizedBounds();
    case "minimized-compact":
    default:
      return getCompactMinimizedBounds();
  }
}
function loadRenderer(window) {
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    return;
  }
  void window.loadFile(path.join(__dirname, "../renderer/index.html"));
}
function createOverlayWindow(mode) {
  const initialBounds = getWindowBounds(mode);
  const isMinimizedMode = mode !== "expanded";
  const window = new electron.BrowserWindow({
    ...initialBounds,
    frame: false,
    alwaysOnTop: isMinimizedMode,
    resizable: mode === "expanded",
    maximizable: mode === "expanded",
    minimizable: mode === "expanded",
    fullscreenable: mode === "expanded",
    skipTaskbar: isMinimizedMode,
    show: false,
    transparent: true,
    hasShadow: !isMinimizedMode,
    backgroundColor: isMinimizedMode ? "#00000000" : "#f8fcfd",
    title: "Delfin",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  window.once("ready-to-show", () => {
    window.show();
  });
  loadRenderer(window);
  return window;
}
function setOverlayMode(window, mode) {
  const isMinimizedMode = mode !== "expanded";
  window.setBounds(getWindowBounds(mode), true);
  window.setAlwaysOnTop(isMinimizedMode);
  window.setSkipTaskbar(isMinimizedMode);
  window.setResizable(mode === "expanded");
  window.setMinimizable(mode === "expanded");
  window.setMaximizable(mode === "expanded");
  window.setFullScreenable(mode === "expanded");
  window.setHasShadow(mode === "expanded");
  window.setBackgroundColor(isMinimizedMode ? "#00000000" : "#f8fcfd");
  if (!window.isVisible()) {
    window.show();
  }
}
class HttpRequestHelper {
}
function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
function appendParams(url, params) {
  if (params === void 0) {
    return;
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== void 0 && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    url.searchParams.append(key, String(value));
  }
}
function normalizeHeaders(headers) {
  if (headers === void 0) {
    return void 0;
  }
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === void 0 || value === null) {
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
}
async function parseJsonResponse(response) {
  const text = await response.text();
  if (text.trim().length === 0) {
    return void 0;
  }
  return JSON.parse(text);
}
class FetchHttpRequestHelper extends HttpRequestHelper {
  constructor(baseUrl, fetchImpl = fetch) {
    super();
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }
  baseUrl;
  fetchImpl;
  async get(urlSuffix, options) {
    return this.request("GET", urlSuffix, void 0, options);
  }
  async post(urlSuffix, data, options) {
    return this.request("POST", urlSuffix, data, options);
  }
  async put(urlSuffix, data, options) {
    return this.request("PUT", urlSuffix, data, options);
  }
  async delete(urlSuffix, options) {
    return this.request("DELETE", urlSuffix, void 0, options);
  }
  async patch(urlSuffix, data, options) {
    return this.request("PATCH", urlSuffix, data, options);
  }
  async request(method, urlSuffix, data, options) {
    const url = new URL(urlSuffix, normalizeBaseUrl(this.baseUrl));
    appendParams(url, options?.params);
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...normalizeHeaders(options?.headers) ?? {}
      },
      body: data === void 0 ? void 0 : JSON.stringify(data)
    });
    if (!response.ok) {
      const payloadText = await response.text();
      let errorMessage = `Request failed with status ${response.status}`;
      if (payloadText.trim().length > 0) {
        try {
          const payload = JSON.parse(payloadText);
          errorMessage = payload.error?.displayMessage ?? `Request failed with status ${response.status}`;
        } catch {
          errorMessage = `Request failed with status ${response.status}`;
        }
      }
      throw new Error(errorMessage);
    }
    return parseJsonResponse(response);
  }
}
function normalizeStatus(status) {
  if (status === "completed" || status === "failed" || status === "aborted") {
    return status;
  }
  return status === "active" ? "active" : "completed";
}
function mapSessionResponse(session) {
  return {
    id: session.id,
    name: session.name,
    presetId: session.preset_id,
    startedAt: Date.parse(session.started_at),
    endedAt: session.ended_at === null ? null : Date.parse(session.ended_at),
    status: normalizeStatus(session.status),
    messageCount: session.message_count,
    lastUpdatedAt: Date.parse(session.updated_at),
    sourceLabel: null
  };
}
function mapSessionMessageResponse(message) {
  return {
    id: message.id,
    role: message.author,
    content: message.content,
    timestamp: message.timestamp,
    imagePath: message.image_path,
    audioPath: message.audio_path,
    interrupted: Boolean(message.interrupted)
  };
}
function mapSessionDetailResponse(detail) {
  return {
    ...mapSessionResponse(detail),
    messages: detail.messages.map(
      (message) => mapSessionMessageResponse(message)
    )
  };
}
class SidecarSessionClient {
  http;
  constructor(baseUrl, httpHelper) {
    this.http = httpHelper ?? new FetchHttpRequestHelper(baseUrl);
  }
  async createSession(input) {
    const response = await this.http.post(
      "/sessions",
      {
        session_name: input.sessionName,
        preset_id: input.presetId
      }
    );
    return {
      sessionId: response.data.id
    };
  }
  async endSession(sessionId) {
    await this.http.patch(
      `/sessions/${sessionId}/end`
    );
  }
  async listSessions() {
    const response = await this.http.get("/sessions");
    return response.data.map((session) => mapSessionResponse(session)).sort((left, right) => right.startedAt - left.startedAt);
  }
  async getSessionDetail(sessionId) {
    const response = await this.http.get(`/sessions/${sessionId}`);
    return mapSessionDetailResponse(response.data);
  }
  async deleteSession(sessionId) {
    await this.http.delete(`/sessions/${sessionId}`);
  }
}
function deriveSidecarHttpBaseUrl(wsUrl) {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
const WARN_PREFIX = "[env]";
function validateEnv() {
  const warnings = [];
  function warn(msg) {
    warnings.push(msg);
    console.warn(`${WARN_PREFIX} ⚠️  ${msg}`);
  }
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    warn(
      ".env file not found — running with defaults. Copy .env.example to .env and adjust for your machine."
    );
  }
  if (!process.env.SIDECAR_WS_URL) {
    warn("SIDECAR_WS_URL is not set — defaulting to ws://localhost:8321/ws");
  } else if (!process.env.SIDECAR_WS_URL.startsWith("ws://") && !process.env.SIDECAR_WS_URL.startsWith("wss://")) {
    warn(
      `SIDECAR_WS_URL="${process.env.SIDECAR_WS_URL}" does not look like a WebSocket URL (expected ws:// or wss://)`
    );
  }
  const voiceEnabled = process.env.VOICE_ENABLED;
  if (voiceEnabled !== void 0 && voiceEnabled !== "true" && voiceEnabled !== "false") {
    warn(`VOICE_ENABLED="${voiceEnabled}" is not a valid boolean — expected "true" or "false"`);
  }
  const ttsEnabled = process.env.TTS_ENABLED;
  if (ttsEnabled !== void 0 && ttsEnabled !== "true" && ttsEnabled !== "false") {
    warn(`TTS_ENABLED="${ttsEnabled}" is not a valid boolean — expected "true" or "false"`);
  }
  const validTtsBackends = ["web-speech", "kokoro", "mlx"];
  const ttsBackend = process.env.TTS_BACKEND;
  if (ttsBackend !== void 0 && !validTtsBackends.includes(ttsBackend)) {
    warn(
      `TTS_BACKEND="${ttsBackend}" is not recognised — valid values: ${validTtsBackends.join(", ")}`
    );
  }
  const audioBackend = process.env.LITERT_AUDIO_BACKEND;
  if (audioBackend !== void 0 && audioBackend !== "CPU" && audioBackend !== "GPU") {
    warn(`LITERT_AUDIO_BACKEND="${audioBackend}" is not recognised — expected "CPU" or "GPU"`);
  }
  if (warnings.length === 0) {
    console.log(`${WARN_PREFIX} ✅  All checked environment variables look good.`);
  }
  return { warnings };
}
electron.app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
dotenv.config();
validateEnv();
electron.app.setName("Delfin");
let mainWindow = null;
let overlayMode = "expanded";
function createWindow(mode) {
  const window = createOverlayWindow(mode);
  overlayMode = mode;
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  return window;
}
function getOverlayState() {
  return {
    mode: overlayMode
  };
}
async function switchOverlayMode(mode) {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    const nextWindow = createWindow(mode);
    nextWindow.focus();
    return;
  }
  overlayMode = mode;
  setOverlayMode(mainWindow, mode);
  mainWindow.focus();
}
electron.app.whenReady().then(() => {
  console.log("Delfin started");
  const isDev = !!process.env["ELECTRON_RENDERER_URL"];
  const iconPath = isDev ? node_path.join(electron.app.getAppPath(), "src/renderer/assets/logo.png") : node_path.join(__dirname, "../renderer/assets/logo.png");
  const appIcon = electron.nativeImage.createFromPath(iconPath);
  if (!appIcon.isEmpty()) {
    if (process.platform === "darwin") {
      electron.app.dock?.setIcon(appIcon);
    }
  }
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = {};
    for (const [key, value] of Object.entries(
      details.responseHeaders
    )) {
      const lower = key.toLowerCase();
      if (lower === "cross-origin-opener-policy" || lower === "cross-origin-embedder-policy") {
        continue;
      }
      headers[key] = value;
    }
    headers["Cross-Origin-Opener-Policy"] = ["same-origin"];
    headers["Cross-Origin-Embedder-Policy"] = ["credentialless"];
    callback({ responseHeaders: headers });
  });
  electron.session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ["media", "microphone"];
      callback(allowed.includes(permission));
    }
  );
  const sidecarWsUrl = process.env.SIDECAR_WS_URL ?? "ws://localhost:8321/ws";
  registerIpcHandlers({
    getOverlayState,
    getMainWindow: () => mainWindow,
    sidecarSessionClient: new SidecarSessionClient(
      deriveSidecarHttpBaseUrl(sidecarWsUrl)
    ),
    sidecarWsUrl,
    switchOverlayMode
  });
  mainWindow = createWindow("expanded");
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(overlayMode);
    }
  });
});
electron.app.on("window-all-closed", () => {
  mainWindow = null;
  disconnectFromSidecar();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
