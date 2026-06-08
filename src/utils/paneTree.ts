// Binary tree pane data model for tmux-style pane management

export interface PaneLeaf {
  type: 'leaf';
  id: string;
  terminalId: string;
}

export interface PaneSplit {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  ratio: number; // 0-1, size of first child
  children: [PaneNode, PaneNode];
}

export type PaneNode = PaneLeaf | PaneSplit;

export type PresetName = 'single' | 'side-by-side' | 'stacked' | 'grid-2x2' | 'main-sidebar';

const MAX_PANES = 4;
let idCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now().toString(36)}`;
}

export function createLeaf(terminalId: string): PaneLeaf {
  return { type: 'leaf', id: nextId('pane'), terminalId };
}

export function flattenLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === 'leaf') return [node];
  return [...flattenLeaves(node.children[0]), ...flattenLeaves(node.children[1])];
}

export function findPane(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return node;
  if (node.type === 'split') {
    return findPane(node.children[0], id) || findPane(node.children[1], id);
  }
  return null;
}

export function splitPane(
  root: PaneNode,
  targetId: string,
  direction: 'horizontal' | 'vertical',
  newTerminalId: string,
): PaneNode {
  if (flattenLeaves(root).length >= MAX_PANES) return root;

  function walk(node: PaneNode): PaneNode {
    if (node.type === 'leaf' && node.id === targetId) {
      const newLeaf = createLeaf(newTerminalId);
      return {
        type: 'split',
        id: nextId('split'),
        direction,
        ratio: 0.5,
        children: [node, newLeaf],
      };
    }
    if (node.type === 'split') {
      return {
        ...node,
        children: [walk(node.children[0]), walk(node.children[1])],
      };
    }
    return node;
  }
  return walk(root);
}

export function closePane(root: PaneNode, targetId: string): PaneNode | null {
  if (root.type === 'leaf') {
    return root.id === targetId ? null : root;
  }

  const [first, second] = root.children;
  if (first.id === targetId) return second;
  if (second.id === targetId) return first;

  const newFirst = closePane(first, targetId);
  if (newFirst !== first) {
    return newFirst === null ? second : { ...root, children: [newFirst, second] };
  }
  const newSecond = closePane(second, targetId);
  if (newSecond !== second) {
    return newSecond === null ? first : { ...root, children: [first, newSecond] };
  }
  return root;
}

export function resizePane(root: PaneNode, targetId: string, newRatio: number): PaneNode {
  const clamped = Math.max(0.1, Math.min(0.9, newRatio));

  function walk(node: PaneNode): PaneNode {
    if (node.type !== 'split') return node;
    const inFirst = findPane(node.children[0], targetId);
    if (inFirst) return { ...node, ratio: clamped };
    const inSecond = findPane(node.children[1], targetId);
    if (inSecond) return { ...node, ratio: 1 - clamped };
    return {
      ...node,
      children: [walk(node.children[0]), walk(node.children[1])],
    };
  }
  return walk(root);
}

export function serializeTree(node: PaneNode): string {
  return JSON.stringify(node);
}

export function deserializeTree(json: string): PaneNode {
  return JSON.parse(json) as PaneNode;
}

export function applyPreset(name: PresetName, terminalIds: string[]): PaneNode {
  switch (name) {
    case 'single':
      return createLeaf(terminalIds[0]);

    case 'side-by-side': {
      const left = createLeaf(terminalIds[0]);
      const right = createLeaf(terminalIds[1] || terminalIds[0]);
      return {
        type: 'split',
        id: nextId('split'),
        direction: 'vertical',
        ratio: 0.5,
        children: [left, right],
      };
    }

    case 'stacked': {
      const top = createLeaf(terminalIds[0]);
      const bottom = createLeaf(terminalIds[1] || terminalIds[0]);
      return {
        type: 'split',
        id: nextId('split'),
        direction: 'horizontal',
        ratio: 0.5,
        children: [top, bottom],
      };
    }

    case 'grid-2x2': {
      const tl = createLeaf(terminalIds[0]);
      const tr = createLeaf(terminalIds[1] || terminalIds[0]);
      const bl = createLeaf(terminalIds[2] || terminalIds[0]);
      const br = createLeaf(terminalIds[3] || terminalIds[0]);
      const topRow: PaneSplit = {
        type: 'split',
        id: nextId('split'),
        direction: 'vertical',
        ratio: 0.5,
        children: [tl, tr],
      };
      const bottomRow: PaneSplit = {
        type: 'split',
        id: nextId('split'),
        direction: 'vertical',
        ratio: 0.5,
        children: [bl, br],
      };
      return {
        type: 'split',
        id: nextId('split'),
        direction: 'horizontal',
        ratio: 0.5,
        children: [topRow, bottomRow],
      };
    }

    case 'main-sidebar': {
      const main = createLeaf(terminalIds[0]);
      const side = createLeaf(terminalIds[1] || terminalIds[0]);
      return {
        type: 'split',
        id: nextId('split'),
        direction: 'vertical',
        ratio: 0.7,
        children: [main, side],
      };
    }
  }
}
