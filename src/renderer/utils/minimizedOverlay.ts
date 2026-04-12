import type { MinimizedOverlayVariant, OverlayMode, SessionMode } from '../../shared/types'

interface MinimizedOverlayContext {
  minimizedVariant: MinimizedOverlayVariant
  overlayMode: OverlayMode
  sessionMode: SessionMode
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
  minimizedVariant,
  overlayMode,
  sessionMode,
}: MinimizedOverlayContext): MinimizedOverlayVariant | null {
  if (sessionMode !== 'active' || overlayMode !== 'minimized' || minimizedVariant !== 'compact') {
    return null
  }

  return 'prompt-response'
}

export function getAutoAdvanceMinimizedVariant({
  errorMessage,
  isMinimizedPromptComposing,
  latestResponseText,
  minimizedVariant,
  overlayMode,
  sessionMode,
}: AutoAdvanceMinimizedVariantContext): MinimizedOverlayVariant | null {
  if (sessionMode !== 'active' || overlayMode !== 'minimized' || minimizedVariant === 'compact') {
    return null
  }

  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const shouldShowResponse = !isMinimizedPromptComposing && (errorMessage !== null || hasResponseText)
  const nextVariant: MinimizedOverlayVariant = shouldShowResponse ? 'prompt-response' : 'prompt-input'

  return nextVariant === minimizedVariant ? null : nextVariant
}

export function getVoiceTurnCompleteVariant({
  errorMessage,
  hasResponseText,
  isAudioPlaying,
  isSubmitting,
  minimizedVariant,
  overlayMode,
  sessionMode,
}: VoiceTurnCollapseContext): MinimizedOverlayVariant | null {
  if (
    sessionMode !== 'active' ||
    overlayMode !== 'minimized' ||
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