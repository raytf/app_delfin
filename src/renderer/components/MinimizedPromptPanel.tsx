import { useEffect, useLayoutEffect, useState } from 'react'
import SessionPromptComposer from './SessionPromptComposer'
import ThinkingDots from './ThinkingDots'

interface MinimizedPromptPanelProps {
  errorMessage: string | null
  isAudioPlaying: boolean
  isSubmitting: boolean
  isShowingResponse: boolean
  latestResponseText: string | null
  onSubmitPrompt: (text: string) => void
}

export default function MinimizedPromptPanel({
  errorMessage,
  isAudioPlaying,
  isSubmitting,
  isShowingResponse,
  latestResponseText,
  onSubmitPrompt,
}: MinimizedPromptPanelProps) {
  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const shouldShowResponse =
    isShowingResponse || isAudioPlaying || isSubmitting || hasResponseText || errorMessage !== null
  const [isComposing, setIsComposing] = useState(!shouldShowResponse)

  useEffect(() => {
    setIsComposing(!shouldShowResponse)
  }, [shouldShowResponse])

  if (isComposing) {
    return (
      <SessionPromptComposer
        autoFocus
        className="flex items-center gap-2"
        isSubmitting={isSubmitting}
        onSubmitPrompt={onSubmitPrompt}
        placeholder="Ask Delfin"
        submitLabel="Send"
      />
    )
  }

  return (
    <StreamingResponseBody
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      latestResponseText={latestResponseText}
    />
  )
}

interface StreamingResponseBodyProps {
  errorMessage: string | null
  isSubmitting: boolean
  latestResponseText: string | null
}

function StreamingResponseBody({
  errorMessage,
  isSubmitting,
  latestResponseText,
}: StreamingResponseBodyProps) {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)
  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const isThinking = isSubmitting && !hasResponseText && errorMessage === null

  useLayoutEffect(() => {
    if (scrollContainer === null || !hasResponseText) {
      return
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight
  }, [latestResponseText, scrollContainer, hasResponseText])

  return (
    <div className="h-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm">
      <div className="no-drag h-full overflow-y-auto text-sm leading-6 text-[var(--text-primary)]" ref={setScrollContainer}>
        {errorMessage !== null ? (
          <p className="text-[var(--danger)]">{errorMessage}</p>
        ) : isThinking ? (
          <div className="flex h-full items-center justify-center">
            <ThinkingDots label="Thinking" />
          </div>
        ) : hasResponseText ? (
          <p className="whitespace-pre-wrap">{latestResponseText}</p>
        ) : (
          <p className="text-[var(--text-muted)]">Ask about what's on screen to get a response here.</p>
        )}
      </div>
    </div>
  )
}
