import type { OverlayState } from '../../shared/types'

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

export function getRouteSyncTarget(
  pathname: string,
  overlayState: OverlayState,
): string | null {
  if (overlayState.endedSessionData !== null) {
    return pathname === ROUTES.sessionEnded ? null : ROUTES.sessionEnded
  }

  if (overlayState.sessionMode === 'active') {
    return pathname === ROUTES.active ? null : ROUTES.active
  }

  if (
    pathname === ROUTES.active ||
    pathname === ROUTES.sessionEnded
  ) {
    return ROUTES.home
  }

  return null
}
