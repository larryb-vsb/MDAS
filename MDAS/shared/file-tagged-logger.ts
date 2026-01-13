/**
 * File-Tagged Logger Utility
 * Provides consistent file identification across all pipeline stages
 * Format: [STEP#-ACTION] [FILE:uploadId] [filename] message
 */

export interface FileContext {
  uploadId: string;
  filename: string;
  step?: number;
  action?: string;
  retryAttempt?: number;
}

export class FileTaggedLogger {
  /**
   * Create standardized file tag prefix
   * Format: [STEP#-ACTION] [FILE:uploadId] [filename]
   */
  private static createFileTag(context: FileContext): string {
    const stepAction = context.step && context.action 
      ? `[STEP${context.step}-${context.action.toUpperCase()}]`
      : '[PIPELINE]';
    
    const fileTag = `[FILE:${context.uploadId}]`;
    const filename = `[${context.filename}]`;
    
    // Add retry attempt if applicable
    const retryTag = context.retryAttempt 
      ? `[RETRY-${context.retryAttempt}]`
      : '';
    
    return `${stepAction} ${retryTag} ${fileTag} ${filename}`.trim();
  }

  /**
   * Log info message with file context
   */
  static info(context: FileContext, message: string): void {
    const prefix = this.createFileTag(context);
    console.log(`${prefix} ${message}`);
  }

  /**
   * Log warning message with file context
   */
  static warn(context: FileContext, message: string): void {
    const prefix = this.createFileTag(context);
    console.warn(`${prefix} WARNING: ${message}`);
  }

  /**
   * Log error message with file context
   */
  static error(context: FileContext, message: string, error?: Error): void {
    const prefix = this.createFileTag(context);
    console.error(`${prefix} ERROR: ${message}`, error || '');
  }

  /**
   * Log retry attempt with specific tracking
   */
  static retry(context: FileContext, reason: string, maxRetries: number): void {
    const retryContext = { ...context, action: 'RETRY' };
    const prefix = this.createFileTag(retryContext);
    console.warn(`${prefix} Retry ${context.retryAttempt}/${maxRetries} - ${reason}`);
  }

  /**
   * Log successful completion
   */
  static success(context: FileContext, message: string, stats?: any): void {
    const successContext = { ...context, action: 'SUCCESS' };
    const prefix = this.createFileTag(successContext);
    const statsMsg = stats ? ` - ${JSON.stringify(stats)}` : '';
    console.log(`${prefix} ${message}${statsMsg}`);
  }

  /**
   * Log failure with specific tracking
   */
  static failure(context: FileContext, message: string, error?: Error): void {
    const failureContext = { ...context, action: 'FAILED' };
    const prefix = this.createFileTag(failureContext);
    console.error(`${prefix} ${message}`, error || '');
  }

  /**
   * Log step start
   */
  static stepStart(context: FileContext, stepDescription: string): void {
    const startContext = { ...context, action: 'START' };
    const prefix = this.createFileTag(startContext);
    console.log(`${prefix} ${stepDescription}`);
  }

  /**
   * Log step completion
   */
  static stepComplete(context: FileContext, stepDescription: string, duration?: number): void {
    const completeContext = { ...context, action: 'COMPLETE' };
    const prefix = this.createFileTag(completeContext);
    const durationMsg = duration ? ` (${duration}ms)` : '';
    console.log(`${prefix} ${stepDescription}${durationMsg}`);
  }

  /**
   * Log duplicate detection
   */
  static duplicate(context: FileContext, duplicateType: string, action: string): void {
    const dupContext = { ...context, action: 'DUPLICATE' };
    const prefix = this.createFileTag(dupContext);
    console.warn(`${prefix} ${duplicateType} duplicate detected - ${action}`);
  }

  /**
   * Log progress updates for long-running operations
   */
  static progress(context: FileContext, current: number, total: number, operation: string): void {
    const progressContext = { ...context, action: 'PROGRESS' };
    const prefix = this.createFileTag(progressContext);
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    console.log(`${prefix} ${operation}: ${current}/${total} (${percentage}%)`);
  }

  /**
   * Create file context from upload object
   */
  static createContext(upload: any, step?: number, action?: string): FileContext {
    return {
      uploadId: upload.id || upload.uploadId || 'unknown',
      filename: upload.filename || upload.originalFilename || 'unknown',
      step,
      action
    };
  }

  /**
   * Add retry attempt to existing context
   */
  static withRetry(context: FileContext, retryAttempt: number): FileContext {
    return { ...context, retryAttempt };
  }
}

// Convenience type for upload objects
export interface UploadContext {
  id?: string;
  uploadId?: string;
  filename?: string;
  originalFilename?: string;
}