import React from 'react';

// Layout modes
export type LayoutMode = 'single' | 'split-horizontal' | 'split-vertical' | 'grid-2x2' | 'grid-3';

interface LayoutSelectorProps {
  currentMode: LayoutMode;
  availablePanes: number; // How many terminals exist
  onSelectLayout: (mode: LayoutMode) => void;
}

// SVG icons for each layout
const SingleIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="1" width="14" height="14" rx="1" />
  </svg>
);

const SplitHIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="1" width="6" height="14" rx="1" />
    <rect x="9" y="1" width="6" height="14" rx="1" />
  </svg>
);

const SplitVIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="1" width="14" height="6" rx="1" />
    <rect x="1" y="9" width="14" height="6" rx="1" />
  </svg>
);

const Grid2x2Icon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="1" width="6" height="6" rx="1" />
    <rect x="9" y="1" width="6" height="6" rx="1" />
    <rect x="1" y="9" width="6" height="6" rx="1" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
);

const Grid3Icon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <rect x="1" y="1" width="8" height="14" rx="1" />
    <rect x="11" y="1" width="4" height="6" rx="1" />
    <rect x="11" y="9" width="4" height="6" rx="1" />
  </svg>
);

const layouts: { mode: LayoutMode; icon: React.ReactNode; minTabs: number; title: string }[] = [
  { mode: 'single', icon: <SingleIcon />, minTabs: 1, title: 'Single view' },
  { mode: 'split-horizontal', icon: <SplitHIcon />, minTabs: 2, title: 'Split horizontal' },
  { mode: 'split-vertical', icon: <SplitVIcon />, minTabs: 2, title: 'Split vertical' },
  { mode: 'grid-2x2', icon: <Grid2x2Icon />, minTabs: 4, title: '2x2 grid' },
  { mode: 'grid-3', icon: <Grid3Icon />, minTabs: 3, title: '1+2 layout' },
];

const LayoutSelector: React.FC<LayoutSelectorProps> = ({
  currentMode,
  availablePanes,
  onSelectLayout,
}) => {
  return (
    <div className="flex items-center gap-0.5">
      {layouts.map(({ mode, icon, minTabs, title }) => {
        const isDisabled = availablePanes < minTabs;
        const isActive = currentMode === mode;

        return (
          <button
            key={mode}
            onClick={() => !isDisabled && onSelectLayout(mode)}
            disabled={isDisabled}
            title={isDisabled ? `Requires ${minTabs} terminals` : title}
            className={`
              p-1 rounded transition-colors
              ${isActive
                ? 'bg-accent/20 text-accent'
                : isDisabled
                  ? 'text-crt-white/20 cursor-not-allowed'
                  : 'text-crt-white/50 hover:text-crt-white hover:bg-void-200'
              }
            `}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
};

export default LayoutSelector;
