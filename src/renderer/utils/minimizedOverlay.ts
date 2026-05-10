import type { OverlayMode } from '../../shared/types'

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
}: MinimizedOverlayContext): Exclude<OverlayMode, 'expanded'> | null {
  if (mode !== 'minimized-compact') {
    return null
  }

  return 'minimized-prompt-input'
}

export function getAutoAdvanceMinimizedVariant({
  errorMessage,
  isMinimizedPromptComposing,
  latestResponseText,
  mode,
}: AutoAdvanceMinimizedVariantContext): Exclude<OverlayMode, 'expanded'> | null {
  if (mode === 'expanded') {
    return null
  }

  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const shouldShowResponse = errorMessage !== null || hasResponseText
  if (mode === 'minimized-compact' && shouldShowResponse) {
    return 'minimized-prompt-response'
  }

  if (mode === 'minimized-compact') {
    return null
  }

  const nextMode: Exclude<OverlayMode, 'expanded'> = shouldShowResponse
    ? 'minimized-prompt-response'
    : 'minimized-prompt-input'

  return nextMode === mode ? null : nextMode
}

export function getVoiceTurnCompleteVariant({
  errorMessage,
  hasResponseText,
  isAudioPlaying,
  isSubmitting,
  mode,
}: VoiceTurnCollapseContext): Exclude<OverlayMode, 'expanded'> | null {
  if (
    mode !== 'minimized-prompt-response' ||
    isSubmitting ||
    isAudioPlaying ||
    errorMessage !== null ||
    !hasResponseText
  ) {
    return null
  }

  return 'minimized-compact'
}
