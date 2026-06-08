import React, { useState, useRef, useEffect } from 'react';
import { useConsoleErrors, ConsoleError } from '../contexts/ConsoleErrorContext';

interface ConsoleErrorViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-4 h-4"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-4 h-4"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
    />
  </svg>
);

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-4 h-4"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-4 h-4"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const ConsoleErrorViewer: React.FC<ConsoleErrorViewerProps> = ({ isOpen, onClose }) => {
  const { errors, clearErrors, markAsRead } = useConsoleErrors();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mark errors as read when opened
  useEffect(() => {
    if (isOpen) {
      markAsRead();
    }
  }, [isOpen, markAsRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current && isOpen) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [errors.length, isOpen]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const copyError = async (error: ConsoleError) => {
    const text = `[${formatTimestamp(error.timestamp)}] ${error.type.toUpperCase()}: ${error.message}${error.stack ? '\n' + error.stack : ''}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(error.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAllErrors = async () => {
    const text = errors
      .map(
        (e) =>
          `[${formatTimestamp(e.timestamp)}] ${e.type.toUpperCase()}: ${e.message}${e.stack ? '\n' + e.stack : ''}`,
      )
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  if (!isOpen) return null;

  const errorCount = errors.filter((e) => e.type === 'error').length;
  const warnCount = errors.filter((e) => e.type === 'warn').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div
        className="bg-void-100 border border-void-300 rounded-lg shadow-2xl w-full max-w-3xl max-h-[60vh] flex flex-col pointer-events-auto"
        style={{ marginBottom: '40px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-void-300 bg-void-200/50">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-crt-white/50">
              Console output
            </span>
            {errorCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 bg-red-400/20 text-red-400 rounded-full">
                {errorCount} {errorCount === 1 ? 'error' : 'errors'}
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 bg-yellow-400/20 text-yellow-400 rounded-full">
                {warnCount} {warnCount === 1 ? 'warning' : 'warnings'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAllErrors}
              disabled={errors.length === 0}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-crt-white/50 hover:text-crt-white hover:bg-void-300 rounded transition-colors disabled:opacity-30"
              title="Copy all to clipboard"
            >
              {copiedAll ? <CheckIcon /> : <CopyIcon />}
              {copiedAll ? 'Copied!' : 'Copy all'}
            </button>
            <button
              onClick={clearErrors}
              disabled={errors.length === 0}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-crt-white/50 hover:text-red-400 hover:bg-void-300 rounded transition-colors disabled:opacity-30"
              title="Clear all"
            >
              <TrashIcon />
              Clear
            </button>
            <button
              onClick={onClose}
              className="p-1 text-crt-white/30 hover:text-crt-white/50 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Error list */}
        <div ref={containerRef} className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
          {errors.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-crt-white/30">
              No console output captured
            </div>
          ) : (
            errors.map((error) => (
              <div
                key={error.id}
                className={`
                  group flex items-start gap-2 p-2 rounded border cursor-pointer
                  transition-colors hover:bg-void-200/50
                  ${
                    error.type === 'error'
                      ? 'border-red-400/30 bg-red-400/5'
                      : 'border-yellow-400/30 bg-yellow-400/5'
                  }
                `}
                onClick={() => copyError(error)}
                title="Click to copy"
              >
                {/* Type indicator */}
                <span
                  className={`
                    flex-shrink-0 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded
                    ${
                      error.type === 'error'
                        ? 'bg-red-400/20 text-red-400'
                        : 'bg-yellow-400/20 text-yellow-400'
                    }
                  `}
                >
                  {error.type}
                </span>

                {/* Timestamp */}
                <span className="flex-shrink-0 text-[10px] text-crt-white/30">
                  {formatTimestamp(error.timestamp)}
                </span>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`
                    break-words whitespace-pre-wrap
                    ${error.type === 'error' ? 'text-red-300' : 'text-yellow-300'}
                  `}
                  >
                    {error.message}
                  </div>
                  {error.stack && (
                    <div className="mt-1 text-[10px] text-crt-white/30 whitespace-pre-wrap overflow-x-auto">
                      {error.stack}
                    </div>
                  )}
                </div>

                {/* Copy indicator */}
                <span
                  className={`
                    flex-shrink-0 text-[10px] transition-opacity
                    ${copiedId === error.id ? 'opacity-100 text-crt-green' : 'opacity-0 group-hover:opacity-50 text-crt-white/50'}
                  `}
                >
                  {copiedId === error.id ? 'Copied!' : 'Click to copy'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsoleErrorViewer;
