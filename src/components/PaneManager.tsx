import React, { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import PaneNodeComponent from './PaneNode';
import PaneToolbar from './PaneToolbar';
import {
  PaneNode, createLeaf, splitPane, closePane, flattenLeaves, applyPreset, findPane,
  type PresetName,
} from '../utils/paneTree';

export interface PaneManagerHandle {
  splitHorizontal: () => void;
  splitVertical: () => void;
  closeCurrentPane: () => void;
  toggleZoom: () => void;
  cyclePreset: () => void;
  focusNext: () => void;
  focusPrev: () => void;
  focusByIndex: (index: number) => void;
}

interface PaneManagerProps {
  initialTerminalId: string;
  isRecording: boolean;
  cliNotificationsEnabled: boolean;
  fontSize: number;
  onCreateTerminal: () => Promise<string>;
  onCloseTerminal: (tabId: string) => void;
}

const PRESET_CYCLE: PresetName[] = ['single', 'side-by-side', 'stacked', 'grid-2x2', 'main-sidebar'];

const PaneManager = forwardRef<PaneManagerHandle, PaneManagerProps>(({
  initialTerminalId, isRecording, cliNotificationsEnabled, fontSize,
  onCreateTerminal, onCloseTerminal,
}, ref) => {
  const [paneRoot, setPaneRoot] = useState<PaneNode>(() => createLeaf(initialTerminalId));
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);

  // Initialize focus to first pane
  useEffect(() => {
    const leaves = flattenLeaves(paneRoot);
    if (!focusedPaneId || !leaves.find(l => l.id === focusedPaneId)) {
      setFocusedPaneId(leaves[0]?.id || null);
    }
  }, [paneRoot, focusedPaneId]);

  const handleSplit = useCallback(async (direction: 'horizontal' | 'vertical') => {
    if (!focusedPaneId) return;
    if (flattenLeaves(paneRoot).length >= 4) return;
    const newTabId = await onCreateTerminal();
    setPaneRoot(prev => splitPane(prev, focusedPaneId, direction, newTabId));
  }, [focusedPaneId, paneRoot, onCreateTerminal]);

  const handleClose = useCallback((paneId: string) => {
    const leaves = flattenLeaves(paneRoot);
    const leaf = leaves.find(l => l.id === paneId);
    if (leaf) onCloseTerminal(leaf.terminalId);

    const newRoot = closePane(paneRoot, paneId);
    if (newRoot) {
      setPaneRoot(newRoot);
      if (zoomedPaneId === paneId) setZoomedPaneId(null);
    }
  }, [paneRoot, zoomedPaneId, onCloseTerminal]);

  const handleResize = useCallback((splitId: string, delta: number, containerSize: number) => {
    setPaneRoot(prev => {
      function walk(node: PaneNode): PaneNode {
        if (node.type !== 'split') return node;
        if (node.id === splitId) {
          const deltaRatio = delta / containerSize;
          const newRatio = Math.max(0.1, Math.min(0.9, node.ratio + deltaRatio));
          return { ...node, ratio: newRatio };
        }
        return { ...node, children: [walk(node.children[0]), walk(node.children[1])] };
      }
      return walk(prev);
    });
  }, []);

  const handleEqualize = useCallback((splitId: string) => {
    setPaneRoot(prev => {
      function walk(node: PaneNode): PaneNode {
        if (node.type !== 'split') return node;
        if (node.id === splitId) return { ...node, ratio: 0.5 };
        return { ...node, children: [walk(node.children[0]), walk(node.children[1])] };
      }
      return walk(prev);
    });
  }, []);

  const handlePreset = useCallback(async (preset: PresetName) => {
    const currentLeaves = flattenLeaves(paneRoot);
    const neededCount = preset === 'single' ? 1 : preset === 'grid-2x2' ? 4 : 2;
    const terminalIds = currentLeaves.map(l => l.terminalId);

    while (terminalIds.length < neededCount) {
      const newTabId = await onCreateTerminal();
      terminalIds.push(newTabId);
    }
    while (terminalIds.length > neededCount) {
      const removed = terminalIds.pop()!;
      onCloseTerminal(removed);
    }

    setPaneRoot(applyPreset(preset, terminalIds));
    setZoomedPaneId(null);
  }, [paneRoot, onCreateTerminal, onCloseTerminal]);

  const toggleZoom = useCallback(() => {
    setZoomedPaneId(prev => prev === focusedPaneId ? null : focusedPaneId);
  }, [focusedPaneId]);

  const focusNext = useCallback(() => {
    const leaves = flattenLeaves(paneRoot);
    if (leaves.length <= 1) return;
    const idx = leaves.findIndex(l => l.id === focusedPaneId);
    const next = (idx + 1) % leaves.length;
    setFocusedPaneId(leaves[next].id);
  }, [paneRoot, focusedPaneId]);

  const focusPrev = useCallback(() => {
    const leaves = flattenLeaves(paneRoot);
    if (leaves.length <= 1) return;
    const idx = leaves.findIndex(l => l.id === focusedPaneId);
    const prev = (idx - 1 + leaves.length) % leaves.length;
    setFocusedPaneId(leaves[prev].id);
  }, [paneRoot, focusedPaneId]);

  const focusByIndex = useCallback((index: number) => {
    const leaves = flattenLeaves(paneRoot);
    if (index >= 0 && index < leaves.length) {
      setFocusedPaneId(leaves[index].id);
    }
  }, [paneRoot]);

  const cyclePreset = useCallback(async () => {
    const next = (presetIndex + 1) % PRESET_CYCLE.length;
    setPresetIndex(next);
    await handlePreset(PRESET_CYCLE[next]);
  }, [presetIndex, handlePreset]);

  // Expose imperative handle for keyboard shortcuts
  useImperativeHandle(ref, () => ({
    splitHorizontal: () => handleSplit('horizontal'),
    splitVertical: () => handleSplit('vertical'),
    closeCurrentPane: () => { if (focusedPaneId) handleClose(focusedPaneId); },
    toggleZoom,
    cyclePreset,
    focusNext,
    focusPrev,
    focusByIndex,
  }), [handleSplit, handleClose, focusedPaneId, toggleZoom, cyclePreset, focusNext, focusPrev, focusByIndex]);

  // Render zoomed pane or full tree
  const renderNode = zoomedPaneId
    ? (flattenLeaves(paneRoot).find(l => l.id === zoomedPaneId) || paneRoot)
    : paneRoot;

  return (
    <div className="h-full w-full flex flex-col">
      <PaneToolbar
        paneCount={flattenLeaves(paneRoot).length}
        isZoomed={!!zoomedPaneId}
        onSplitH={() => handleSplit('horizontal')}
        onSplitV={() => handleSplit('vertical')}
        onPreset={handlePreset}
        onToggleZoom={toggleZoom}
      />
      <div className="flex-1 relative overflow-hidden">
        {zoomedPaneId && (
          <div className="absolute top-1 right-2 z-50 text-xs text-acid font-bold bg-void/80 px-2 py-0.5 border border-acid/30">
            ZOOMED
          </div>
        )}
        <PaneNodeComponent
          node={renderNode}
          focusedId={focusedPaneId}
          zoomedId={zoomedPaneId}
          isRecording={isRecording}
          cliNotificationsEnabled={cliNotificationsEnabled}
          fontSize={fontSize}
          onFocus={setFocusedPaneId}
          onResize={handleResize}
          onEqualize={handleEqualize}
        />
      </div>
    </div>
  );
});

PaneManager.displayName = 'PaneManager';

export default PaneManager;
