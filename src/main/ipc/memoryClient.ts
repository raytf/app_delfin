/**
 * Memory client for interacting with the sidecar memory system.
 * 
 * TECHNICAL DECISIONS:
 * 
 * 1. REST API: Uses fetch-based HTTP calls to sidecar memory endpoints
 *    - Simple and reliable for development
 *    - Future: May switch to WebSocket for real-time updates
 * 
 * 2. Error Handling: Comprehensive error handling with user-friendly messages
 *    - Network errors show helpful feedback
 *    - Failed operations log detailed error information
 * 
 * 3. Type Safety: Full TypeScript typing throughout the client
 *    - Proper request/response interfaces
 *    - Runtime validation where needed
 * 
 * 4. Configuration: Environment-based sidecar URL configuration
 *    - Respects SIDECAR_URL environment variable
 *    - Falls back to default localhost:8321
 */

import { type MemoryHealth } from '../../shared/types'

const SIDECAR_BASE_URL = process.env.SIDECAR_URL || 'http://localhost:8321'

/**
 * Check memory system health and availability
 */
export async function checkMemoryHealth(): Promise<MemoryHealth> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Memory health check failed: ${response.status} ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('[Memory] Health check failed:', error)
    throw new Error(`Failed to check memory health: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Enqueue a session for background ingestion
 */
export async function ingestSession(sessionId: string): Promise<{
  success: boolean
  message: string
  session_id: string
  job_id: string
  background: boolean
}> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/ingest/session?session_id=${encodeURIComponent(sessionId)}&background=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to enqueue session: ${response.status} ${JSON.stringify(errorData)}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error(`[Memory] Failed to enqueue session ${sessionId}:`, error)
    throw new Error(`Failed to enqueue session: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get current ingest status and queue information
 */
export async function getIngestStatus(): Promise<{
  active_jobs: number
  pending_jobs: number
  completed_jobs: number
  failed_jobs: number
  last_completed: string | null
  status: string
}> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/ingest/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get ingest status: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('[Memory] Failed to get ingest status:', error)
    throw new Error(`Failed to get ingest status: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * List all ingest jobs
 */
export async function listIngestJobs(): Promise<{
  jobs: Array<{
    job_id: string
    session_id: string
    status: string
    progress: number
    phase: string
    message: string
    created_at: number
    started_at: number | null
    completed_at: number | null
    error: string | null
  }>
}> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/ingest/jobs`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('[Memory] Failed to list jobs:', error)
    throw new Error(`Failed to list jobs: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get details about a specific ingest job
 */
export async function getIngestJob(jobId: string): Promise<{
  job_id: string
  session_id: string
  status: string
  progress: number
  phase: string
  message: string
  created_at: number
  started_at: number | null
  completed_at: number | null
  error: string | null
  retry_count: number
  max_retries: number
}> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/ingest/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get job: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error(`[Memory] Failed to get job ${jobId}:`, error)
    throw new Error(`Failed to get job: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Cancel a running ingest job
 */
export async function cancelIngestJob(jobId: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/ingest/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to cancel job: ${response.status} ${JSON.stringify(errorData)}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error(`[Memory] Failed to cancel job ${jobId}:`, error)
    throw new Error(`Failed to cancel job: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Clear completed jobs from the queue
 */
export async function clearCompletedJobs(): Promise<{
  success: boolean
  message: string
  cleared_count: number
}> {
  try {
    const response = await fetch(`${SIDECAR_BASE_URL}/memory/ingest/jobs/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to clear jobs: ${response.status} ${JSON.stringify(errorData)}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('[Memory] Failed to clear completed jobs:', error)
    throw new Error(`Failed to clear completed jobs: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Export combined client object
export const memoryClient = {
  checkMemoryHealth,
  ingestSession,
  getIngestStatus,
  listIngestJobs,
  getIngestJob,
  cancelIngestJob,
  clearCompletedJobs,
}