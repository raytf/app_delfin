import { registerOverlayIpcHandlers } from './overlayHandlers'
import { registerSessionIpcHandlers } from './sessionHandlers'
import { registerSidecarBridge } from './sidecarBridge'
import type { RegisterIpcHandlersOptions } from './types'

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  registerSidecarBridge(options)
  registerOverlayIpcHandlers(options)
  registerSessionIpcHandlers(options)
}
