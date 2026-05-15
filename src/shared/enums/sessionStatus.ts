export const SESSION_STATUSES = [
  "active",
  "completed",
  "failed",
  "aborted",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];
