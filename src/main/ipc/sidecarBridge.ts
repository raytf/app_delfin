import { MAIN_TO_RENDERER_CHANNELS } from '../../shared/types'
import { connectToSidecar, onSidecarMessage, onSidecarStatus } from '../sidecar/wsClient'
import type { RegisterIpcHandlersOptions } from './types'

export function registerSidecarBridge(options: RegisterIpcHandlersOptions): void {
  connectToSidecar(options.sidecarWsUrl)

  onSidecarMessage((message) => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return
    }

    switch (message.type) {
      case 'token':
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, { text: message.text ?? '' })
        return
      case 'audio_start':
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START)
        return
      case 'audio_chunk':
        if (message.audio !== undefined) {
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK, { audio: message.audio })
        }
        return
      case 'audio_end':
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END)
        return
      case 'done':
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
        return
      case 'error':
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, { message: message.message ?? 'Unknown error' })
        return
    }
  })

  onSidecarStatus((status) => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS, status)
  })
}
