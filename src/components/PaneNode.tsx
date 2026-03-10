import React, { useRef } from 'react';
import type { PaneNode as PaneNodeType } from '../utils/paneTree';
import Terminal from './Terminal';
import PaneDivider from './PaneDivider';

interface PaneNodeProps {
  node: PaneNodeType;
  focusedId: string | null;
  zoomedId: string | null;
  isRecording: boolean;
  cliNotificationsEnabled: boolean;
  fontSize: number;
  onFocus: (id: string) => void;
  onResize: (splitId: string, delta: number, containerSize: number) => void;
  onEqualize: (splitId: string) => void;
}

const PaneNodeComponent: React.FC<PaneNodeProps> = ({
  node, focusedId, zoomedId, isRecording, cliNotificationsEnabled, fontSize,
  onFocus, onResize, onEqualize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.type === 'leaf') {
    const isFocused = node.id === focusedId;
    return (
      <div className="h-full w-full relative">
        <Terminal
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
          onFocus={onFocus} onResize={onResize} onEqualize={onEqualize}
        />
      </div>
    </div>
  );
};

export default PaneNodeComponent;
