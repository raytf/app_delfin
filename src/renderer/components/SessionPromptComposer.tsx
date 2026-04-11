import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'

interface SessionPromptComposerProps {
  autoFocus?: boolean
  className?: string
  isSubmitting: boolean
  onSubmitPrompt: (text: string) => void
  placeholder: string
  submitLabel: string
}

export default function SessionPromptComposer({
  autoFocus = false,
  className,
  isSubmitting,
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
    <div className="no-drag">
      <form className={className} onSubmit={handleSubmit}>
        <input
          autoFocus={autoFocus}
          className="h-11 flex-1 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
          onChange={(event) => {
            setPromptValue(event.target.value)
          }}
          placeholder={placeholder}
          type="text"
          value={promptValue}
        />

        <button
          className="no-drag flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
          aria-label={submitLabel}
        >
          {isSubmitting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  )
}
