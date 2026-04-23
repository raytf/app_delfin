/**
 * IngestStatusCard - Visual progress tracking for memory ingest operations
 * 
 * TECHNICAL DECISIONS:
 * 
 * 1. POLLING STRATEGY: Uses setInterval for progress updates (5s interval)
 *    - Simple and reliable for development
 *    - Future: Replace with WebSocket push notifications for real-time updates
 * 
 * 2. MOCK DATA: Currently simulates ingest process for development
 *    - Demonstrates UI flow without requiring full backend implementation
 *    - Production: Will connect to real /memory/ingest/status endpoint
 * 
 * 3. STATE MANAGEMENT: Local component state for simplicity
 *    - Sufficient for current requirements
 *    - Future: May integrate with global state if needed
 * 
 * 4. ERROR HANDLING: Graceful degradation with user-friendly messages
 *    - Network errors show helpful feedback
 *    - Failed jobs display clearly with error context
 * 
 * 5. UI DESIGN: Follows system patterns with consistent styling
 *    - Color-coded status indicators
 *    - Progress bars with percentage display
 *    - Clear success/failure states
 */

import { useEffect, useState } from 'react'
import { MAIN_TO_RENDERER_CHANNELS } from '../../shared/types'

interface IngestJob {
  jobId: string
  sessionId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  createdAt: string
}

interface IngestStatusCardProps {
  onClose: () => void
}

interface WsMemoryProgress {
  type: 'memory_progress'
  job_id: string
  op: 'ingest' | 'lint'
  phase: 'extract' | 'summarize' | 'propose_update' | 'apply' | 'done' | 'error'
  subject?: string
  pct?: number
  message?: string
}

export default function IngestStatusCard({ onClose }: IngestStatusCardProps) {
  const [jobs, setJobs] = useState<IngestJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Handle WebSocket memory progress updates
  useEffect(() => {
    const handleMemoryProgress = (progress: WsMemoryProgress) => {
      if (progress.op === 'ingest') {
        setJobs(prevJobs => {
          const existingJobIndex = prevJobs.findIndex(job => job.jobId === progress.job_id)
          
          if (existingJobIndex >= 0) {
            // Update existing job
            const updatedJobs = [...prevJobs]
            updatedJobs[existingJobIndex] = {
              ...updatedJobs[existingJobIndex],
              status: progress.phase === 'error' ? 'failed' : 
                     progress.phase === 'done' ? 'completed' : 'running',
              progress: Math.round((progress.pct || 0) * 100),
              message: progress.message || getProgressMessage(progress.phase, progress.subject)
            }
            return updatedJobs
          } else {
            // Add new job
            return [{
              jobId: progress.job_id,
              sessionId: progress.subject || progress.job_id,
              status: progress.phase === 'error' ? 'failed' : 'running',
              progress: Math.round((progress.pct || 0) * 100),
              message: progress.message || getProgressMessage(progress.phase, progress.subject),
              createdAt: new Date().toISOString()
            }]
          }
        })
      }
    }
    
    window.api.onSidecarMemoryProgress(handleMemoryProgress)
    
    return () => {
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_MEMORY_PROGRESS)
    }
  }, [])



  const getProgressMessage = (phase: string, subject?: string): string => {
    switch (phase) {
      case 'extract': return subject ? `Extracting from ${subject}...` : 'Extracting entities...'
      case 'summarize': return subject ? `Summarizing ${subject}...` : 'Drafting source page...'
      case 'propose_update': return subject ? `Processing ${subject}...` : 'Processing entities...'
      case 'apply': return subject ? `Applying changes to ${subject}...` : 'Updating index...'
      case 'done': return 'Completed successfully!'
      case 'error': return 'Error occurred'
      default: return 'Processing...'
    }
  }

  // No polling needed - we use WebSocket events now
  useEffect(() => {
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-medium">Ingest Status</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-gray-600">Loading ingest status...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-medium text-red-800">Ingest Error</h3>
          <button
            onClick={onClose}
            className="text-red-400 hover:text-red-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  const handleManualIngest = async () => {
    try {
      // For now, we'll use a hardcoded session ID for testing
      // In production, this would come from user selection or current session
      const testSessionId = 'test-session-' + Date.now()
      
      const result = await window.api.ingestSession(testSessionId)
      console.log('Manual ingest started:', result)
      
      // The WebSocket will handle progress updates automatically
    } catch (error) {
      console.error('Failed to start manual ingest:', error)
      setError(`Failed to start manual ingest: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-medium text-green-800">Ingest Status</h3>
          <button
            onClick={onClose}
            className="text-green-400 hover:text-green-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-green-600">No active ingest jobs. System ready.</p>
        
        <div className="mt-4">
          <p className="text-sm text-gray-500">Waiting for ingest operations...</p>
          <button
            onClick={handleManualIngest}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm transition-colors"
          >
            Start Manual Ingest
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-medium">Active Ingest Jobs</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job.jobId} className="border border-gray-100 rounded p-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-medium">Session {job.sessionId}</div>
                <div className="text-sm text-gray-500">Job: {job.jobId}</div>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                job.status === 'running' ? 'bg-blue-100 text-blue-800' :
                job.status === 'completed' ? 'bg-green-100 text-green-800' :
                job.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {job.status}
              </span>
            </div>
            
            <div className="mb-2">
              <div className="text-sm text-gray-600 mb-1">{job.message}</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    job.status === 'running' ? 'bg-blue-500' :
                    job.status === 'completed' ? 'bg-green-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${job.progress}%` }}
                ></div>
              </div>
              <div className="text-right text-xs text-gray-500 mt-1">
                {job.progress}%
              </div>
            </div>
            
            {job.status === 'completed' && (
              <div className="mt-2 p-2 bg-green-50 rounded text-sm text-green-700">
                ✓ Ingestion completed successfully
              </div>
            )}
            
            {job.status === 'failed' && (
              <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                ✗ Ingestion failed
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}