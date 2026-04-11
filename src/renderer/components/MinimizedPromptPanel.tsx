import { useEffect, useState } from 'react'
import type { StructuredResponse } from '../../shared/types'
import SessionPromptComposer from './SessionPromptComposer'

interface MinimizedPromptPanelProps {
  errorMessage: string | null
  isSubmitting: boolean
  isShowingResponse: boolean
  latestStructuredResponse: StructuredResponse | null
  onAskAnother: () => void
  onExpand: () => void
  onSubmitPrompt: (text: string) => void
}

export default function MinimizedPromptPanel({
  errorMessage,
  isSubmitting,
  isShowingResponse,
  latestStructuredResponse,
  onAskAnother,
  onExpand,
  onSubmitPrompt,
}: MinimizedPromptPanelProps) {
  const [isComposing, setIsComposing] = useState(!isShowingResponse)

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
        className="no-drag flex items-center gap-2"
        isSubmitting={isSubmitting}
        onSubmitPrompt={(text) => {
          onSubmitPrompt(text)
        }}
        placeholder="Ask about the current screen"
        submitLabel="Send"
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {isSubmitting ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-slate-500 [animation-delay:0ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-slate-500 [animation-delay:150ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-slate-500 [animation-delay:300ms]" />
        </div>
      ) : (
        <div className="min-h-[12rem] flex-1 rounded-[1.5rem] border border-slate-800 bg-slate-950/45 p-4">
          {errorMessage !== null ? (
            <p className="text-sm leading-6 text-red-300">{errorMessage}</p>
          ) : latestStructuredResponse !== null ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-6 text-slate-200">
                <div className="space-y-3">
                  <div>
                    <p className="mt-1 whitespace-pre-wrap">{latestStructuredResponse.summary}</p>
                  </div>
                  <div>
                    <p className="mt-1 whitespace-pre-wrap">{latestStructuredResponse.answer}</p>
                  </div>
                  <div>
                    <ul className="mt-1 space-y-1">
                      {latestStructuredResponse.key_points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
        ) : (
            <p className="text-sm leading-6 text-slate-400">
              Ask about the current screen to get a response here.
            </p>
          )}
        </div>
      )}

      {!isSubmitting ? (
        <div className="no-drag flex items-center gap-2">
          <button
            className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-cyan-400 hover:text-white"
            onClick={() => {
              onAskAnother()
            }}
            type="button"
          >
            Ask Another
          </button>
          <button
            className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            onClick={onExpand}
            type="button"
          >
            Expand
          </button>
        </div>
      ) : null}
    </div>
  )
}
