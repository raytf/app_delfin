import type { PresetId } from '../../shared/types'

export type PersistedSessionStatus = 'active' | 'completed' | 'failed' | 'aborted'

export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number | null
  status: PersistedSessionStatus
  presetId: PresetId | null
  sessionName: string
  sourceLabel: string | null
  messageCount: number
  lastUpdatedAt: number
}

export interface ConversationMessageRecord {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isVoiceTurn?: boolean
  imagePath?: string
  errorMessage?: string
}

export interface PersistCaptureImageInput {
  imageBase64: string
  messageId: string
  sessionId: string
}

export interface SessionStorage {
  createSession(record: SessionRecord): Promise<void>
  updateSession(sessionId: string, updates: Partial<SessionRecord>): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  appendConversationMessage(message: ConversationMessageRecord): Promise<void>
  replaceConversationMessage(messageId: string, message: ConversationMessageRecord): Promise<void>
  getSession(sessionId: string): Promise<SessionRecord | null>
  getConversation(sessionId: string): Promise<ConversationMessageRecord[]>
  listSessions(): Promise<SessionRecord[]>
  persistCaptureImage(input: PersistCaptureImageInput): Promise<string>
  getCaptureImageDataUrl(relativePath: string): Promise<string>
}
