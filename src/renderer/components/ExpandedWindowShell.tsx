import type { ReactNode } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { useOverlayState } from '../hooks/useOverlayState'

export default function ExpandedWindowShell() {
  const { overlayState } = useOverlayState()
  const showTitleBar = overlayState.mode === 'expanded'

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      {showTitleBar ? <ExpandedWindowTitleBar /> : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

function ExpandedWindowTitleBar() {
  return (
    <header className="drag-region relative z-20 flex h-10 shrink-0 items-center border-b border-[var(--border-soft)] bg-[var(--bg-overlay)] px-4 backdrop-blur-xl">
      <div className="no-drag flex items-center gap-2">
        <WindowControlButton
          ariaLabel="Close window"
          hoverClassName="hover:border-[#ff5f57]/40 hover:bg-[#ff5f57]"
          onClick={() => {
            void window.api.closeWindow()
          }}
          toneClassName="border-[#ff5f57]/30 bg-[#ff5f57]/85 text-[#6b1b17]"
        >
          <X size={11} strokeWidth={2.5} />
        </WindowControlButton>
        <WindowControlButton
          ariaLabel="Minimize window"
          hoverClassName="hover:border-[#febc2e]/40 hover:bg-[#febc2e]"
          onClick={() => {
            void window.api.minimizeWindow()
          }}
          toneClassName="border-[#febc2e]/35 bg-[#febc2e]/85 text-[#73510d]"
        >
          <Minus size={11} strokeWidth={2.5} />
        </WindowControlButton>
        <WindowControlButton
          ariaLabel="Toggle maximize window"
          hoverClassName="hover:border-[#28c840]/40 hover:bg-[#28c840]"
          onClick={() => {
            void window.api.toggleMaximizeWindow()
          }}
          toneClassName="border-[#28c840]/35 bg-[#28c840]/85 text-[#145a20]"
        >
          <Square size={8} strokeWidth={2.75} />
        </WindowControlButton>
      </div>

      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <span className="font-display text-sm font-semibold tracking-[0.08em] text-[var(--primary)]">
          Delfin
        </span>
      </div>
    </header>
  )
}

interface WindowControlButtonProps {
  ariaLabel: string
  children: ReactNode
  hoverClassName: string
  onClick: () => void
  toneClassName: string
}

function WindowControlButton({
  ariaLabel,
  children,
  hoverClassName,
  onClick,
  toneClassName,
}: WindowControlButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={`window-control-button flex h-3.5 w-3.5 items-center justify-center rounded-full border transition ${toneClassName} ${hoverClassName}`}
      onClick={onClick}
      type="button"
    >
      <span>{children}</span>
      <span className="sr-only">{ariaLabel}</span>
    </button>
  )
}
