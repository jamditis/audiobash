import React from 'react';
import { TerminalTab } from '../types';

interface TabBarProps {
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  canAddTab: boolean;
}

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  canAddTab,
}) => {
  return (
    <div className="flex items-center bg-void-100 border-b border-void-300 px-1">
      {/* Tabs */}
      <div className="flex items-center gap-0.5 py-1 flex-1 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`
              group flex items-center gap-1.5 px-3 py-1.5 rounded-t
              text-xs font-mono transition-colors min-w-[100px] max-w-[160px]
              ${tab.id === activeTabId
                ? 'bg-void text-crt-white border-t border-x border-void-300'
                : 'text-crt-white/50 hover:text-crt-white/70 hover:bg-void-200'
              }
            `}
          >
            <TerminalIcon />
            <span className="truncate flex-1 text-left">{tab.title || `Terminal ${index + 1}`}</span>
            {tabs.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={`
                  p-0.5 rounded transition-colors
                  ${tab.id === activeTabId
                    ? 'hover:bg-void-300 text-crt-white/50 hover:text-accent'
                    : 'hover:bg-void-300 text-crt-white/30 hover:text-accent opacity-0 group-hover:opacity-100'
                  }
                `}
              >
                <CloseIcon />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* New Tab Button */}
      <button
        onClick={onNewTab}
        disabled={!canAddTab}
        className={`
          p-1.5 rounded transition-colors mx-1
          ${canAddTab
            ? 'text-crt-white/50 hover:text-accent hover:bg-void-200'
            : 'text-crt-white/20 cursor-not-allowed'
          }
        `}
        title={canAddTab ? 'New terminal (max 4)' : 'Maximum tabs reached'}
      >
        <PlusIcon />
      </button>
    </div>
  );
};

export default TabBar;
