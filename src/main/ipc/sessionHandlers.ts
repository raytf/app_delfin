import { ipcMain } from 'electron'
import { captureForegroundWindow } from '../capture/captureService'
import { sendToSidecar } from '../sidecar/wsClient'
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
  type SessionMessageImageRequest,
  type SessionPromptRequest,
  type SessionPromptResponse,
} from '../../shared/types'
import type { RegisterIpcHandlersOptions } from './types'

export function registerSessionIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_START, async () => {
    await options.sessionPersistence.startSession()
    options.setSessionMode('active')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP, async () => {
    await options.sessionPersistence.stopSession('completed')
    options.setSessionMode('home')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT, async (_event, request: SessionPromptRequest): Promise<SessionPromptResponse> => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.')
    }

    const text = request.text.trim()
    const isVoiceTurn = Boolean(request.audio)

    // Allow submission when audio is present even if text is the voice constant.
    // Block only genuinely empty, non-audio submissions.
    if (text.length === 0 && !isVoiceTurn) {
      throw new Error('Prompt cannot be empty.')
    }

    const frame = await captureForegroundWindow()

    mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED, frame)

    const imagePath = await options.sessionPersistence.recordUserPrompt({
      imageBase64: frame.imageBase64,
      messageId: request.messageId,
      text,
      presetId: request.presetId,
      sourceLabel: frame.sourceLabel,
    })

    try {
      sendToSidecar({
        image: frame.imageBase64,
        text,
        preset_id: request.presetId,
        ...(request.audio !== undefined ? { audio: request.audio } : {}),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send prompt to sidecar.'
      await options.sessionPersistence.failAssistantResponse(errorMessage)
      throw error
    }

    return {
      imagePath,
      messageId: request.messageId,
    }
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST, async () => options.sessionPersistence.listSessions())

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE, async (_event, request: SessionMessageImageRequest) =>
    options.sessionPersistence.getCaptureImageDataUrl(request.imagePath),
  )
}
