import { ipcMain } from 'electron'
import { RENDERER_TO_MAIN_CHANNELS, type MinimizedOverlayVariant } from '../../shared/types'
import type { RegisterIpcHandlersOptions } from './types'

export function registerOverlayIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE, async () => options.getOverlayState())

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_MINIMIZE, async () => {
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_RESTORE, async () => {
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, async (_event, variant: MinimizedOverlayVariant) => {
    options.setMinimizedVariant(variant)
    await options.switchOverlayMode('minimized')
  })
}
