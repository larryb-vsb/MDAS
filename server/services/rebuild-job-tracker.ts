/**
 * Rebuild Job Tracker
 * 
 * In-memory tracking service for cache rebuild jobs.
 * Tracks active rebuilds to prevent duplicates and provide real-time status updates.
 */

export interface RebuildJob {
  jobId: string;
  year: number;
  month: number;
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  error?: string;
  triggeredBy?: string;
  triggeredByUser?: string;
}

class RebuildJobTracker {
  private jobs: Map<string, RebuildJob> = new Map();
  private readonly JOB_RETENTION_MS = 5 * 60 * 1000; // Keep completed jobs for 5 minutes

  /**
   * Get unique key for a month
   */
  private getMonthKey(year: number, month: number): string {
    return `${year}-${month.toString().padStart(2, '0')}`;
  }

  /**
   * Start tracking a new rebuild job
   */
  startJob(jobId: string, year: number, month: number, triggeredBy?: string, triggeredByUser?: string): void {
    const monthKey = this.getMonthKey(year, month);
    
    const job: RebuildJob = {
      jobId,
      year,
      month,
      status: 'running',
      startTime: Date.now(),
      triggeredBy,
      triggeredByUser
    };

    this.jobs.set(monthKey, job);
    console.log(`[REBUILD-TRACKER] Started job ${jobId} for ${monthKey}`);
  }

  /**
   * Mark a job as complete
   */
  completeJob(year: number, month: number): void {
    const monthKey = this.getMonthKey(year, month);
    const job = this.jobs.get(monthKey);

    if (job) {
      job.status = 'complete';
      job.endTime = Date.now();
      console.log(`[REBUILD-TRACKER] Completed job ${job.jobId} for ${monthKey} in ${job.endTime - job.startTime}ms`);
      
      // Schedule cleanup
      setTimeout(() => {
        this.jobs.delete(monthKey);
        console.log(`[REBUILD-TRACKER] Cleaned up completed job for ${monthKey}`);
      }, this.JOB_RETENTION_MS);
    }
  }

  /**
   * Mark a job as errored
   */
  errorJob(year: number, month: number, error: string): void {
    const monthKey = this.getMonthKey(year, month);
    const job = this.jobs.get(monthKey);

    if (job) {
      job.status = 'error';
      job.endTime = Date.now();
      job.error = error;
      console.log(`[REBUILD-TRACKER] Job ${job.jobId} for ${monthKey} failed: ${error}`);
      
      // Schedule cleanup
      setTimeout(() => {
        this.jobs.delete(monthKey);
        console.log(`[REBUILD-TRACKER] Cleaned up errored job for ${monthKey}`);
      }, this.JOB_RETENTION_MS);
    }
  }

  /**
   * Check if a month is currently being rebuilt
   */
  isRebuilding(year: number, month: number): boolean {
    const monthKey = this.getMonthKey(year, month);
    const job = this.jobs.get(monthKey);
    return job ? job.status === 'running' : false;
  }

  /**
   * Get status for a specific month
   */
  getJobStatus(year: number, month: number): RebuildJob | null {
    const monthKey = this.getMonthKey(year, month);
    return this.jobs.get(monthKey) || null;
  }

  /**
   * Get all active and recent jobs
   */
  getAllJobs(): RebuildJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get all jobs as a map keyed by month (YYYY-MM)
   */
  getJobsMap(): Record<string, RebuildJob> {
    const map: Record<string, RebuildJob> = {};
    this.jobs.forEach((job, key) => {
      map[key] = job;
    });
    return map;
  }

  /**
   * Clean up old completed/errored jobs
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.jobs.forEach((job, key) => {
      if (job.endTime && (now - job.endTime) > this.JOB_RETENTION_MS) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.jobs.delete(key);
      console.log(`[REBUILD-TRACKER] Cleaned up old job for ${key}`);
    });
  }
}

// Export singleton instance
export const rebuildJobTracker = new RebuildJobTracker();

// Run cleanup every minute
setInterval(() => {
  rebuildJobTracker.cleanup();
}, 60 * 1000);
