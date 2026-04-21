import type { MinimizedOverlayVariant, OverlayMode } from '../../shared/types'

interface MinimizedOverlayContext {
  mode: OverlayMode
}

interface AutoAdvanceMinimizedVariantContext extends MinimizedOverlayContext {
  errorMessage: string | null
  isMinimizedPromptComposing: boolean
  latestResponseText: string | null
}

interface VoiceTurnCollapseContext extends MinimizedOverlayContext {
  errorMessage: string | null
  hasResponseText: boolean
  isAudioPlaying: boolean
  isSubmitting: boolean
}

export function getVoiceTurnRevealVariant({
  mode,
}: MinimizedOverlayContext): MinimizedOverlayVariant | null {
  if (mode !== 'minimized-compact') {
    return null
  }

  return 'prompt-input'
}

export function getAutoAdvanceMinimizedVariant({
  errorMessage,
  isMinimizedPromptComposing,
  latestResponseText,
  mode,
}: AutoAdvanceMinimizedVariantContext): MinimizedOverlayVariant | null {
  if (mode === 'expanded') {
    return null
  }

  const minimizedVariant =
    mode === 'minimized-prompt-input'
      ? 'prompt-input'
      : mode === 'minimized-prompt-response'
        ? 'prompt-response'
        : 'compact'

  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const shouldShowResponse = errorMessage !== null || hasResponseText
  if (minimizedVariant === 'compact' && shouldShowResponse) {
    return 'prompt-response'
  }

  if (minimizedVariant === 'compact') {
    return null
  }

  const nextVariant: MinimizedOverlayVariant = shouldShowResponse ? 'prompt-response' : 'prompt-input'

  return nextVariant === minimizedVariant ? null : nextVariant
}

export function getVoiceTurnCompleteVariant({
  errorMessage,
  hasResponseText,
  isAudioPlaying,
  isSubmitting,
  mode,
}: VoiceTurnCollapseContext): MinimizedOverlayVariant | null {
  const minimizedVariant =
    mode === 'minimized-prompt-response'
      ? 'prompt-response'
      : mode === 'minimized-prompt-input'
        ? 'prompt-input'
        : mode === 'minimized-compact'
          ? 'compact'
          : null

  if (
    minimizedVariant === null ||
    minimizedVariant !== 'prompt-response' ||
    isSubmitting ||
    isAudioPlaying ||
    errorMessage !== null ||
    !hasResponseText
  ) {
    return null
  }

  return 'compact'
}
