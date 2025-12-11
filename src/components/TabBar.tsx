import React, { useState, useRef, useEffect } from 'react';
import { TerminalTab } from '../types';
import LayoutSelector, { LayoutMode } from './LayoutSelector';

interface TabBarProps {
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, newTitle: string) => void;
  canAddTab: boolean;
  layoutMode: LayoutMode;
  onSelectLayout: (mode: LayoutMode) => void;
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
  onRenameTab,
  canAddTab,
  layoutMode,
  onSelectLayout,
}) => {
  // Edit mode state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select input when edit mode activates
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleDoubleClick = (tabId: string, currentTitle: string, index: number) => {
    setEditingTabId(tabId);
    setEditValue(currentTitle || `Terminal ${index + 1}`);
  };

  const handleSave = () => {
    if (editingTabId) {
      const trimmed = editValue.trim();
      onRenameTab(editingTabId, trimmed);
      setEditingTabId(null);
      setEditValue('');
    }
  };

  const handleCancel = () => {
    setEditingTabId(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

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
            {editingTabId === tab.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                maxLength={24}
                className="flex-1 min-w-0 bg-transparent border-b border-accent text-xs font-mono text-crt-white outline-none px-0 py-0"
              />
            ) : (
              <span
                className="truncate flex-1 text-left"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleDoubleClick(tab.id, tab.title, index);
                }}
              >
                {tab.title || `Terminal ${index + 1}`}
              </span>
            )}
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

      {/* Separator */}
      <div className="w-px h-4 bg-void-300 mx-1" />

      {/* Layout Selector */}
      <LayoutSelector
        currentMode={layoutMode}
        availablePanes={tabs.length}
        onSelectLayout={onSelectLayout}
      />
    </div>
  );
};

export default TabBar;
