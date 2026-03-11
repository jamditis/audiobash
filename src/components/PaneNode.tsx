import React, { useRef } from 'react';
import type { PaneNode as PaneNodeType } from '../utils/paneTree';
import Terminal from './Terminal';
import PaneDivider from './PaneDivider';
import type { ActivityState } from '../types';
import { getStripColor, type PaneColorName } from '../utils/paneColors';

interface PaneNodeProps {
  node: PaneNodeType;
  focusedId: string | null;
  zoomedId: string | null;
  isRecording: boolean;
  cliNotificationsEnabled: boolean;
  fontSize: number;
  activityStates: Map<string, ActivityState>;
  paneColors?: Map<string, PaneColorName>;
  onFocus: (id: string) => void;
  onResize: (splitId: string, delta: number, containerSize: number) => void;
  onEqualize: (splitId: string) => void;
}

const PaneNodeComponent: React.FC<PaneNodeProps> = ({
  node, focusedId, zoomedId, isRecording, cliNotificationsEnabled, fontSize,
  activityStates, paneColors, onFocus, onResize, onEqualize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.type === 'leaf') {
    const isFocused = node.id === focusedId;
    const activityState = activityStates.get(node.terminalId) || 'active';
    const colorName = paneColors?.get(node.terminalId) || 'acid';
    const stripColor = getStripColor(colorName, activityState);
    return (
      <div className="h-full w-full relative">
        <div
          className="absolute top-0 left-0 right-0 h-[3px] z-10 transition-colors duration-200"
          style={{ backgroundColor: stripColor }}
        />
        <Terminal
          key={node.terminalId}
          tabId={node.terminalId}
          isActive={true}
          isVisible={true}
          isFocused={isFocused}
          isRecording={isRecording && isFocused}
          onFocus={() => onFocus(node.id)}
          cliNotificationsEnabled={cliNotificationsEnabled}
          fontSize={fontSize}
        />
      </div>
    );
  }

  const isHorizontal = node.direction === 'horizontal';
  const firstSize = `${node.ratio * 100}%`;
  const secondSize = `${(1 - node.ratio) * 100}%`;

  const handleResize = (delta: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerSize = isHorizontal ? rect.height : rect.width;
    onResize(node.id, delta, containerSize);
  };

  return (
    <div
      ref={containerRef}
      className={`h-full w-full flex ${isHorizontal ? 'flex-col' : 'flex-row'}`}
    >
      <div style={{ [isHorizontal ? 'height' : 'width']: firstSize }} className="overflow-hidden">
        <PaneNodeComponent
          node={node.children[0]}
          focusedId={focusedId} zoomedId={zoomedId} isRecording={isRecording}
          cliNotificationsEnabled={cliNotificationsEnabled} fontSize={fontSize}
          activityStates={activityStates} paneColors={paneColors}
          onFocus={onFocus} onResize={onResize} onEqualize={onEqualize}
        />
      </div>
      <PaneDivider
        direction={node.direction}
        onResize={handleResize}
        onEqualize={() => onEqualize(node.id)}
      />
      <div style={{ [isHorizontal ? 'height' : 'width']: secondSize }} className="overflow-hidden">
        <PaneNodeComponent
          node={node.children[1]}
          focusedId={focusedId} zoomedId={zoomedId} isRecording={isRecording}
          cliNotificationsEnabled={cliNotificationsEnabled} fontSize={fontSize}
          activityStates={activityStates} paneColors={paneColors}
          onFocus={onFocus} onResize={onResize} onEqualize={onEqualize}
        />
      </div>
    </div>
  );
};

export default PaneNodeComponent;
