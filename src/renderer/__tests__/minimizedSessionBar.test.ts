import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MinimizedSessionBar from '../components/MinimizedSessionBar'

const baseProps = {
  errorMessage: null,
  isAudioPlaying: false,
  isMicListening: true,
  isMicMuted: false,
  isSubmitting: false,
  latestResponseText: null,
  onAskAnother: () => undefined,
  onOpen: () => undefined,
  onSetPromptOpen: () => undefined,
  onStop: () => undefined,
  onSubmitPrompt: () => undefined,
  onToggleVadListening: () => undefined,
  vadListeningEnabled: true,
  waveformBars: [0.12, 0.26, 0.18, 0.08],
  waveformState: 'idle' as const,
}

describe('MinimizedSessionBar', () => {
  it('renders the compact chrome in compact mode', () => {
    const markup = renderToStaticMarkup(
      createElement(MinimizedSessionBar, {
        ...baseProps,
        minimizedVariant: 'compact',
      }),
    )

    expect(markup).toContain('animate-pulse')
    expect(markup).toContain('Ask')
  })

  it('renders the prompt input form in prompt-open input mode', () => {
    const markup = renderToStaticMarkup(
      createElement(MinimizedSessionBar, {
        ...baseProps,
        minimizedVariant: 'prompt-input',
      }),
    )

    expect(markup).toContain('Ask Delfin')
    expect(markup).toContain('Collapse')
  })

  it('renders the response and voice actions in prompt-response mode', () => {
    const markup = renderToStaticMarkup(
      createElement(MinimizedSessionBar, {
        ...baseProps,
        latestResponseText: 'Here is the latest response',
        minimizedVariant: 'prompt-response',
      }),
    )

    expect(markup).toContain('Here is the latest response')
    expect(markup).toContain('Ask another')
  })
})