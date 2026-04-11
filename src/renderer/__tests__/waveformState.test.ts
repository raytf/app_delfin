import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import VoiceWaveform from '../components/VoiceWaveform'
import { resolveWaveformPresentation } from '../utils/waveformState'

describe('resolveWaveformPresentation', () => {
  it('prioritises user speech over assistant playback and processing', () => {
    expect(
      resolveWaveformPresentation({
        assistantAudioLevel: 0.5,
        isAssistantSpeaking: true,
        isProcessing: true,
        isUserSpeaking: true,
        userAudioLevel: 0.32,
      }),
    ).toEqual({
      level: 0.32,
      state: 'user',
    })
  })

  it('uses assistant state while AI audio is playing', () => {
    expect(
      resolveWaveformPresentation({
        assistantAudioLevel: 0.04,
        isAssistantSpeaking: true,
        isProcessing: false,
        isUserSpeaking: false,
        userAudioLevel: 0,
      }),
    ).toEqual({
      level: 0.16,
      state: 'assistant',
    })
  })

  it('falls back to processing and idle ambient levels', () => {
    expect(
      resolveWaveformPresentation({
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        isProcessing: true,
        isUserSpeaking: false,
        userAudioLevel: 0,
      }),
    ).toEqual({
      level: 0.18,
      state: 'processing',
    })

    expect(
      resolveWaveformPresentation({
        assistantAudioLevel: 0,
        isAssistantSpeaking: false,
        isProcessing: false,
        isUserSpeaking: false,
        userAudioLevel: 0,
      }),
    ).toEqual({
      level: 0.08,
      state: 'idle',
    })
  })
})

describe('VoiceWaveform', () => {
  it('renders a compact accessible canvas with the current state', () => {
    const markup = renderToStaticMarkup(
      createElement(VoiceWaveform, {
        compact: true,
        label: 'Compact speech waveform in assistant mode',
        level: 0.24,
        state: 'assistant',
      }),
    )

    expect(markup).toContain('data-state="assistant"')
    expect(markup).toContain('aria-label="Compact speech waveform in assistant mode"')
    expect(markup).toContain('h-8')
  })
})