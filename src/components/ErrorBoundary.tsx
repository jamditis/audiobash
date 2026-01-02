import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Error Boundary component for catching and displaying React errors
 * Provides a fallback UI and logs errors for debugging
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error
    logger.error('ErrorBoundary', 'React component error caught', error, {
      componentStack: errorInfo.componentStack,
    });

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleClearAndReload = (): void => {
    // Clear stored state that might be causing issues
    try {
      localStorage.removeItem('audiobash-logs');
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  handleCopyError = (): void => {
    const { error, errorInfo } = this.state;
    const errorText = `
AudioBash Error Report
======================
Time: ${new Date().toISOString()}
Error: ${error?.name}: ${error?.message}
Stack: ${error?.stack}
Component Stack: ${errorInfo?.componentStack}
User Agent: ${navigator.userAgent}
    `.trim();

    navigator.clipboard.writeText(errorText).catch(() => {
      // Fallback: select text for manual copy
    });
  };

  handleDownloadLogs = (): void => {
    logger.downloadLogs();
  };

  toggleDetails = (): void => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails } = this.state;

      return (
        <div className="h-screen w-screen bg-void flex items-center justify-center p-8">
          <div className="max-w-2xl w-full bg-void-light border border-red-500/30 rounded-lg p-6 shadow-lg">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                <p className="text-gray-400 text-sm">AudioBash encountered an unexpected error</p>
              </div>
            </div>

            {/* Error message */}
            <div className="bg-void border border-gray-700 rounded p-3 mb-4 font-mono text-sm">
              <span className="text-red-400">{error?.name}</span>
              <span className="text-gray-400">: </span>
              <span className="text-white">{error?.message}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-accent text-void font-medium rounded hover:bg-accent/90 transition-colors"
              >
                Reload App
              </button>
              <button
                onClick={this.handleClearAndReload}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Clear Cache & Reload
              </button>
              <button
                onClick={this.handleCopyError}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Copy Error
              </button>
              <button
                onClick={this.handleDownloadLogs}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Download Logs
              </button>
            </div>

            {/* Toggle details */}
            <button
              onClick={this.toggleDetails}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showDetails ? 'Hide' : 'Show'} technical details
            </button>

            {/* Technical details */}
            {showDetails && (
              <div className="mt-4 space-y-3">
                {/* Stack trace */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-1">Stack Trace</h3>
                  <pre className="bg-void border border-gray-700 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
                    {error?.stack || 'No stack trace available'}
                  </pre>
                </div>

                {/* Component stack */}
                {errorInfo?.componentStack && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-1">Component Stack</h3>
                    <pre className="bg-void border border-gray-700 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}

                {/* Recent errors from log */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-1">
                    Recent Errors ({logger.getErrorSummary().count} total)
                  </h3>
                  <pre className="bg-void border border-gray-700 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
                    {logger.getErrorSummary().recent.map(e =>
                      `[${e.timestamp}] ${e.category}: ${e.message}`
                    ).join('\n') || 'No recent errors logged'}
                  </pre>
                </div>
              </div>
            )}

            {/* Help text */}
            <p className="mt-4 text-xs text-gray-500">
              If this error persists, please report it at{' '}
              <a
                href="https://github.com/anthropics/claude-code/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                github.com/anthropics/claude-code/issues
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
