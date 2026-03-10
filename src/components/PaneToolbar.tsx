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

const PaneToolbar: React.FC<PaneToolbarProps> = ({
  paneCount, isZoomed, onSplitH, onSplitV, onPreset, onToggleZoom,
}) => (
  <div className="flex items-center gap-2 px-2 py-1 bg-void border-b border-chrome/20 text-xs font-mono text-chrome/70">
    <button
      onClick={onSplitH}
      disabled={paneCount >= 4}
      className="hover:text-acid disabled:opacity-30"
      title="Split horizontal (Alt+-)"
    >
      [=]
    </button>
    <button
      onClick={onSplitV}
      disabled={paneCount >= 4}
      className="hover:text-acid disabled:opacity-30"
      title="Split vertical (Alt+\)"
    >
      [|]
    </button>
    <span className="text-chrome/30">|</span>
    <button onClick={() => onPreset('single')} className="hover:text-acid" title="Single pane">[1]</button>
    <button onClick={() => onPreset('side-by-side')} className="hover:text-acid" title="Side by side">[||]</button>
    <button onClick={() => onPreset('stacked')} className="hover:text-acid" title="Stacked">[==]</button>
    <button onClick={() => onPreset('grid-2x2')} className="hover:text-acid" title="Grid 2x2">[#]</button>
    <button onClick={() => onPreset('main-sidebar')} className="hover:text-acid" title="Main + sidebar">[|&gt;]</button>
    <span className="text-chrome/30">|</span>
    <button
      onClick={onToggleZoom}
      className={`hover:text-acid ${isZoomed ? 'text-acid' : ''}`}
      title="Toggle pane zoom (Alt+Z)"
    >
      {isZoomed ? '[Z]' : '[ ]'}
    </button>
    <span className="ml-auto text-chrome/40">{paneCount}/4 panes</span>
  </div>
);

export default PaneToolbar;
