export const OVERLAY_MODES = [
  "expanded",
  "minimized-compact",
  "minimized-prompt-input",
  "minimized-prompt-response",
] as const;

export type OverlayMode = (typeof OVERLAY_MODES)[number];
