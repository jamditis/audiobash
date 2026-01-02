/**
 * Centralized logging utility for AudioBash main process (Electron)
 * Provides structured logging with log levels, file output, and context
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class MainLogger {
  constructor() {
    this.minLevel = 'info';
    this.enableConsole = true;
    this.enableFile = true;
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.logFilePath = null;
    this.initialized = false;
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
      this.rotateLogIfNeeded();
    }

    this.initialized = true;
    this.info('Logger', 'Logger initialized', {
      minLevel: this.minLevel,
      enableFile: this.enableFile,
      logPath: this.logFilePath
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
    const consoleMethod = level === 'error' ? console.error
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
  }

  // Convenience methods
  debug(category, message, data) {
    this.log('debug', category, message, data);
  }

  info(category, message, data) {
    this.log('info', category, message, data);
  }

  warn(category, message, data, error) {
    this.log('warn', category, message, data, error);
  }

  error(category, message, error, data) {
    this.log('error', category, message, data, error);
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
    };
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
    const errors = logs.filter(l => l.level === 'ERROR');
    return {
      total: errors.length,
      recent: errors.slice(-10),
      categories: [...new Set(errors.map(e => e.category))],
    };
  }

  /**
   * Clear log file
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
};
