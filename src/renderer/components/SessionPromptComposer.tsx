import { useState, type FormEvent } from 'react'

interface SessionPromptComposerProps {
  autoFocus?: boolean
  className?: string
  isSubmitting: boolean
  multiline?: boolean
  onSubmitPrompt: (text: string) => void
  placeholder: string
  submitLabel: string
}

export default function SessionPromptComposer({
  autoFocus = false,
  className,
  isSubmitting,
  multiline = false,
  onSubmitPrompt,
  placeholder,
  submitLabel,
}: SessionPromptComposerProps) {
  const [promptValue, setPromptValue] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const trimmedPrompt = promptValue.trim()

    if (trimmedPrompt.length === 0) {
      return
    }

    onSubmitPrompt(trimmedPrompt)
    setPromptValue('')
  }

  return (
    <div className='no-drag'>
      <form className={className} onSubmit={handleSubmit}>
        {multiline ? (
          <textarea
            autoFocus={autoFocus}
            className="h-28 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
            onChange={(event) => {
              setPromptValue(event.target.value)
            }}
            placeholder={placeholder}
            value={promptValue}
          />
        ) : (
          <input
            autoFocus={autoFocus}
            className="h-11 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
            onChange={(event) => {
              setPromptValue(event.target.value)
            }}
            placeholder={placeholder}
            type="text"
            value={promptValue}
          />
        )}

        <button
          className="no-drag rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Sending…' : submitLabel}
        </button>
      </form>
    </div>
  )
}
