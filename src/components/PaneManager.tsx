import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import PaneNodeComponent from './PaneNode';
import PaneToolbar from './PaneToolbar';
import {
  PaneNode,
  PaneSplit,
  createLeaf,
  splitPane,
  closePane,
  flattenLeaves,
  applyPreset,
  findPane,
  type PresetName,
} from '../utils/paneTree';
import { usePaneActivity } from '../hooks/usePaneActivity';
import {
  loadPaneColors,
  savePaneColor,
  DEFAULT_PANE_COLOR,
  type PaneColorName,
} from '../utils/paneColors';

export interface PaneManagerHandle {
  splitHorizontal: () => void;
  splitVertical: () => void;
  closeCurrentPane: () => void;
  closePaneByTerminalId: (terminalId: string) => void;
  toggleZoom: () => void;
  cyclePreset: () => void;
  focusNext: () => void;
  focusPrev: () => void;
  focusByIndex: (index: number) => void;
  resizeByDirection: (direction: string) => void;
}

interface PaneManagerProps {
  initialTerminalId: string;
  isRecording: boolean;
  cliNotificationsEnabled: boolean;
  fontSize: number;
  onCreateTerminal: () => Promise<string>;
  onCloseTerminal: (tabId: string) => void;
}

const PRESET_CYCLE: PresetName[] = [
  'single',
  'side-by-side',
  'stacked',
  'grid-2x2',
  'main-sidebar',
];

const PaneManager = forwardRef<PaneManagerHandle, PaneManagerProps>(
  (
    {
      initialTerminalId,
      isRecording,
      cliNotificationsEnabled,
      fontSize,
      onCreateTerminal,
      onCloseTerminal,
    },
    ref,
  ) => {
    const [paneRoot, setPaneRoot] = useState<PaneNode>(() => createLeaf(initialTerminalId));
    const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
    const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null);
    const [presetIndex, setPresetIndex] = useState(0);
    const activityStates = usePaneActivity();
    const [paneColors, setPaneColors] = useState<Map<string, PaneColorName>>(() =>
      loadPaneColors(),
    );

    // Pool of all terminal IDs managed by panes — superset of current pane leaves.
    // Preset switching draws from this pool instead of creating/destroying terminals,
    // which preserves custom tab names and terminal content.
    const terminalPoolRef = useRef<string[]>([initialTerminalId]);

    // Initialize focus to first pane
    useEffect(() => {
      const leaves = flattenLeaves(paneRoot);
      if (!focusedPaneId || !leaves.find((l) => l.id === focusedPaneId)) {
        setFocusedPaneId(leaves[0]?.id || null);
      }
    }, [paneRoot, focusedPaneId]);

    const handleSplit = useCallback(
      async (direction: 'horizontal' | 'vertical') => {
        if (!focusedPaneId) return;
        if (flattenLeaves(paneRoot).length >= 4) return;
        const newTabId = await onCreateTerminal();
        terminalPoolRef.current.push(newTabId);
        setPaneRoot((prev) => splitPane(prev, focusedPaneId, direction, newTabId));
      },
      [focusedPaneId, paneRoot, onCreateTerminal],
    );

    const handleClose = useCallback(
      (paneId: string) => {
        const leaves = flattenLeaves(paneRoot);
        const leaf = leaves.find((l) => l.id === paneId);
        if (leaf) {
          onCloseTerminal(leaf.terminalId);
          terminalPoolRef.current = terminalPoolRef.current.filter((id) => id !== leaf.terminalId);
        }

        const newRoot = closePane(paneRoot, paneId);
        if (newRoot) {
          setPaneRoot(newRoot);
          if (zoomedPaneId === paneId) setZoomedPaneId(null);
        }
      },
      [paneRoot, zoomedPaneId, onCloseTerminal],
    );

    const closePaneByTerminalId = useCallback(
      (terminalId: string) => {
        const leaves = flattenLeaves(paneRoot);
        const leaf = leaves.find((l) => l.terminalId === terminalId);
        if (leaf && leaves.length > 1) {
          handleClose(leaf.id);
        }
      },
      [paneRoot, handleClose],
    );

    const handleResize = useCallback((splitId: string, delta: number, containerSize: number) => {
      setPaneRoot((prev) => {
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
      setPaneRoot((prev) => {
        function walk(node: PaneNode): PaneNode {
          if (node.type !== 'split') return node;
          if (node.id === splitId) return { ...node, ratio: 0.5 };
          return { ...node, children: [walk(node.children[0]), walk(node.children[1])] };
        }
        return walk(prev);
      });
    }, []);

    const handlePreset = useCallback(
      async (preset: PresetName) => {
        const neededCount = preset === 'single' ? 1 : preset === 'grid-2x2' ? 4 : 2;
        const pool = terminalPoolRef.current;

        // Reuse from pool first — only create new terminals if pool is too small.
        // This preserves custom tab names and terminal content across preset switches.
        while (pool.length < neededCount) {
          const newTabId = await onCreateTerminal();
          pool.push(newTabId);
        }

        // Use first N from pool for the layout
        const layoutIds = pool.slice(0, neededCount);

        setPaneRoot(applyPreset(preset, layoutIds));
        setZoomedPaneId(null);
      },
      [onCreateTerminal],
    );

    const toggleZoom = useCallback(() => {
      setZoomedPaneId((prev) => (prev === focusedPaneId ? null : focusedPaneId));
    }, [focusedPaneId]);

    const focusNext = useCallback(() => {
      const leaves = flattenLeaves(paneRoot);
      if (leaves.length <= 1) return;
      const idx = leaves.findIndex((l) => l.id === focusedPaneId);
      const next = (idx + 1) % leaves.length;
      setFocusedPaneId(leaves[next].id);
    }, [paneRoot, focusedPaneId]);

    const focusPrev = useCallback(() => {
      const leaves = flattenLeaves(paneRoot);
      if (leaves.length <= 1) return;
      const idx = leaves.findIndex((l) => l.id === focusedPaneId);
      const prev = (idx - 1 + leaves.length) % leaves.length;
      setFocusedPaneId(leaves[prev].id);
    }, [paneRoot, focusedPaneId]);

    const focusByIndex = useCallback(
      (index: number) => {
        const leaves = flattenLeaves(paneRoot);
        if (index >= 0 && index < leaves.length) {
          setFocusedPaneId(leaves[index].id);
        }
      },
      [paneRoot],
    );

    const cyclePreset = useCallback(async () => {
      const next = (presetIndex + 1) % PRESET_CYCLE.length;
      setPresetIndex(next);
      await handlePreset(PRESET_CYCLE[next]);
    }, [presetIndex, handlePreset]);

    const resizeByDirection = useCallback(
      (direction: string) => {
        if (!focusedPaneId) return;
        setPaneRoot((prev) => {
          function findParentSplit(node: PaneNode, targetId: string): PaneSplit | null {
            if (node.type !== 'split') return null;
            if (findPane(node.children[0], targetId) || findPane(node.children[1], targetId)) {
              if (node.children[0].type === 'split') {
                const deeper = findParentSplit(node.children[0], targetId);
                if (deeper) return deeper;
              }
              if (node.children[1].type === 'split') {
                const deeper = findParentSplit(node.children[1], targetId);
                if (deeper) return deeper;
              }
              return node;
            }
            return null;
          }

          const parent = findParentSplit(prev, focusedPaneId);
          if (!parent) return prev;

          const step = 0.05;
          let delta = 0;

          const isInFirst = !!findPane(parent.children[0], focusedPaneId);

          if (parent.direction === 'horizontal') {
            if (direction === 'up') delta = isInFirst ? -step : -step;
            else if (direction === 'down') delta = isInFirst ? step : step;
          } else {
            if (direction === 'left') delta = isInFirst ? -step : -step;
            else if (direction === 'right') delta = isInFirst ? step : step;
          }

          if (delta === 0) return prev;

          function walk(node: PaneNode): PaneNode {
            if (node.type !== 'split') return node;
            if (node.id === parent!.id) {
              const newRatio = Math.max(0.1, Math.min(0.9, node.ratio + delta));
              return { ...node, ratio: newRatio };
            }
            return { ...node, children: [walk(node.children[0]), walk(node.children[1])] };
          }
          return walk(prev);
        });
      },
      [focusedPaneId],
    );

    const handleColorChange = useCallback(
      (colorName: PaneColorName) => {
        if (!focusedPaneId) return;
        const leaves = flattenLeaves(paneRoot);
        const leaf = leaves.find((l) => l.id === focusedPaneId);
        if (!leaf) return;
        savePaneColor(leaf.terminalId, colorName);
        setPaneColors((prev) => {
          const next = new Map(prev);
          next.set(leaf.terminalId, colorName);
          return next;
        });
      },
      [focusedPaneId, paneRoot],
    );

    // Expose imperative handle for keyboard shortcuts
    useImperativeHandle(
      ref,
      () => ({
        splitHorizontal: () => handleSplit('horizontal'),
        splitVertical: () => handleSplit('vertical'),
        closeCurrentPane: () => {
          if (focusedPaneId) handleClose(focusedPaneId);
        },
        closePaneByTerminalId,
        toggleZoom,
        cyclePreset,
        focusNext,
        focusPrev,
        focusByIndex,
        resizeByDirection,
      }),
      [
        handleSplit,
        handleClose,
        closePaneByTerminalId,
        focusedPaneId,
        toggleZoom,
        cyclePreset,
        focusNext,
        focusPrev,
        focusByIndex,
        resizeByDirection,
      ],
    );

    // Render zoomed pane or full tree
    const renderNode = zoomedPaneId
      ? flattenLeaves(paneRoot).find((l) => l.id === zoomedPaneId) || paneRoot
      : paneRoot;

    const focusedLeaf = focusedPaneId
      ? flattenLeaves(paneRoot).find((l) => l.id === focusedPaneId)
      : null;
    const currentColor: PaneColorName = focusedLeaf
      ? (paneColors.get(focusedLeaf.terminalId) ?? DEFAULT_PANE_COLOR)
      : DEFAULT_PANE_COLOR;

    return (
      <div className="h-full w-full flex flex-col">
        <PaneToolbar
          paneCount={flattenLeaves(paneRoot).length}
          isZoomed={!!zoomedPaneId}
          currentColor={currentColor}
          onSplitH={() => handleSplit('horizontal')}
          onSplitV={() => handleSplit('vertical')}
          onPreset={handlePreset}
          onToggleZoom={toggleZoom}
          onColorChange={handleColorChange}
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
            activityStates={activityStates}
            paneColors={paneColors}
            onFocus={setFocusedPaneId}
            onResize={handleResize}
            onEqualize={handleEqualize}
          />
        </div>
      </div>
    );
  },
);

PaneManager.displayName = 'PaneManager';

export default PaneManager;
