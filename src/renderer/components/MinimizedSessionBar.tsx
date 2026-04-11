interface MinimizedSessionBarProps {
  onOpen: () => void
  onStop: () => void
}

export default function MinimizedSessionBar({ onOpen, onStop }: MinimizedSessionBarProps) {
  return (
    <div className="flex h-screen items-center justify-between bg-slate-950 px-4 text-white">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Session Active</p>
        <p className="text-sm text-slate-300">Overlay ready</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label="Expand session"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-lg text-slate-200 transition hover:border-slate-500 hover:text-white"
          onClick={onOpen}
          type="button"
        >
          +
        </button>
        <button
          aria-label="End session"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-lg font-medium text-white transition hover:bg-red-400"
          onClick={onStop}
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  )
}
