/**
 * Centralized logging utility for AudioBash renderer process
 * Provides structured logging with log levels, context, and optional persistence
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  maxStoredLogs: number;
  storageKey: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  enableConsole: true,
  enableStorage: true,
  maxStoredLogs: 500,
  storageKey: 'audiobash-logs',
};

class Logger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadStoredLogs();
  }

  private loadStoredLogs(): void {
    if (!this.config.enableStorage) return;
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private persistLogs(): void {
    if (!this.config.enableStorage) return;
    try {
      // Trim to max size
      if (this.logs.length > this.config.maxStoredLogs) {
        this.logs = this.logs.slice(-this.config.maxStoredLogs);
      }
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.logs));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  private formatError(error: unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  private createEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown,
    error?: unknown
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data !== undefined ? data : undefined,
      error: this.formatError(error),
    };
  }

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown,
    error?: unknown
  ): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, category, message, data, error);
    this.logs.push(entry);
    this.persistLogs();

    if (this.config.enableConsole) {
      const prefix = `[${category}]`;
      const consoleMethod = level === 'error' ? console.error
        : level === 'warn' ? console.warn
        : level === 'debug' ? console.debug
        : console.log;

      if (error) {
        consoleMethod(prefix, message, data ?? '', error);
      } else if (data !== undefined) {
        consoleMethod(prefix, message, data);
      } else {
        consoleMethod(prefix, message);
      }
    }
  }

  // Create a category-specific logger
  category(categoryName: string): CategoryLogger {
    return new CategoryLogger(this, categoryName);
  }

  // Direct logging methods
  debug(category: string, message: string, data?: unknown): void {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown, error?: unknown): void {
    this.log('warn', category, message, data, error);
  }

  error(category: string, message: string, error?: unknown, data?: unknown): void {
    this.log('error', category, message, data, error);
  }

  // Get all logs
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Get logs filtered by level
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(l => l.level === level);
  }

  // Get logs filtered by category
  getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter(l => l.category === category);
  }

  // Get recent logs
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Get error summary for diagnostics
  getErrorSummary(): { count: number; recent: LogEntry[] } {
    const errors = this.getLogsByLevel('error');
    return {
      count: errors.length,
      recent: errors.slice(-10),
    };
  }

  // Clear all logs
  clearLogs(): void {
    this.logs = [];
    if (this.config.enableStorage) {
      localStorage.removeItem(this.config.storageKey);
    }
  }

  // Export logs as JSON string (for debugging/support)
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Download logs as file
  downloadLogs(): void {
    const blob = new Blob([this.exportLogs()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audiobash-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Update configuration
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Category-specific logger for cleaner API
class CategoryLogger {
  constructor(
    private logger: Logger,
    private categoryName: string
  ) {}

  debug(message: string, data?: unknown): void {
    this.logger.debug(this.categoryName, message, data);
  }

  info(message: string, data?: unknown): void {
    this.logger.info(this.categoryName, message, data);
  }

  warn(message: string, data?: unknown, error?: unknown): void {
    this.logger.warn(this.categoryName, message, data, error);
  }

  error(message: string, error?: unknown, data?: unknown): void {
    this.logger.error(this.categoryName, message, error, data);
  }
}

// Singleton instance with dev/prod configuration
// @ts-ignore - Vite provides import.meta.env
const isDev = (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) ?? false;

export const logger = new Logger({
  minLevel: isDev ? 'debug' : 'info',
  enableConsole: true,
  enableStorage: true,
  maxStoredLogs: 500,
});

// Pre-configured category loggers for common use cases
export const appLog = logger.category('App');
export const terminalLog = logger.category('Terminal');
export const voiceLog = logger.category('Voice');
export const transcriptionLog = logger.category('Transcription');
export const previewLog = logger.category('Preview');
export const ipcLog = logger.category('IPC');

export default logger;
