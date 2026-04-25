export const ROUTES = {
  active: '/active',
  home: '/',
  sessionEnded: '/session-ended',
  sessions: '/sessions',
} as const

export function buildSessionDetailPath(sessionId: string): `/sessions/${string}` {
  return `${ROUTES.sessions}/${encodeURIComponent(sessionId)}`
}

export function isSessionDetailPath(pathname: string): boolean {
  return /^\/sessions\/[^/]+$/.test(pathname)
}
