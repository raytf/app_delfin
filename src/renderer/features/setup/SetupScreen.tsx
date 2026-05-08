import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../navigation/routes'
import { DownloadProgress, ModelAssetId, ModelStatus } from '../../../shared/types'

const ASSET_LABELS: Record<ModelAssetId, string> = {
  'litert-cpp-model': 'Gemma 4 Model (~2 GB)',
  'piper-bin':        'Piper TTS Engine (~30 MB)',
  'piper-voice':      'Voice Model (~65 MB)',
}

export default function SetupScreen() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getModelsStatus().then(setStatus)

    window.api.onModelsStatus((s) => {
      setStatus(s)
      if (s.ready) {
        navigate(ROUTES.home)
      }
    })

    window.api.onModelsDownloadProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.asset]: p }))
    })

    window.api.onModelsDownloadError((e) => {
      setError(e.message)
    })

    return () => {
      window.api.removeAllListeners('models:status')
      window.api.removeAllListeners('models:download-progress')
      window.api.removeAllListeners('models:download-error')
    }
  }, [navigate])

  const handleDownload = () => {
    setError(null)
    window.api.downloadModels({})
  }

  if (!status) return null

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-white bg-slate-900">
      <h1 className="text-2xl font-bold mb-4">First-run Setup</h1>
      <p className="text-slate-400 mb-8 text-center">
        Delfin needs to download the Gemma 4 model and Piper TTS voice assets to run locally.
        This is a one-time download.
      </p>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded mb-6 w-full max-w-md">
          {error}
        </div>
      )}

      <div className="w-full max-w-md space-y-4">
        {status.missing.map((id) => (
          <div key={id} className="bg-slate-800 p-4 rounded border border-slate-700">
            <div className="flex justify-between mb-2 text-sm">
              <span>{ASSET_LABELS[id] ?? id.replace(/-/g, ' ')}</span>
              <span>{progress[id]?.percent ?? 0}%</span>
            </div>
            <div className="w-full bg-slate-700 h-2 rounded overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${progress[id]?.percent ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleDownload}
        disabled={!!status.downloadInProgress}
        className="mt-8 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-full font-semibold transition-colors"
      >
        {status.downloadInProgress ? 'Downloading...' : 'Download Assets'}
      </button>
    </div>
  )
}
