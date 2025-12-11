import React from 'react';

interface TitleBarProps {
  onSettingsClick?: () => void;
}

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const handleMinimize = () => {
    window.electron?.minimize();
  };

  const handleMaximize = () => {
    window.electron?.maximize();
  };

  const handleClose = () => {
    window.electron?.close();
  };

  return (
    <div className="h-8 bg-void-100 border-b border-void-300 flex items-center justify-between px-2 drag-region">
      {/* Logo/Title */}
      <div className="flex items-center gap-2 no-drag">
        <div className="w-3 h-3 bg-accent rounded-sm"></div>
        <span className="font-display font-bold text-xs uppercase tracking-widest text-crt-white/70">
          AudioBash
        </span>
      </div>

      {/* Status */}
      <div className="flex-1 flex justify-center">
        <span className="text-[10px] text-crt-white/30 font-mono uppercase tracking-wider">
          PowerShell
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={onSettingsClick}
          className="w-6 h-6 flex items-center justify-center hover:bg-void-300 text-crt-white/50 hover:text-crt-white transition-colors"
          title="Settings"
        >
          <SettingsIcon />
        </button>
        <div className="w-px h-4 bg-void-300 mx-1" />
        <button
          onClick={handleMinimize}
          className="w-6 h-6 flex items-center justify-center hover:bg-void-300 transition-colors"
          title="Minimize"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 10 10">
            <rect y="4" width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-6 h-6 flex items-center justify-center hover:bg-void-300 transition-colors"
          title="Maximize"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 10 10">
            <rect x="1" y="1" width="8" height="8" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center hover:bg-accent hover:text-void transition-colors"
          title="Close"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 10 10">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
