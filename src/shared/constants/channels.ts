export const RENDERER_TO_MAIN_CHANNELS = {
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
} as const;

export const MAIN_TO_RENDERER_CHANNELS = {
  OVERLAY_ERROR: "overlay:error",
  SIDECAR_TOKEN: "sidecar:token",
  SIDECAR_AUDIO_START: "sidecar:audio_start",
  SIDECAR_AUDIO_CHUNK: "sidecar:audio_chunk",
  SIDECAR_AUDIO_END: "sidecar:audio_end",
  SIDECAR_DONE: "sidecar:done",
  SIDECAR_ERROR: "sidecar:error",
} as const;
