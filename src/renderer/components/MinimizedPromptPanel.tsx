import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import SessionPromptComposer from './SessionPromptComposer'

interface MinimizedPromptPanelProps {
  errorMessage: string | null
  isSubmitting: boolean
  isShowingResponse: boolean
  latestResponseText: string | null
  onAskAnother: () => void
  onExpand: () => void
  onSubmitPrompt: (text: string) => void
}

export default function MinimizedPromptPanel({
  errorMessage,
  isSubmitting,
  isShowingResponse,
  latestResponseText,
  onAskAnother,
  onExpand,
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
      <div className="flex h-full min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:0ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:300ms]" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StreamingResponseBody
        errorMessage={errorMessage}
        hasResponseText={hasResponseText}
        isSubmitting={isSubmitting}
        latestResponseText={latestResponseText}
      />

      {!isSubmitting || hasResponseText ? (
        <div className="no-drag flex items-center gap-2">
          <button
            className="flex-1 cursor-pointer rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            onClick={() => {
              onAskAnother()
            }}
            type="button"
          >
            Ask Another
          </button>
          <button
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
            onClick={onExpand}
            type="button"
          >
            <Maximize2 size={16} />
            Expand
          </button>
        </div>
      ) : null}
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

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth',
    })
  }, [latestResponseText, scrollContainer])

  return (
    <div className="min-h-[12rem] flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm">
      {errorMessage !== null ? (
        <p className="text-sm leading-6 text-[var(--danger)]">{errorMessage}</p>
      ) : latestResponseText !== null && latestResponseText.length > 0 ? (
        <div className="no-drag flex h-full min-h-0 flex-col">
          <div
            className="min-h-0 flex-1 overflow-y-auto text-sm leading-6 text-[var(--text-primary)]"
            ref={setScrollContainer}
          >
            <p className="whitespace-pre-wrap">{latestResponseText}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          Ask about what's on screen to get a response here.
        </p>
      )}
    </div>
  )
}
