import React, { useRef, useCallback, useMemo } from 'react';
import ResizeDivider from './ResizeDivider';
import { LayoutMode } from './LayoutSelector';

export interface PaneConfig {
  terminalId: string;
  size: number; // Percentage 0-100
}

export interface SplitLayoutState {
  mode: LayoutMode;
  panes: PaneConfig[];
  focusedTerminalId: string;
}

interface SplitContainerProps {
  layoutState: SplitLayoutState;
  onPaneResize: (paneIndex: number, delta: number) => void;
  children: React.ReactNode;
}

const MIN_PANE_SIZE = 15; // Minimum 15% per pane

const SplitContainer: React.FC<SplitContainerProps> = ({
  layoutState,
  onPaneResize,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((dividerIndex: number, delta: number) => {
    onPaneResize(dividerIndex, delta);
  }, [onPaneResize]);

  // Calculate grid styles based on layout mode and pane sizes
  const gridStyle = useMemo(() => {
    const { mode, panes } = layoutState;

    switch (mode) {
      case 'single':
        return {
          display: 'grid' as const,
          gridTemplate: '"main" 1fr / 1fr',
        };

      case 'split-horizontal':
        return {
          display: 'grid' as const,
          gridTemplateColumns: panes.length >= 2
            ? `${panes[0]?.size || 50}% ${panes[1]?.size || 50}%`
            : '50% 50%',
          gridTemplateRows: '1fr',
        };

      case 'split-vertical':
        return {
          display: 'grid' as const,
          gridTemplateRows: panes.length >= 2
            ? `${panes[0]?.size || 50}% ${panes[1]?.size || 50}%`
            : '50% 50%',
          gridTemplateColumns: '1fr',
        };

      case 'grid-2x2':
        return {
          display: 'grid' as const,
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
        };

      case 'grid-3':
        return {
          display: 'grid' as const,
          gridTemplateAreas: `"main top" "main bottom"`,
          gridTemplateColumns: `${panes[0]?.size || 60}% ${100 - (panes[0]?.size || 60)}%`,
          gridTemplateRows: '1fr 1fr',
        };

      default:
        return {
          display: 'grid' as const,
          gridTemplate: '"main" 1fr / 1fr',
        };
    }
  }, [layoutState]);

  // Determine which dividers to render based on layout mode
  const renderDividers = useMemo(() => {
    const { mode } = layoutState;

    switch (mode) {
      case 'split-horizontal':
        return [{ index: 0, orientation: 'horizontal' as const }];
      case 'split-vertical':
        return [{ index: 0, orientation: 'vertical' as const }];
      case 'grid-3':
        return [{ index: 0, orientation: 'horizontal' as const }];
      default:
        return [];
    }
  }, [layoutState.mode]);

  // Convert children to array for manipulation
  const childArray = React.Children.toArray(children);

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative"
      style={gridStyle}
    >
      {layoutState.mode === 'single' && childArray[0]}

      {layoutState.mode === 'split-horizontal' && (
        <>
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[0]}</div>
          <ResizeDivider
            orientation="horizontal"
            onResize={(delta) => handleResize(0, delta)}
          />
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[1]}</div>
        </>
      )}

      {layoutState.mode === 'split-vertical' && (
        <>
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[0]}</div>
          <ResizeDivider
            orientation="vertical"
            onResize={(delta) => handleResize(0, delta)}
          />
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[1]}</div>
        </>
      )}

      {layoutState.mode === 'grid-2x2' && (
        <>
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[0]}</div>
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[1]}</div>
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[2]}</div>
          <div className="min-w-0 min-h-0 overflow-hidden">{childArray[3]}</div>
        </>
      )}

      {layoutState.mode === 'grid-3' && (
        <>
          <div className="min-w-0 min-h-0 overflow-hidden" style={{ gridArea: 'main' }}>
            {childArray[0]}
          </div>
          <ResizeDivider
            orientation="horizontal"
            onResize={(delta) => handleResize(0, delta)}
          />
          <div className="min-w-0 min-h-0 overflow-hidden" style={{ gridArea: 'top' }}>
            {childArray[1]}
          </div>
          <div className="min-w-0 min-h-0 overflow-hidden" style={{ gridArea: 'bottom' }}>
            {childArray[2]}
          </div>
        </>
      )}
    </div>
  );
};

export default SplitContainer;
