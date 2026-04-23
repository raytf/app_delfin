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

export default function IngestStatusCard({ onClose }: IngestStatusCardProps) {
  const [jobs, setJobs] = useState<IngestJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchIngestStatus = async () => {
    try {
      const response = await fetch('http://localhost:8321/memory/ingest/status')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      
      // For now, we'll use mock data since the backend doesn't track jobs yet
      // In production, this would come from the API
      const mockJobs: IngestJob[] = []
      
      // Check if there are any active jobs in localStorage (simulated)
      const activeJobId = localStorage.getItem('activeIngestJob')
      if (activeJobId) {
        mockJobs.push({
          jobId: activeJobId,
          sessionId: activeJobId.replace('job-', ''),
          status: 'running',
          progress: Math.random() * 100,
          message: 'Processing session data...',
          createdAt: new Date().toISOString()
        })
      }
      
      setJobs(mockJobs)
    } catch (err) {
      setError(`Failed to fetch ingest status: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const startMockIngest = async (sessionId: string) => {
    try {
      const jobId = `job-${sessionId}`
      localStorage.setItem('activeIngestJob', jobId)
      
      // Simulate ingest process
      const mockJob: IngestJob = {
        jobId,
        sessionId,
        status: 'running',
        progress: 0,
        message: 'Starting ingestion...',
        createdAt: new Date().toISOString()
      }
      
      setJobs([mockJob])
      
      // Simulate progress updates
      for (let i = 10; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 500))
        setJobs([{
          ...mockJob,
          progress: i,
          message: getProgressMessage(i)
        }])
      }
      
      // Complete the job
      await new Promise(resolve => setTimeout(resolve, 500))
      setJobs([{
        ...mockJob,
        status: 'completed',
        progress: 100,
        message: 'Ingestion completed successfully!'
      }])
      
      localStorage.removeItem('activeIngestJob')
      
    } catch (err) {
      setError(`Ingest failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const getProgressMessage = (progress: number): string => {
    if (progress < 20) return 'Loading session data...'
    if (progress < 40) return 'Extracting entities...'
    if (progress < 60) return 'Drafting source page...'
    if (progress < 80) return 'Processing entities...'
    return 'Finalizing and updating index...'
  }

  useEffect(() => {
    fetchIngestStatus()
    const interval = setInterval(fetchIngestStatus, 5000)
    return () => clearInterval(interval)
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
        
        <div className="mt-4 flex space-x-2">
          <button
            onClick={() => startMockIngest('test-session-123')}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
          >
            Test Ingest
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