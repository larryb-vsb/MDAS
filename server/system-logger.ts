// System Logger - Comprehensive logging for development environment events
import { pool } from './db';
import { getTableName } from './table-config';
import { getEnvironment } from './env-config';

interface SystemLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug' | 'critical';
  source: string;
  message: string;
  details?: Record<string, any>;
  hostname?: string;
}

export class SystemLogger {
  private static instance: SystemLogger;
  private serverId: string;
  private environment: string;

  private constructor() {
    const env = getEnvironment();
    this.serverId = process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`;
    this.environment = env.NODE_ENV;
    
    // Log system startup
    this.logStartup();
  }

  public static getInstance(): SystemLogger {
    if (!SystemLogger.instance) {
      SystemLogger.instance = new SystemLogger();
    }
    return SystemLogger.instance;
  }

  private async logStartup() {
    await this.log({
      level: 'info',
      source: 'System Startup',
      message: `MMS server started in ${this.environment} mode`,
      details: {
        serverId: this.serverId,
        nodeVersion: process.version,
        platform: process.platform,
        timestamp: new Date().toISOString(),
        processId: process.pid
      }
    });
  }

  public async log(entry: SystemLogEntry): Promise<void> {
    try {
      const systemLogsTable = getTableName('system_logs');
      const timestamp = new Date();
      
      await pool.query(
        `INSERT INTO ${systemLogsTable} (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5)`,
        [
          entry.level,
          entry.source,
          entry.message,
          JSON.stringify(entry.details || {}),
          timestamp
        ]
      );
    } catch (error) {
      // Fallback to console if database logging fails
      console.error('[SYSTEM LOGGER] Failed to log to database:', error);
      console.log(`[${entry.level.toUpperCase()}] ${entry.source}: ${entry.message}`, entry.details);
    }
  }

  // Convenience methods for different log levels
  public async info(source: string, message: string, details?: Record<string, any>) {
    await this.log({ level: 'info', source, message, details });
  }

  public async warn(source: string, message: string, details?: Record<string, any>) {
    await this.log({ level: 'warn', source, message, details });
  }

  public async error(source: string, message: string, details?: Record<string, any>) {
    await this.log({ level: 'error', source, message, details });
  }

  public async debug(source: string, message: string, details?: Record<string, any>) {
    await this.log({ level: 'debug', source, message, details });
  }

  public async critical(source: string, message: string, details?: Record<string, any>) {
    await this.log({ level: 'critical', source, message, details });
  }

  // Log specific system events
  public async logDeployment(version?: string) {
    await this.info('Deployment', 'Application deployment detected', {
      version,
      environment: this.environment,
      serverId: this.serverId
    });
  }

  public async logFileProcessing(action: string, filename: string, details?: Record<string, any>) {
    await this.info('File Processing', `${action}: ${filename}`, {
      filename,
      ...details
    });
  }

  public async logBackup(action: string, details?: Record<string, any>) {
    await this.info('Backup System', action, details);
  }

  public async logAuthentication(action: string, username: string, success: boolean, ip?: string) {
    await this.info('Authentication', `${action} ${success ? 'successful' : 'failed'} for ${username}`, {
      username,
      success,
      ipAddress: ip,
      action
    });
  }

  public async logDatabaseOperation(operation: string, table: string, details?: Record<string, any>) {
    await this.debug('Database', `${operation} on ${table}`, {
      table,
      operation,
      ...details
    });
  }

  public async logApiRequest(method: string, endpoint: string, statusCode: number, duration?: number) {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'debug';
    await this.log({
      level,
      source: 'API',
      message: `${method} ${endpoint} - ${statusCode}`,
      details: {
        method,
        endpoint,
        statusCode,
        duration
      }
    });
  }
}

// Export singleton instance
export const systemLogger = SystemLogger.getInstance();