import { useState, type FormEvent } from 'react'
import type { MinimizedOverlayVariant } from '../../shared/types'

interface MinimizedSessionBarProps {
  isSubmitting: boolean
  minimizedVariant: MinimizedOverlayVariant
  responseText: string
  onOpen: () => void
  onSetPromptOpen: (isOpen: boolean) => void
  onSubmitPrompt: (text: string) => void
  onStop: () => void
}

function PromptIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 4v16m8-8H4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 4H4v5m11-5h5v5M20 15v5h-5M4 15v5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function EndIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export default function MinimizedSessionBar({
  isSubmitting,
  minimizedVariant,
  responseText,
  onOpen,
  onSetPromptOpen,
  onSubmitPrompt,
  onStop,
}: MinimizedSessionBarProps) {
  const [promptValue, setPromptValue] = useState('')
  const isPromptOpen = minimizedVariant === 'prompt'

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const prompt = promptValue.trim()

    if (prompt.length === 0) {
      return
    }

    onSubmitPrompt(prompt)
  }

  return (
    <div className="drag-region flex min-h-screen items-center justify-center text-white">
      <div
        className={`flex min-h-screen w-full flex-col overflow-hidden border border-slate-800 bg-slate-900/80 shadow-2xl shadow-black/20 ${
          isPromptOpen ? 'p-3' : 'items-center justify-center px-3 py-2'
        }`}
      >
        {isPromptOpen ? (
          <div className="space-y-3">
            <form className="no-drag flex items-center gap-2" onSubmit={handleSubmit}>
              <input
                autoFocus
                className="h-11 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                name="prompt"
                onChange={(event) => {
                  setPromptValue(event.target.value)
                }}
                placeholder="Ask about the current screen"
                type="text"
                value={promptValue}
              />
              <button
                aria-label="Submit prompt"
                className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Sending…' : 'Send'}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Response</p>
              <p className="mt-2 max-h-24 overflow-y-auto text-sm leading-6 text-slate-300">
                {responseText.length > 0 ? responseText : 'Responses will appear here.'}
              </p>
            </div>
          </div>
        ) : null}

        <div className={isPromptOpen ? 'mt-3 flex items-center justify-center gap-2' : 'flex items-center justify-center gap-2'}>
          <button
            aria-label="Start prompt"
            className="no-drag flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
            onClick={() => {
              onSetPromptOpen(!isPromptOpen)
            }}
            type="button"
          >
            <PromptIcon />
          </button>
          <button
            aria-label="Expand session"
            className="no-drag flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 text-slate-200 transition hover:border-slate-500 hover:text-white"
            onClick={onOpen}
            type="button"
          >
            <ExpandIcon />
          </button>
          <button
            aria-label="End session"
            className="no-drag flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-400"
            onClick={onStop}
            type="button"
          >
            <EndIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
