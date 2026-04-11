import { ipcMain, type BrowserWindow } from 'electron'
import { captureForegroundWindow } from '../capture/captureService'
import { connectToSidecar, onSidecarMessage, onSidecarStatus, sendToSidecar } from '../sidecar/wsClient'
import {
  IPC_CHANNELS,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type OverlayState,
  type SessionMode,
  type SessionPromptRequest,
} from '../../shared/types'

interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  getMainWindow: () => BrowserWindow | null
  sidecarWsUrl: string
  setMinimizedVariant: (variant: MinimizedOverlayVariant) => void
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
  setSessionMode: (mode: SessionMode) => void
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  connectToSidecar(options.sidecarWsUrl)

  onSidecarMessage((message) => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return
    }

    switch (message.type) {
      case 'token':
        mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_TOKEN, { text: message.text ?? '' })
        return
      case 'structured':
        if (message.data !== undefined) {
          mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_STRUCTURED, message.data)
        }
        return
      case 'audio_start':
        mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_AUDIO_START)
        return
      case 'audio_chunk':
        if (message.audio !== undefined) {
          mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_AUDIO_CHUNK, { audio: message.audio })
        }
        return
      case 'audio_end':
        mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_AUDIO_END)
        return
      case 'done':
        mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_DONE)
        return
      case 'error':
        mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_ERROR, { message: message.message ?? 'Unknown error' })
        return
    }
  })

  onSidecarStatus((status) => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(IPC_CHANNELS.SIDECAR_STATUS, status)
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_STATE, async () => options.getOverlayState())

  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    options.setSessionMode('active')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    options.setSessionMode('home')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_MINIMIZE, async () => {
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_RESTORE, async () => {
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, async (_event, variant: MinimizedOverlayVariant) => {
    options.setMinimizedVariant(variant)
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_SUBMIT_PROMPT, async (_event, request: SessionPromptRequest) => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.')
    }

    const text = request.text.trim()

    if (text.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    const frame = await captureForegroundWindow()

    mainWindow.webContents.send(IPC_CHANNELS.FRAME_CAPTURED, frame)

    sendToSidecar({
      image: frame.imageBase64,
      text,
      preset_id: request.presetId,
    })
  })
}
