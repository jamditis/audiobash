import React, { useState, useCallback } from 'react';
import { PreviewPosition } from '../types';

interface PreviewControlsProps {
  url: string;
  onUrlChange: (url: string) => void;
  onRefresh: () => void;
  onScreenshot: () => void;
  onClose: () => void;
  position: PreviewPosition;
  onPositionChange: (position: PreviewPosition) => void;
  isLoading?: boolean;
}

// Icons
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const CameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Position icons
const RightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="2" width="14" height="12" rx="1" />
    <line x1="10" y1="2" x2="10" y2="14" />
  </svg>
);

const BottomIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="2" width="14" height="12" rx="1" />
    <line x1="1" y1="10" x2="15" y2="10" />
  </svg>
);

const PaneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="2" width="6" height="12" rx="1" />
    <rect x="9" y="2" width="6" height="12" rx="1" />
  </svg>
);

const PreviewControls: React.FC<PreviewControlsProps> = ({
  url,
  onUrlChange,
  onRefresh,
  onScreenshot,
  onClose,
  position,
  onPositionChange,
  isLoading = false,
}) => {
  const [inputValue, setInputValue] = useState(url);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onUrlChange(inputValue);
  }, [inputValue, onUrlChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onUrlChange(inputValue);
    }
  }, [inputValue, onUrlChange]);

  // Update input when url prop changes
  React.useEffect(() => {
    setInputValue(url);
  }, [url]);

  const positionButtons: { pos: PreviewPosition; icon: React.ReactNode; title: string }[] = [
    { pos: 'right', icon: <RightIcon />, title: 'Right sidebar' },
    { pos: 'bottom', icon: <BottomIcon />, title: 'Bottom panel' },
    { pos: 'pane', icon: <PaneIcon />, title: 'Terminal pane' },
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-void-100 border-b border-void-300">
      {/* URL input */}
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL or file path..."
          className="w-full bg-void-200 border border-void-300 rounded px-3 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/30 focus:border-accent focus:outline-none"
        />
      </form>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className={`p-1.5 rounded border border-void-300 text-crt-white/60 hover:text-crt-white hover:border-accent transition-colors ${isLoading ? 'animate-spin' : ''}`}
        title="Refresh (manual)"
      >
        <RefreshIcon />
      </button>

      {/* Screenshot button */}
      <button
        onClick={onScreenshot}
        className="p-1.5 rounded border border-void-300 text-crt-white/60 hover:text-accent hover:border-accent transition-colors"
        title="Screenshot (Alt+Shift+P)"
      >
        <CameraIcon />
      </button>

      {/* Position selector */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-void-200 rounded border border-void-300">
        {positionButtons.map(({ pos, icon, title }) => (
          <button
            key={pos}
            onClick={() => onPositionChange(pos)}
            className={`p-1 rounded transition-colors ${
              position === pos
                ? 'text-accent bg-accent/10'
                : 'text-crt-white/40 hover:text-crt-white/70'
            }`}
            title={title}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="p-1.5 rounded border border-void-300 text-crt-white/60 hover:text-accent hover:border-accent transition-colors"
        title="Close preview (Alt+P)"
      >
        <CloseIcon />
      </button>
    </div>
  );
};

export default PreviewControls;
