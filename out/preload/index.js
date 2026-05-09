"use strict";
const electron = require("electron");
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
const api = {
  // Evaluated once at preload time (Node.js context has access to process.env).
  // Defaults to true so voice is on when the env var is absent.
  voiceEnabled: process.env.VOICE_ENABLED !== "false",
  // Evaluated once at preload time. Defaults to false so speech output is opt-in.
  ttsEnabled: process.env.TTS_ENABLED === "true",
  sidecarInterrupt: () => electron.ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT),
  getOverlayState: () => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE
  ),
  startSession: (request) => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.SESSION_START,
    request
  ),
  stopSession: (request) => electron.ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP, request),
  submitSessionPrompt: (request) => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT,
    request
  ),
  listSessions: () => electron.ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST),
  getSessionDetail: (request) => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL,
    request
  ),
  deleteSession: (request) => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE,
    request
  ),
  getSessionMessageImage: (request) => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE,
    request
  ),
  getSessionMessageAudio: (request) => electron.ipcRenderer.invoke(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_AUDIO,
    request
  ),
  setOverlayMode: (mode) => electron.ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MODE, mode),
  minimizeWindow: () => electron.ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => electron.ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: () => electron.ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.WINDOW_CLOSE),
  onOverlayError: (cb) => electron.ipcRenderer.on(
    MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR,
    (_event, data) => cb(data)
  ),
  onSidecarToken: (cb) => electron.ipcRenderer.on(
    MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN,
    (_event, data) => cb(data)
  ),
  onSidecarAudioStart: (cb) => electron.ipcRenderer.on(
    MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START,
    (_event, data) => cb(data)
  ),
  onSidecarAudioChunk: (cb) => electron.ipcRenderer.on(
    MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK,
    (_event, data) => cb(data)
  ),
  onSidecarAudioEnd: (cb) => electron.ipcRenderer.on(
    MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END,
    (_event, data) => cb(data)
  ),
  onSidecarDone: (cb) => electron.ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE, () => cb()),
  onSidecarError: (cb) => electron.ipcRenderer.on(
    MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR,
    (_event, data) => cb(data)
  ),
  removeAllListeners: (channel) => electron.ipcRenderer.removeAllListeners(channel)
};
electron.contextBridge.exposeInMainWorld("api", api);
