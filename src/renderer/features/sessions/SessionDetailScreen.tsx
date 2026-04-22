import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { SessionDetail } from '../../../shared/types'
import PastSessionView from '../../components/PastSessionView'
import { ROUTES } from '../../navigation/routes'

function SessionDetailLoadingState() {
  return (
    <div className="ocean-gradient flex min-h-screen items-center justify-center px-8 py-12 text-[var(--text-secondary)]">
      Loading session...
    </div>
  )
}

export default function SessionDetailScreen() {
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const navigate = useNavigate()
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId ?? null

  useEffect(() => {
    if (sessionId === null) {
      return
    }

    let cancelled = false

    void window.api.getSessionDetail({ sessionId }).then((nextDetail) => {
      if (!cancelled) {
        setDetail(nextDetail)
      }
    })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  const handleDelete = useCallback(async (): Promise<void> => {
    if (sessionId === null) {
      return
    }

    await window.api.deleteSession({ sessionId })
    navigate(ROUTES.sessions, { replace: true })
  }, [navigate, sessionId])

  if (sessionId === null || detail === null) {
    return <SessionDetailLoadingState />
  }

  return (
    <PastSessionView
      messages={detail.messages}
      onBack={() => {
        navigate(-1) 
      }}
      onDelete={() => {
        void handleDelete()
      }}
      session={detail.session}
    />
  )
}
