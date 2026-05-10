import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowRight } from 'lucide-react'

interface UserNameModalProps {
  isOpen: boolean
  onSave: (name: string) => void
}

export default function UserNameModal({
  isOpen,
  onSave,
}: UserNameModalProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setName('')
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const trimmedName = name.trim()

    if (trimmedName.length === 0) {
      return
    }

    onSave(trimmedName)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] p-8 shadow-2xl">
        <h2 className="text-center font-display text-xl font-semibold text-[var(--text-primary)]">
          What should I call you?
        </h2>

        <form className="mt-5" onSubmit={handleSubmit}>
          <div className="flex items-center gap-3">
            <input
              autoFocus
              className="h-11 flex-1 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
              onChange={(event) => {
                setName(event.target.value)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Your name"
              type="text"
              value={name}
            />
            <button
              aria-label="Save name"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={name.trim().length === 0}
              type="submit"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
