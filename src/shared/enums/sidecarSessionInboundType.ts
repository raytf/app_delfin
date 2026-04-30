export const SIDECAR_SESSION_INBOUND_TYPES = [
  "token",
  "audio_start",
  "audio_chunk",
  "audio_end",
  "done",
  "error",
] as const;

export type SidecarSessionInboundType =
  (typeof SIDECAR_SESSION_INBOUND_TYPES)[number];
