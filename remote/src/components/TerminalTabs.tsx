import React, { useRef, useEffect } from 'react';

interface Tab {
  /** Unique tab identifier */
  id: string;
  /** Display title for the tab */
  title: string;
}

interface TerminalTabsProps {
  /** Array of tabs to display */
  tabs: Tab[];
  /** ID of the currently active tab */
  activeTab: string;
  /** Callback when a tab is selected */
  onTabSelect: (tabId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Mobile-friendly tab bar for multi-terminal support.
 *
 * Features:
 * - Horizontal scrollable tabs
 * - Active tab highlighted with acid accent
 * - Touch-friendly tap targets (min 44px height)
 * - Auto-scroll active tab into view
 * - AudioBash void/brutalist aesthetic
 */
const TerminalTabs: React.FC<TerminalTabsProps> = ({
  tabs,
  activeTab,
  onTabSelect,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  /**
   * Scroll active tab into view when it changes
   */
  useEffect(() => {
    if (activeTabRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeElement = activeTabRef.current;

      // Calculate scroll position to center the active tab
      const containerWidth = container.offsetWidth;
      const elementLeft = activeElement.offsetLeft;
      const elementWidth = activeElement.offsetWidth;
      const targetScroll = elementLeft - containerWidth / 2 + elementWidth / 2;

      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeTab]);

  // Don't render if no tabs
  if (tabs.length === 0) {
    return null;
  }

  // Don't render tab bar for single tab
  if (tabs.length === 1) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`
        flex
        overflow-x-auto
        overflow-y-hidden
        bg-void
        border-b border-void-300
        scrollbar-hide
        ${className}
      `}
      style={{
        // Hide scrollbar but allow scrolling
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="flex flex-nowrap min-w-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => onTabSelect(tab.id)}
              className={`
                flex-shrink-0
                px-4
                min-h-[44px]
                flex items-center justify-center
                font-display font-semibold text-sm
                uppercase tracking-wider
                border-b-2
                transition-colors duration-100
                ${
                  isActive
                    ? 'text-acid border-acid bg-void-100'
                    : 'text-chrome/60 border-transparent hover:text-chrome hover:bg-void-100'
                }
              `}
              aria-selected={isActive}
              role="tab"
            >
              {/* Terminal indicator dot */}
              <span
                className={`
                  w-2 h-2 mr-2
                  ${isActive ? 'bg-crt-green' : 'bg-void-400'}
                `}
              />
              {tab.title}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TerminalTabs;
