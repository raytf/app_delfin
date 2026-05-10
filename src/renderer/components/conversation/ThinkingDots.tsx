interface ThinkingDotsProps {
  label?: string
  size?: 'sm' | 'md'
}

export default function ThinkingDots({ label, size = 'md' }: ThinkingDotsProps) {
  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5'

  return (
    <div className="flex flex-col items-center gap-2 text-center" aria-label={label ?? 'Thinking'}>
      <div className="flex items-center gap-1.5">
        <span className={`${dim} rounded-full bg-[var(--primary)] [animation:shimmer_1.2s_ease-in-out_infinite] [animation-delay:0ms]`} />
        <span className={`${dim} rounded-full bg-[var(--accent)] [animation:shimmer_1.2s_ease-in-out_infinite] [animation-delay:180ms]`} />
        <span className={`${dim} rounded-full bg-[var(--primary)] [animation:shimmer_1.2s_ease-in-out_infinite] [animation-delay:360ms]`} />
      </div>
      {label !== undefined ? (
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      ) : null}
    </div>
  )
}
