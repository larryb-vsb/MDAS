import { Pool } from '@neondatabase/serverless';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  onRetry: (attempt, error) => {
    console.log(`[DB-RETRY] Attempt ${attempt} failed: ${error.message}`);
  }
};

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const message = error.message.toLowerCase();
  
  // Retryable database connection errors
  return (
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection timeout') ||
    message.includes('econnreset') ||
    message.includes('epipe') ||
    message.includes('network error') ||
    message.includes('socket hang up') ||
    message.includes('closed by the server') ||
    message.includes('connection closed')
  );
}

function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add random jitter to prevent thundering herd
  return Math.min(exponentialDelay + jitter, maxDelay);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === opts.maxRetries || !isRetryableError(error)) {
        throw lastError;
      }
      
      opts.onRetry(attempt + 1, lastError);
      
      const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
      console.log(`[DB-RETRY] Waiting ${delay}ms before retry ${attempt + 1}/${opts.maxRetries}...`);
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Operation failed without error');
}

export async function withConnectionCheck<T>(
  pool: Pool,
  operation: () => Promise<T>,
  retryOptions?: RetryOptions
): Promise<T> {
  return withRetry(async () => {
    // Quick health check before operation
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      console.log('[DB-HEALTH] Connection check failed, reconnecting...', error);
      throw error;
    }
    
    // Execute the operation
    return await operation();
  }, retryOptions);
}

export function wrapWithRecovery<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string,
  retryOptions?: RetryOptions
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await withRetry(() => fn(...args), retryOptions);
    } catch (error) {
      console.error(`[${context}] Operation failed after retries:`, error);
      // Graceful degradation - don't crash, just log
      return null;
    }
  }) as T;
}
