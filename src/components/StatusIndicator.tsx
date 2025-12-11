import React from 'react';

interface StatusIndicatorProps {
  isRecording: boolean;
  model: string;
  status: 'idle' | 'recording' | 'processing';
  apiConnected: boolean;
  onOpenVoicePanel: () => void;
  onOpenDirectoryPicker: () => void;
}

const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  isRecording,
  model,
  status,
  apiConnected,
  onOpenVoicePanel,
  onOpenDirectoryPicker,
}) => {
  const modelDisplay = model === 'parakeet-local' ? 'Parakeet' :
    model === 'gemini-2.5-flash' ? 'Gemini 2.5' : 'Gemini 2.0';

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
      </div>

      {/* Right: Model & API Status */}
      <div className="flex items-center gap-4">
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
