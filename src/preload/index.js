import { contextBridge, ipcRenderer } from 'electron';
import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS } from '../shared/types';
const api = {
    // Evaluated once at preload time (Node.js context has access to process.env).
    // Defaults to true so voice is on when the env var is absent.
    voiceEnabled: process.env.VOICE_ENABLED !== 'false',
    // Evaluated once at preload time. Defaults to false so speech output is opt-in.
    ttsEnabled: process.env.TTS_ENABLED === 'true',
    captureNow: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.CAPTURE_NOW),
    captureAutoRefresh: (config) => ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.CAPTURE_AUTO_REFRESH, config),
    sidecarSend: (msg) => ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_SEND, msg),
    sidecarInterrupt: () => ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT),
    getOverlayState: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE),
    startSession: (request) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_START, request),
    stopSession: (request) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP, request),
    submitSessionPrompt: (request) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT, request),
    listSessions: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST),
    getSessionDetail: (request) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL, request),
    deleteSession: (request) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE, request),
    getSessionMessageImage: (request) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE, request),
    minimizeOverlay: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_MINIMIZE),
    restoreOverlay: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_RESTORE),
    setMinimizedOverlayVariant: (variant) => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, variant),
    clearEndedSession: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_CLEAR_ENDED_SESSION),
    onFrameCaptured: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED, (_event, frame) => cb(frame)),
    onOverlayError: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, (_event, data) => cb(data)),
    onSidecarToken: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, (_event, data) => cb(data)),
    onSidecarAudioStart: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START, (_event, data) => cb(data)),
    onSidecarAudioChunk: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK, (_event, data) => cb(data)),
    onSidecarAudioEnd: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END, (_event, data) => cb(data)),
    onSidecarDone: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE, () => cb()),
    onSidecarError: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, (_event, data) => cb(data)),
    onSidecarStatus: (cb) => ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS, (_event, data) => cb(data)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
};
contextBridge.exposeInMainWorld('api', api);
