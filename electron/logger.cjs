/**
 * Centralized logging utility for AudioBash main process (Electron)
 * Provides structured logging with log levels, file output, context, and diagnostics
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class MainLogger {
  constructor() {
    this.minLevel = 'info';
    this.enableConsole = true;
    this.enableFile = true;
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.logFilePath = null;
    this.initialized = false;

    // Session tracking for log correlation
    this.sessionId = this.generateSessionId();

    // Error buffer for crash reports
    this.errorBuffer = [];
    this.maxErrorBuffer = 100;

    // Metrics tracking
    this.metrics = {
      startTime: Date.now(),
      errorCount: 0,
      warnCount: 0,
      operations: new Map(),
    };
  }

  generateSessionId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Initialize logger with app paths (call after app.whenReady)
   */
  init(options = {}) {
    if (this.initialized) return;

    const isDev = !app.isPackaged;
    this.minLevel = options.minLevel || (isDev ? 'debug' : 'info');
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;

    if (this.enableFile) {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      this.logFilePath = path.join(logsDir, 'audiobash.log');
      this.logsDir = logsDir;
      this.rotateLogIfNeeded();
    }

    this.initialized = true;
    this.info('Logger', 'Logger initialized', {
      minLevel: this.minLevel,
      enableFile: this.enableFile,
      logPath: this.logFilePath,
      sessionId: this.sessionId,
    });
  }

  /**
   * Rotate log file if it exceeds max size
   */
  rotateLogIfNeeded() {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) return;

    try {
      const stats = fs.statSync(this.logFilePath);
      if (stats.size > this.maxFileSize) {
        const rotatedPath = this.logFilePath.replace('.log', `-${Date.now()}.log`);
        fs.renameSync(this.logFilePath, rotatedPath);

        // Keep only last 5 rotated logs
        const logsDir = path.dirname(this.logFilePath);
        const logFiles = fs.readdirSync(logsDir)
          .filter(f => f.startsWith('audiobash-') && f.endsWith('.log'))
          .sort()
          .reverse();

        for (let i = 5; i < logFiles.length; i++) {
          fs.unlinkSync(path.join(logsDir, logFiles[i]));
        }
      }
    } catch (err) {
      console.error('[Logger] Failed to rotate log file:', err.message);
    }
  }

  /**
   * Check if we should log at this level
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  /**
   * Format an error object for logging
   */
  formatError(error) {
    if (!error) return null;
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      };
    }
    return { message: String(error) };
  }

  /**
   * Format log entry
   */
  formatEntry(level, category, message, data, error) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      level: level.toUpperCase(),
      category,
      message,
    };

    if (data !== undefined && data !== null) {
      entry.data = data;
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  /**
   * Write to log file
   */
  writeToFile(entry) {
    if (!this.enableFile || !this.logFilePath) return;

    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logFilePath, line);
    } catch (err) {
      // Fallback to console if file write fails
      console.error('[Logger] Failed to write to log file:', err.message);
    }
  }

  /**
   * Write to console with appropriate formatting
   */
  writeToConsole(level, category, message, data, error) {
    if (!this.enableConsole) return;

    const prefix = `[${category}]`;
    const consoleMethod = level === 'error' || level === 'fatal' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log;

    // Format output for readability
    if (error && data) {
      consoleMethod(prefix, message, data, error);
    } else if (error) {
      consoleMethod(prefix, message, error);
    } else if (data !== undefined) {
      consoleMethod(prefix, message, typeof data === 'object' ? JSON.stringify(data) : data);
    } else {
      consoleMethod(prefix, message);
    }
  }

  /**
   * Core logging method
   */
  log(level, category, message, data, error) {
    if (!this.shouldLog(level)) return;

    const entry = this.formatEntry(level, category, message, data, error);

    this.writeToConsole(level, category, message, data, error);
    this.writeToFile(entry);

    // Track errors and warnings
    if (level === 'error' || level === 'fatal') {
      this.metrics.errorCount++;
      this.errorBuffer.push(entry);
      if (this.errorBuffer.length > this.maxErrorBuffer) {
        this.errorBuffer.shift();
      }
    } else if (level === 'warn') {
      this.metrics.warnCount++;
    }

    return entry;
  }

  // Convenience methods
  debug(category, message, data) {
    return this.log('debug', category, message, data);
  }

  info(category, message, data) {
    return this.log('info', category, message, data);
  }

  warn(category, message, data, error) {
    return this.log('warn', category, message, data, error);
  }

  error(category, message, error, data) {
    return this.log('error', category, message, data, error);
  }

  fatal(category, message, error, data) {
    return this.log('fatal', category, message, data, error);
  }

  /**
   * Create a category-specific logger
   */
  category(categoryName) {
    const self = this;
    return {
      debug: (message, data) => self.debug(categoryName, message, data),
      info: (message, data) => self.info(categoryName, message, data),
      warn: (message, data, error) => self.warn(categoryName, message, data, error),
      error: (message, error, data) => self.error(categoryName, message, error, data),
      fatal: (message, error, data) => self.fatal(categoryName, message, error, data),
    };
  }

  /**
   * Start timing an operation
   */
  startOperation(category, operationName) {
    const id = `${operationName}-${Date.now()}`;
    this.metrics.operations.set(id, {
      name: operationName,
      category,
      startTime: Date.now(),
      status: 'running',
    });
    this.debug(category, `Operation started: ${operationName}`, { operationId: id });
    return id;
  }

  /**
   * End timing an operation
   */
  endOperation(id, success = true, details = {}) {
    const op = this.metrics.operations.get(id);
    if (!op) {
      this.warn('Logger', `Unknown operation: ${id}`);
      return null;
    }

    const duration = Date.now() - op.startTime;
    op.status = success ? 'completed' : 'failed';
    op.duration = duration;
    op.details = details;

    const logMethod = success ? 'debug' : 'error';
    this[logMethod](op.category, `Operation ${op.status}: ${op.name}`, {
      operationId: id,
      duration: `${duration}ms`,
      ...details,
    });

    return { ...op };
  }

  /**
   * Get path to log file (for diagnostics)
   */
  getLogFilePath() {
    return this.logFilePath;
  }

  /**
   * Read recent log entries from file
   */
  getRecentLogs(count = 100) {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.logFilePath, 'utf8');
      const lines = content.trim().split('\n').slice(-count);
      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
    } catch (err) {
      console.error('[Logger] Failed to read log file:', err.message);
      return [];
    }
  }

  /**
   * Get error summary for diagnostics
   */
  getErrorSummary() {
    const logs = this.getRecentLogs(500);
    const errors = logs.filter(l => l.level === 'ERROR' || l.level === 'FATAL');
    return {
      total: errors.length,
      recent: errors.slice(-10),
      categories: [...new Set(errors.map(e => e.category))],
    };
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics() {
    const uptime = Date.now() - this.metrics.startTime;
    const memoryUsage = process.memoryUsage();

    return {
      sessionId: this.sessionId,
      uptime: `${Math.floor(uptime / 1000)}s`,
      platform: process.platform,
      nodeVersion: process.version,
      electronVersion: process.versions?.electron,
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      },
      errorCount: this.metrics.errorCount,
      warnCount: this.metrics.warnCount,
      recentErrors: this.errorBuffer.slice(-5),
    };
  }

  /**
   * Generate a crash report
   */
  generateCrashReport(error, context = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      error: this.formatError(error),
      context,
      diagnostics: this.getDiagnostics(),
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions?.electron,
        appVersion: app.getVersion?.() || 'unknown',
      },
      recentErrors: this.errorBuffer.slice(-20),
    };

    // Save crash report
    if (this.logsDir) {
      const crashFile = path.join(
        this.logsDir,
        `crash-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );

      try {
        fs.writeFileSync(crashFile, JSON.stringify(report, null, 2));
        this.fatal('CrashReport', `Crash report saved to: ${crashFile}`, error);
      } catch (err) {
        console.error('[Logger] Failed to save crash report:', err.message);
      }
    }

    return report;
  }

  /**
   * Clear old logs (older than specified days)
   */
  clearOldLogs(daysToKeep = 7) {
    if (!this.logsDir) return;

    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this.logsDir);
      for (const file of files) {
        const filePath = path.join(this.logsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime.getTime() < cutoff) {
          fs.unlinkSync(filePath);
          this.info('Logger', `Deleted old log file: ${file}`);
        }
      }
    } catch (err) {
      this.warn('Logger', 'Failed to clear old logs', { error: err.message });
    }
  }

  /**
   * Clear current log file
   */
  clearLogs() {
    if (this.logFilePath && fs.existsSync(this.logFilePath)) {
      try {
        fs.writeFileSync(this.logFilePath, '');
        this.info('Logger', 'Log file cleared');
      } catch (err) {
        console.error('[Logger] Failed to clear log file:', err.message);
      }
    }
  }
}

// Singleton instance
const logger = new MainLogger();

// Pre-configured category loggers
const appLog = logger.category('AudioBash');
const ipcLog = logger.category('IPC');
const ptyLog = logger.category('PTY');
const storeLog = logger.category('Store');
const remoteLog = logger.category('RemoteControl');
const tunnelLog = logger.category('Tunnel');
const whisperLog = logger.category('Whisper');

module.exports = {
  logger,
  appLog,
  ipcLog,
  ptyLog,
  storeLog,
  remoteLog,
  tunnelLog,
  whisperLog,
  LOG_LEVELS,
};
