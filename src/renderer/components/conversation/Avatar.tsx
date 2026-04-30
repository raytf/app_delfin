import { User } from 'lucide-react'
import delfinLogo from '../../assets/logo-alt.png'

export type AvatarVariant = 'user' | 'delfin'

interface AvatarProps {
  variant: AvatarVariant
}

export default function Avatar({ variant }: AvatarProps) {
  if (variant === 'delfin') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]">
        <img
          alt="Delfin"
          className="h-6 w-6 object-contain"
          src={delfinLogo}
        />
      </div>
    )
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-muted)]">
      <User size={16} />
    </div>
  )
}
