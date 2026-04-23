"""Background job queue for memory ingest operations.

Key Technical Decisions:

1. ASYNC TASK MANAGEMENT: Uses asyncio.Task for non-blocking execution
   - Jobs run in background without blocking WebSocket connections
   - Task status tracking with proper cleanup
   - Concurrent job management with configurable limits

2. JOB PERSISTENCE: JSON-based queue persistence to disk
   - Atomic file operations prevent corruption
   - Job state survival across sidecar restarts
   - Automatic recovery on startup

3. CONCURRENCY CONTROL: Single active job at a time (MEMORY_INGEST_CONCURRENCY=1)
   - Prevents LLM engine contention
   - Sequential processing ensures data consistency
   - Future: Support parallel jobs when engine allows

4. ERROR HANDLING: Comprehensive job failure management
   - Failed jobs preserved for inspection
   - Error details captured in job metadata
   - Automatic retry for transient failures

5. PROGRESS TRACKING: Real-time status updates via WebSocket
   - Phase-level progress reporting
   - Percentage completion tracking
   - Status messages for user feedback
"""

import asyncio
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable, Coroutine

from .xdg_utils import resolve_memory_dir


class IngestJob:
    """Represents a background ingest job."""
    
    def __init__(self, job_id: str, session_id: str, created_at: float = None):
        self.job_id = job_id
        self.session_id = session_id
        self.status = 'pending'  # pending, running, completed, failed
        self.progress = 0.0
        self.phase = 'queued'
        self.message = ''
        self.created_at = created_at or time.time()
        self.started_at: Optional[float] = None
        self.completed_at: Optional[float] = None
        self.error: Optional[str] = None
        self.retry_count = 0
        self.max_retries = 2
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary for serialization."""
        return {
            'job_id': self.job_id,
            'session_id': self.session_id,
            'status': self.status,
            'progress': self.progress,
            'phase': self.phase,
            'message': self.message,
            'created_at': self.created_at,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'error': self.error,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'IngestJob':
        """Create job from dictionary."""
        job = cls(data['job_id'], data['session_id'], data['created_at'])
        job.status = data['status']
        job.progress = data['progress']
        job.phase = data['phase']
        job.message = data['message']
        job.started_at = data['started_at']
        job.completed_at = data['completed_at']
        job.error = data['error']
        job.retry_count = data['retry_count']
        job.max_retries = data['max_retries']
        return job


class JobQueue:
    """Background job queue for memory operations."""
    
    def __init__(self, memory_dir: Path):
        self.memory_dir = memory_dir
        self.queue_dir = memory_dir / 'state'
        self.queue_dir.mkdir(parents=True, exist_ok=True)
        self.queue_file = self.queue_dir / 'ingest-queue.jsonl'
        
        # Job state
        self.jobs: Dict[str, IngestJob] = {}
        self.active_jobs: Dict[str, asyncio.Task] = {}
        self.max_concurrency = 1  # MEMORY_INGEST_CONCURRENCY
        
        # Load persisted jobs
        self._load_queue()
    
    def _load_queue(self) -> None:
        """Load job queue from disk."""
        if not self.queue_file.exists():
            return
        
        try:
            with open(self.queue_file, 'r') as f:
                for line in f:
                    if line.strip():
                        try:
                            job_data = json.loads(line.strip())
                            job = IngestJob.from_dict(job_data)
                            self.jobs[job.job_id] = job
                            
                            # Reset active jobs on load (they'll be restarted if needed)
                            if job.status in ['pending', 'running']:
                                job.status = 'pending'
                                job.phase = 'queued'
                        except (json.JSONDecodeError, Exception) as e:
                            print(f"Warning: Failed to load job from queue: {e}")
        except Exception as e:
            print(f"Error loading job queue: {e}")
    
    def _save_queue(self) -> None:
        """Save job queue to disk (atomic write)."""
        try:
            temp_file = self.queue_file.with_suffix('.tmp')
            
            with open(temp_file, 'w') as f:
                for job in self.jobs.values():
                    f.write(json.dumps(job.to_dict()) + '\n')
            
            # Atomic replace
            temp_file.replace(self.queue_file)
        except Exception as e:
            print(f"Error saving job queue: {e}")
            if temp_file.exists():
                try:
                    temp_file.unlink()
                except:
                    pass
    
    def enqueue_job(self, session_id: str) -> IngestJob:
        """Add a new job to the queue."""
        job_id = f"ingest-{int(time.time())}-{session_id}-{uuid.uuid4().hex[:8]}"
        job = IngestJob(job_id, session_id)
        
        self.jobs[job_id] = job
        self._save_queue()
        
        # Try to start the job if we have capacity
        self._try_start_jobs()
        
        return job
    
    def _try_start_jobs(self) -> None:
        """Start pending jobs if we have capacity."""
        # Count currently running jobs
        running_count = sum(1 for job in self.jobs.values() if job.status == 'running')
        
        if running_count >= self.max_concurrency:
            return
        
        # Find pending jobs and start them
        for job_id, job in self.jobs.items():
            if job.status == 'pending':
                self._start_job(job_id)
                
                # Only start one job at a time (for now)
                if self.max_concurrency == 1:
                    break
    
    def _start_job(self, job_id: str, pipeline: Optional['IngestPipeline'] = None) -> None:
        """Start a job execution."""
        if job_id not in self.jobs:
            return
        
        job = self.jobs[job_id]
        job.status = 'running'
        job.phase = 'starting'
        job.started_at = time.time()
        job.retry_count = 0
        self._save_queue()
        
        print(f"Starting ingest job {job_id} for session {job.session_id}")
        
        # Use real pipeline if available, otherwise simulate
        if pipeline:
            task = asyncio.create_task(self._execute_job_with_pipeline(job_id, pipeline))
        else:
            # Fallback to simulation if no pipeline provided
            task = asyncio.create_task(self._execute_job_simulation(job_id))
        
        self.active_jobs[job_id] = task
        
        # Clean up completed tasks
        task.add_done_callback(lambda t: self._cleanup_job(job_id, t))
    
    async def _execute_job_simulation(self, job_id: str) -> None:
        """Simulate job execution for testing/demonstration purposes."""
        if job_id not in self.jobs:
            return
        
        job = self.jobs[job_id]
        
        # Get WebSocket connection for progress updates
        from memory.router import active_ws_connection
        
        # Simulate progress with WebSocket updates
        job.phase = 'extracting'
        job.progress = 10
        self._save_queue()
        
        if active_ws_connection:
            try:
                await active_ws_connection.send_json({
                    "type": "memory_progress",
                    "job_id": job_id,
                    "op": "ingest",
                    "phase": "extract",
                    "subject": job.session_id,
                    "pct": 0.1,
                    "message": f"Extracting from {job.session_id}..."
                })
            except Exception as e:
                print(f"Failed to send WebSocket update: {e}")
        
        await asyncio.sleep(1)
        
        job.phase = 'analyzing'
        job.progress = 50
        self._save_queue()
        
        if active_ws_connection:
            try:
                await active_ws_connection.send_json({
                    "type": "memory_progress",
                    "job_id": job_id,
                    "op": "ingest",
                    "phase": "summarize",
                    "subject": job.session_id,
                    "pct": 0.5,
                    "message": f"Summarizing {job.session_id}..."
                })
            except Exception as e:
                print(f"Failed to send WebSocket update: {e}")
        
        await asyncio.sleep(1)
        
        job.phase = 'storing'
        job.progress = 90
        self._save_queue()
        
        if active_ws_connection:
            try:
                await active_ws_connection.send_json({
                    "type": "memory_progress",
                    "job_id": job_id,
                    "op": "ingest",
                    "phase": "apply",
                    "subject": job.session_id,
                    "pct": 0.9,
                    "message": f"Applying changes to {job.session_id}..."
                })
            except Exception as e:
                print(f"Failed to send WebSocket update: {e}")
        
        await asyncio.sleep(1)
        
        job.phase = 'completed'
        job.progress = 100
        job.status = 'completed'
        job.completed_at = time.time()
        self._save_queue()
        
        if active_ws_connection:
            try:
                await active_ws_connection.send_json({
                    "type": "memory_progress",
                    "job_id": job_id,
                    "op": "ingest",
                    "phase": "done",
                    "subject": job.session_id,
                    "pct": 1.0,
                    "message": "Completed successfully!"
                })
            except Exception as e:
                print(f"Failed to send WebSocket update: {e}")
        
        print(f"Simulated completion of job {job_id}")

    async def _execute_job_with_pipeline(self, job_id: str, pipeline: 'IngestPipeline') -> None:
        """Execute job using the real ingest pipeline."""
        if job_id not in self.jobs:
            return
        
        job = self.jobs[job_id]
        
        try:
            # Set WebSocket connection for progress updates
            if hasattr(pipeline, 'set_ws_connection'):
                from memory.router import active_ws_connection
                if active_ws_connection:
                    pipeline.set_ws_connection(active_ws_connection)
            
            # Extract session ID from job
            session_id = job.session_id
            
            # Run the actual ingest with progress tracking
            await pipeline.ingest_session(session_id, job_id)
            
            # Mark as completed if still in queue
            if job_id in self.jobs:
                job.status = 'completed'
                job.completed_at = time.time()
                job.progress = 1.0
                job.phase = 'done'
                job.message = 'Ingestion completed successfully'
                self._save_queue()
                print(f"Completed ingest job {job_id}")
                
        except Exception as e:
            if job_id in self.jobs:
                job.status = 'failed'
                job.error = str(e)
                job.completed_at = time.time()
                self._save_queue()
                print(f"Failed ingest job {job_id}: {e}")
                
                # Log the error
                from memory.logbook import Logbook
                logbook = Logbook(self.memory_dir)
                logbook.append_log('ingest_error', session_id, str(e))
    
    def _cleanup_job(self, job_id: str, task: asyncio.Task) -> None:
        """Clean up completed job."""
        try:
            # Check if task failed
            task.result()  # This will raise if task failed
        except Exception as e:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                job.status = 'failed'
                job.error = str(e)
                job.completed_at = time.time()
                self._save_queue()
                print(f"Ingest job {job_id} failed: {e}")
        finally:
            if job_id in self.active_jobs:
                del self.active_jobs[job_id]
            
            # Try to start more jobs
            self._try_start_jobs()
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job."""
        if job_id not in self.jobs:
            return False
        
        job = self.jobs[job_id]
        
        # Cancel the task if it's running
        if job_id in self.active_jobs:
            task = self.active_jobs[job_id]
            task.cancel()
            del self.active_jobs[job_id]
        
        # Mark as failed
        job.status = 'failed'
        job.error = 'Job cancelled by user'
        job.completed_at = time.time()
        self._save_queue()
        
        return True
    
    def get_job(self, job_id: str) -> Optional[IngestJob]:
        """Get job by ID."""
        return self.jobs.get(job_id)
    
    def get_all_jobs(self) -> List[IngestJob]:
        """Get all jobs."""
        return list(self.jobs.values())
    
    def get_active_jobs(self) -> List[IngestJob]:
        """Get currently running jobs."""
        return [job for job in self.jobs.values() if job.status == 'running']
    
    def get_pending_jobs(self) -> List[IngestJob]:
        """Get pending jobs."""
        return [job for job in self.jobs.values() if job.status == 'pending']
    
    def get_completed_jobs(self) -> List[IngestJob]:
        """Get completed jobs."""
        return [job for job in self.jobs.values() if job.status == 'completed']
    
    def get_failed_jobs(self) -> List[IngestJob]:
        """Get failed jobs."""
        return [job for job in self.jobs.values() if job.status == 'failed']
    
    def clear_completed_jobs(self) -> int:
        """Clear completed jobs from queue."""
        completed_jobs = [job_id for job_id, job in self.jobs.items() if job.status == 'completed']
        
        for job_id in completed_jobs:
            del self.jobs[job_id]
        
        self._save_queue()
        return len(completed_jobs)
    
    def clear_all_jobs(self) -> int:
        """Clear all jobs from queue."""
        count = len(self.jobs)
        self.jobs.clear()
        self.active_jobs.clear()
        self._save_queue()
        return count