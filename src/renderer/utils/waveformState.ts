export type WaveformVisualState = 'idle' | 'processing' | 'user' | 'assistant'

export interface WaveformPresentationInput {
  assistantAudioLevel: number
  isAssistantSpeaking: boolean
  isProcessing: boolean
  isUserSpeaking: boolean
  userAudioLevel: number
}

export interface WaveformPresentation {
  level: number
  state: WaveformVisualState
}

export function resolveWaveformPresentation(input: WaveformPresentationInput): WaveformPresentation {
  if (input.isUserSpeaking) {
    return {
      state: 'user',
      level: clampLevel(Math.max(input.userAudioLevel, 0.14)),
    }
  }

  if (input.isAssistantSpeaking) {
    return {
      state: 'assistant',
      level: clampLevel(Math.max(input.assistantAudioLevel, 0.16)),
    }
  }

  if (input.isProcessing) {
    return {
      state: 'processing',
      level: 0.18,
    }
  }

  return {
    state: 'idle',
    level: 0.08,
  }
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(1, level))
}