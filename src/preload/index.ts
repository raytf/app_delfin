import { contextBridge, ipcRenderer } from "electron";
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
} from "../shared/constants";
import type { ElectronAPI } from "../shared/abstractions";
import type {
  OverlayState,
  SessionDetail,
  SessionDetailRequest,
  SessionMessageAudioRequest,
  SessionDeleteRequest,
  SessionMessageImageRequest,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionStopRequest,
  OverlayMode,
  Session,
} from "../shared/types";

const api: ElectronAPI = {
  // Evaluated once at preload time (Node.js context has access to process.env).
  // Defaults to true so voice is on when the env var is absent.
  voiceEnabled: process.env.VOICE_ENABLED !== "false",

  // Evaluated once at preload time. Defaults to false so speech output is opt-in.
  ttsEnabled: process.env.TTS_ENABLED === "true",

  sidecarInterrupt: () =>
    ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT),

  getOverlayState: () =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE,
    ) as Promise<OverlayState>,

  startSession: (request: SessionStartRequest) =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.SESSION_START,
      request,
    ) as Promise<SessionStartResponse>,

  stopSession: (request: SessionStopRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP, request),

  submitSessionPrompt: (request: SessionPromptRequest) =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT,
      request,
    ) as Promise<SessionPromptResponse>,

  listSessions: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST) as Promise<
      Session[]
    >,

  getSessionDetail: (request: SessionDetailRequest) =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL,
      request,
    ) as Promise<SessionDetail>,

  deleteSession: (request: SessionDeleteRequest) =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE,
      request,
    ) as Promise<void>,

  getSessionMessageImage: (request: SessionMessageImageRequest) =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE,
      request,
    ) as Promise<string>,

  getSessionMessageAudio: (request: SessionMessageAudioRequest) =>
    ipcRenderer.invoke(
      RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_AUDIO,
      request,
    ) as Promise<string>,

  setOverlayMode: (mode: OverlayMode) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MODE, mode),

  minimizeWindow: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.WINDOW_MINIMIZE),

  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),

  closeWindow: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.WINDOW_CLOSE),

  onOverlayError: (cb: (data: { message: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, (_event, data) =>
      cb(data),
    ),

  onSidecarToken: (cb: (data: { text: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, (_event, data) =>
      cb(data),
    ),

  onSidecarAudioStart: (
    cb: (data: { sampleRate: number; sentenceCount: number }) => void,
  ) =>
    ipcRenderer.on(
      MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START,
      (_event, data) => cb(data),
    ),

  onSidecarAudioChunk: (
    cb: (data: { audio: string; index?: number }) => void,
  ) =>
    ipcRenderer.on(
      MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK,
      (_event, data) => cb(data),
    ),

  onSidecarAudioEnd: (cb: (data: { ttsTime: number }) => void) =>
    ipcRenderer.on(
      MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END,
      (_event, data) => cb(data),
    ),

  onSidecarDone: (cb: () => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE, () => cb()),

  onSidecarError: (cb: (data: { message: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, (_event, data) =>
      cb(data),
    ),

  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld("api", api);
