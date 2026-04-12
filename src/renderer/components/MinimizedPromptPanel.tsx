import { useEffect, useState } from 'react'
import SessionPromptComposer from './SessionPromptComposer'

interface MinimizedPromptPanelProps {
  errorMessage: string | null
  isSubmitting: boolean
  isShowingResponse: boolean
  latestResponseText: string | null
  onSubmitPrompt: (text: string) => void
}

export default function MinimizedPromptPanel({
  errorMessage,
  isSubmitting,
  isShowingResponse,
  latestResponseText,
  onSubmitPrompt,
}: MinimizedPromptPanelProps) {
  const [isComposing, setIsComposing] = useState(!isShowingResponse)
  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const isLoadingOnly = isSubmitting && !hasResponseText && errorMessage === null

  useEffect(() => {
    if (isSubmitting) {
      setIsComposing(false)
    }
  }, [isSubmitting])

  useEffect(() => {
    setIsComposing(!isShowingResponse)
  }, [isShowingResponse])

  if (isComposing) {
    return (
      <SessionPromptComposer
        autoFocus
        className="flex items-center gap-2"
        isSubmitting={isSubmitting}
        onSubmitPrompt={(text) => {
          onSubmitPrompt(text)
        }}
        placeholder="Ask Delfin"
        submitLabel="Send"
      />
    )
  }

  if (isLoadingOnly) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:0ms]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:300ms]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">Thinking about what you asked…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <StreamingResponseBody
        errorMessage={errorMessage}
        hasResponseText={hasResponseText}
        isSubmitting={isSubmitting}
        latestResponseText={latestResponseText}
      />
    </div>
  )
}

interface StreamingResponseBodyProps {
  errorMessage: string | null
  hasResponseText: boolean
  isSubmitting: boolean
  latestResponseText: string | null
}

function StreamingResponseBody({
  errorMessage,
  hasResponseText,
  isSubmitting,
  latestResponseText,
}: StreamingResponseBodyProps) {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollContainer === null) {
      return
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [latestResponseText, scrollContainer])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm">
      {errorMessage !== null ? (
        <p className="text-sm leading-6 text-[var(--danger)]">{errorMessage}</p>
      ) : latestResponseText !== null && latestResponseText.length > 0 ? (
        <div
          className="no-drag min-h-0 flex-1 overflow-y-auto text-sm leading-6 text-[var(--text-primary)]"
          ref={setScrollContainer}
        >
          <p className="whitespace-pre-wrap break-words">{latestResponseText}</p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          Ask about what's on screen to get a response here.
        </p>
      )}
    </div>
  )
}
