import React from 'react';
import { MODELS, ModelId } from '../services/transcriptionService';
import { useConsoleErrors } from '../contexts/ConsoleErrorContext';

interface StatusIndicatorProps {
  isRecording: boolean;
  model: string;
  status: 'idle' | 'recording' | 'processing';
  apiConnected: boolean;
  onOpenVoicePanel: () => void;
  onOpenDirectoryPicker: () => void;
  onOpenConsoleErrors: () => void;
  ccVoiceActive?: boolean;
}

const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const WarningIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  isRecording,
  model,
  status,
  apiConnected,
  onOpenVoicePanel,
  onOpenDirectoryPicker,
  onOpenConsoleErrors,
  ccVoiceActive,
}) => {
  const { errors, hasUnreadErrors } = useConsoleErrors();
  const errorCount = errors.filter((e) => e.type === 'error').length;

  // Look up the model name from the MODELS array
  const modelInfo = MODELS.find(m => m.id === model as ModelId);
  const modelDisplay = modelInfo?.name || model;

  const statusText = status === 'recording' ? 'Listening...' :
    status === 'processing' ? 'Processing...' : 'Ready';

  return (
    <div
      className={`
        h-8 px-4 flex items-center justify-between
        border-t transition-all duration-300 cursor-pointer
        ${isRecording
          ? 'bg-accent/10 border-accent/50'
          : 'bg-void-100 border-void-300 hover:bg-void-200'
        }
      `}
      onClick={onOpenVoicePanel}
    >
      {/* Left: Quick actions & Shortcuts */}
      <div className="flex items-center gap-4">
        {/* Directory picker button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDirectoryPicker();
          }}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-void-300 text-crt-white/50 hover:text-crt-amber transition-colors"
          title="Quick navigate to folder"
        >
          <FolderIcon />
          <span className="text-[10px] font-mono">Folders</span>
        </button>

        <div className="flex items-center gap-2">
          <kbd className={`
            px-1.5 py-0.5 text-[10px] font-mono rounded
            ${isRecording ? 'bg-accent/20 text-accent' : 'bg-void-300 text-crt-white/50'}
          `}>
            Alt+S
          </kbd>
          <span className="text-[10px] text-crt-white/40">Voice</span>
        </div>

        <div className="flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-void-300 text-crt-white/50 rounded">
            Alt+H
          </kbd>
          <span className="text-[10px] text-crt-white/40">Hide</span>
        </div>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-2">
        {isRecording && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
        )}
        <span className={`
          text-[10px] font-mono uppercase tracking-wider
          ${status === 'recording' ? 'text-accent' :
            status === 'processing' ? 'text-crt-amber' : 'text-crt-white/40'}
        `}>
          {statusText}
        </span>
        {ccVoiceActive && (
          <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-acid border border-acid/30">
            <span className="w-1.5 h-1.5 bg-acid rounded-full animate-pulse" />
            CC /voice
          </div>
        )}
      </div>

      {/* Right: Model & API Status */}
      <div className="flex items-center gap-4">
        {/* Console errors indicator */}
        {errorCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenConsoleErrors();
            }}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded transition-colors
              ${hasUnreadErrors
                ? 'bg-red-400/20 text-red-400 animate-pulse'
                : 'bg-red-400/10 text-red-400/70 hover:bg-red-400/20 hover:text-red-400'
              }
            `}
            title={`${errorCount} console ${errorCount === 1 ? 'error' : 'errors'}`}
          >
            <WarningIcon />
            <span className="text-[10px] font-mono">{errorCount}</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-crt-white/30 uppercase">Model</span>
          <span className="text-[10px] font-mono text-crt-amber">{modelDisplay}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`
            w-1.5 h-1.5 rounded-full
            ${apiConnected ? 'bg-crt-green' : 'bg-accent'}
          `}></span>
          <span className={`
            text-[10px] font-mono
            ${apiConnected ? 'text-crt-green' : 'text-accent'}
          `}>
            {model === 'parakeet-local' ? 'Local' : apiConnected ? 'API' : 'No Key'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatusIndicator;
