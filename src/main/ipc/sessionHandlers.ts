import { ipcMain } from 'electron'
import { captureForegroundWindow } from '../capture/captureService'
import { sendToSidecar } from '../sidecar/wsClient'
import { sessionPromptRequestSchema } from '../../shared/schemas'
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
  type SessionDetailRequest,
  type SessionDeleteRequest,
  type SessionMessageImageRequest,
  type SessionPromptResponse,
  type SessionStartRequest,
  type SessionStopRequest,
} from '../../shared/types'
import { memoryClient } from './memoryClient'
import type { RegisterIpcHandlersOptions } from './types'

export function registerSessionIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_START, async (_event, request: SessionStartRequest) => {
    const sessionName = request.sessionName.trim()

    if (sessionName.length === 0) {
      throw new Error('Session name cannot be empty.')
    }

    await options.sessionPersistence.startSession(sessionName)
    options.setSessionMode('active')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP, async (_event, request: SessionStopRequest) => {
    options.setEndedSessionData(request.endedSessionData)
    await options.sessionPersistence.stopSession('completed')
    options.setSessionMode('home')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('expanded')
    
    // Auto-ingest: Trigger memory ingestion if enabled
    if (process.env.MEMORY_AUTO_INGEST === 'true') {
      try {
        const sessionId = request.endedSessionData.session.id
        console.log(`[Memory] Auto-ingest triggered for session ${sessionId}`)
        
        // Enqueue the session for background ingestion
        await memoryClient.ingestSession(sessionId)
        console.log(`[Memory] Session ${sessionId} enqueued for auto-ingest`)
      } catch (error) {
        console.error(`[Memory] Auto-ingest failed for session ${request.endedSessionData.session.id}:`, error)
      }
    }
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT, async (_event, rawRequest): Promise<SessionPromptResponse> => {
    const request = sessionPromptRequestSchema.parse(rawRequest)
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

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL, async (_event, request: SessionDetailRequest) =>
    options.sessionPersistence.getSessionDetail(request.sessionId),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE, async (_event, request: SessionDeleteRequest) =>
    options.sessionPersistence.deleteSession(request.sessionId),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE, async (_event, request: SessionMessageImageRequest) =>
    options.sessionPersistence.getCaptureImageDataUrl(request.imagePath),
  )

  // Memory client IPC handlers
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_CHECK_HEALTH, async () =>
    memoryClient.checkMemoryHealth(),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_INGEST_SESSION, async (_event, { sessionId }) =>
    memoryClient.ingestSession(sessionId),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_GET_INGEST_STATUS, async () =>
    memoryClient.getIngestStatus(),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_LIST_INGEST_JOBS, async () =>
    memoryClient.listIngestJobs(),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_GET_INGEST_JOB, async (_event, { jobId }) =>
    memoryClient.getIngestJob(jobId),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_CANCEL_INGEST_JOB, async (_event, { jobId }) =>
    memoryClient.cancelIngestJob(jobId),
  )

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MEMORY_CLEAR_COMPLETED_JOBS, async () =>
    memoryClient.clearCompletedJobs(),
  )
}
