import React from 'react';
import type { PresetName } from '../utils/paneTree';

interface PaneToolbarProps {
  paneCount: number;
  isZoomed: boolean;
  onSplitH: () => void;
  onSplitV: () => void;
  onPreset: (name: PresetName) => void;
  onToggleZoom: () => void;
}

/* 14x14 inline SVG icons — each visually depicts the layout it creates */
const Icon = ({ children, size = 14 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const SplitHIcon = () => (
  <Icon>
    <rect x="1" y="1" width="12" height="5.5" rx="0.5" />
    <rect x="1" y="7.5" width="12" height="5.5" rx="0.5" />
  </Icon>
);

const SplitVIcon = () => (
  <Icon>
    <rect x="1" y="1" width="5.5" height="12" rx="0.5" />
    <rect x="7.5" y="1" width="5.5" height="12" rx="0.5" />
  </Icon>
);

const SingleIcon = () => (
  <Icon>
    <rect x="1" y="1" width="12" height="12" rx="0.5" />
  </Icon>
);

const SideBySideIcon = () => (
  <Icon>
    <rect x="1" y="1" width="5.5" height="12" rx="0.5" />
    <rect x="7.5" y="1" width="5.5" height="12" rx="0.5" />
  </Icon>
);

const StackedIcon = () => (
  <Icon>
    <rect x="1" y="1" width="12" height="5.5" rx="0.5" />
    <rect x="1" y="7.5" width="12" height="5.5" rx="0.5" />
  </Icon>
);

const GridIcon = () => (
  <Icon>
    <rect x="1" y="1" width="5.5" height="5.5" rx="0.5" />
    <rect x="7.5" y="1" width="5.5" height="5.5" rx="0.5" />
    <rect x="1" y="7.5" width="5.5" height="5.5" rx="0.5" />
    <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="0.5" />
  </Icon>
);

const MainSidebarIcon = () => (
  <Icon>
    <rect x="1" y="1" width="8" height="12" rx="0.5" />
    <rect x="10" y="1" width="3" height="12" rx="0.5" />
  </Icon>
);

const ZoomIcon = ({ active }: { active: boolean }) => (
  <Icon>
    {active ? (
      /* Shrink/restore — arrows pointing inward */
      <>
        <path d="M5 1v4H1" />
        <path d="M9 1v4h4" />
        <path d="M5 13V9H1" />
        <path d="M9 13V9h4" />
      </>
    ) : (
      /* Expand — arrows pointing outward */
      <>
        <path d="M1 5V1h4" />
        <path d="M13 5V1H9" />
        <path d="M1 9v4h4" />
        <path d="M13 9v4H9" />
      </>
    )}
  </Icon>
);

const btnBase = 'flex items-center justify-center w-6 h-6 rounded-sm transition-colors duration-100';
const btnDefault = `${btnBase} text-crt-white/50 hover:text-accent hover:bg-void-300`;
const btnDisabled = `${btnBase} text-crt-white/20 cursor-not-allowed`;

const PaneToolbar: React.FC<PaneToolbarProps> = ({
  paneCount, isZoomed, onSplitH, onSplitV, onPreset, onToggleZoom,
}) => (
  <div className="flex items-center gap-0.5 px-2 py-0.5 bg-void border-b border-void-300 text-xs font-mono select-none">
    {/* Split actions */}
    <button
      onClick={onSplitH}
      disabled={paneCount >= 4}
      className={paneCount >= 4 ? btnDisabled : btnDefault}
      title="Split horizontal (Alt+-)"
      aria-label="Split horizontal"
    >
      <SplitHIcon />
    </button>
    <button
      onClick={onSplitV}
      disabled={paneCount >= 4}
      className={paneCount >= 4 ? btnDisabled : btnDefault}
      title="Split vertical (Alt+\)"
      aria-label="Split vertical"
    >
      <SplitVIcon />
    </button>

    <span className="w-px h-3.5 bg-void-300 mx-1.5" />

    {/* Layout presets */}
    <button onClick={() => onPreset('single')} className={btnDefault} title="Single pane" aria-label="Single pane">
      <SingleIcon />
    </button>
    <button onClick={() => onPreset('side-by-side')} className={btnDefault} title="Side by side" aria-label="Side by side">
      <SideBySideIcon />
    </button>
    <button onClick={() => onPreset('stacked')} className={btnDefault} title="Stacked" aria-label="Stacked">
      <StackedIcon />
    </button>
    <button onClick={() => onPreset('grid-2x2')} className={btnDefault} title="Grid 2x2" aria-label="Grid 2x2">
      <GridIcon />
    </button>
    <button onClick={() => onPreset('main-sidebar')} className={btnDefault} title="Main + sidebar" aria-label="Main plus sidebar">
      <MainSidebarIcon />
    </button>

    <span className="w-px h-3.5 bg-void-300 mx-1.5" />

    {/* Zoom toggle */}
    <button
      onClick={onToggleZoom}
      className={isZoomed
        ? `${btnBase} text-accent hover:text-accent-glow hover:bg-void-300`
        : btnDefault
      }
      title="Toggle pane zoom (Alt+Z)"
      aria-label="Toggle pane zoom"
    >
      <ZoomIcon active={isZoomed} />
    </button>

    {/* Pane counter */}
    <span className="ml-auto text-crt-white/25 tabular-nums tracking-wide">
      {paneCount}<span className="text-crt-white/15">/</span>4 panes
    </span>
  </div>
);

export default PaneToolbar;
