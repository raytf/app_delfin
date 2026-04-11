import type { PresetId, StructuredResponse } from '../../shared/types'
import type {
  ConversationMessageRecord,
  PersistedSessionStatus,
  SessionRecord,
  SessionStorage,
} from '../storage/types'

interface ActiveAssistantDraft {
  id: string
  sessionId: string
  content: string
  timestamp: number
  structuredData?: StructuredResponse
  errorMessage?: string
}

type FinalSessionStatus = Exclude<PersistedSessionStatus, 'active'>

export class SessionPersistenceService {
  private activeSessionId: string | null = null
  private activeAssistantDraft: ActiveAssistantDraft | null = null
  private messageCount = 0
  private pendingFinalStatus: FinalSessionStatus = 'completed'

  constructor(private readonly storage: SessionStorage) {}

  async startSession(): Promise<string> {
    const now = Date.now()
    const sessionId = crypto.randomUUID()
    const sessionRecord: SessionRecord = {
      id: sessionId,
      startedAt: now,
      endedAt: null,
      status: 'active',
      presetId: null,
      sourceLabel: null,
      messageCount: 0,
      lastUpdatedAt: now,
    }

    await this.storage.createSession(sessionRecord)
    this.activeSessionId = sessionId
    this.activeAssistantDraft = null
    this.messageCount = 0
    this.pendingFinalStatus = 'completed'
    return sessionId
  }

  async recordUserPrompt(input: { text: string; presetId: PresetId; sourceLabel: string | null }): Promise<void> {
    const sessionId = this.requireActiveSessionId()
    const timestamp = Date.now()

    const userMessage: ConversationMessageRecord = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content: input.text,
      timestamp,
    }

    await this.storage.appendConversationMessage(userMessage)
    this.messageCount += 1

    const assistantDraft: ActiveAssistantDraft = {
      id: crypto.randomUUID(),
      sessionId,
      content: '',
      timestamp,
    }

    await this.storage.appendConversationMessage({
      id: assistantDraft.id,
      sessionId,
      role: 'assistant',
      content: '',
      timestamp,
    })

    this.messageCount += 1
    this.activeAssistantDraft = assistantDraft
    this.pendingFinalStatus = 'completed'

    await this.storage.updateSession(sessionId, {
      presetId: input.presetId,
      sourceLabel: input.sourceLabel,
      messageCount: this.messageCount,
      lastUpdatedAt: timestamp,
    })
  }

  async appendAssistantToken(text: string): Promise<void> {
    if (text.length === 0 || this.activeAssistantDraft === null) {
      return
    }

    this.activeAssistantDraft = {
      ...this.activeAssistantDraft,
      content: this.activeAssistantDraft.content + text,
    }
    await this.persistAssistantDraft(Date.now())
  }

  async setAssistantStructured(data: StructuredResponse): Promise<void> {
    if (this.activeAssistantDraft === null) {
      return
    }

    this.activeAssistantDraft = {
      ...this.activeAssistantDraft,
      content: data.answer,
      structuredData: data,
      errorMessage: undefined,
    }

    await this.persistAssistantDraft(Date.now())
  }

  async failAssistantResponse(message: string): Promise<void> {
    if (this.activeAssistantDraft === null) {
      return
    }

    const timestamp = Date.now()
    this.pendingFinalStatus = 'failed'
    this.activeAssistantDraft = {
      ...this.activeAssistantDraft,
      content: message,
      errorMessage: message,
    }

    await this.persistAssistantDraft(timestamp)
  }

  async finishAssistantResponse(): Promise<void> {
    if (this.activeAssistantDraft === null || this.activeSessionId === null) {
      return
    }

    await this.storage.updateSession(this.activeSessionId, {
      messageCount: this.messageCount,
      lastUpdatedAt: Date.now(),
    })
    this.activeAssistantDraft = null
  }

  async stopSession(status: FinalSessionStatus = 'completed'): Promise<void> {
    if (this.activeSessionId === null) {
      return
    }

    const now = Date.now()
    const finalStatus = this.pendingFinalStatus === 'failed' ? 'failed' : status

    await this.storage.updateSession(this.activeSessionId, {
      endedAt: now,
      status: finalStatus,
      messageCount: this.messageCount,
      lastUpdatedAt: now,
    })

    this.activeSessionId = null
    this.activeAssistantDraft = null
    this.messageCount = 0
    this.pendingFinalStatus = 'completed'
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.storage.listSessions()
  }

  private async persistAssistantDraft(timestamp: number): Promise<void> {
    const draft = this.activeAssistantDraft

    if (draft === null) {
      return
    }

    await this.storage.replaceConversationMessage(draft.id, {
      id: draft.id,
      sessionId: draft.sessionId,
      role: 'assistant',
      content: draft.content,
      timestamp: draft.timestamp,
      structuredData: draft.structuredData,
      errorMessage: draft.errorMessage,
    })

    await this.storage.updateSession(draft.sessionId, {
      messageCount: this.messageCount,
      lastUpdatedAt: timestamp,
    })
  }

  private requireActiveSessionId(): string {
    if (this.activeSessionId === null) {
      throw new Error('Cannot persist prompt without an active session.')
    }

    return this.activeSessionId
  }
}
