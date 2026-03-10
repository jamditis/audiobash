import { describe, it, expect } from 'vitest';
import {
  createLeaf, splitPane, closePane, resizePane,
  findPane, flattenLeaves, applyPreset,
  serializeTree, deserializeTree,
} from '../../src/utils/paneTree';

describe('paneTree', () => {
  describe('createLeaf', () => {
    it('creates a leaf node with unique id', () => {
      const leaf = createLeaf('tab-1');
      expect(leaf.type).toBe('leaf');
      expect(leaf.terminalId).toBe('tab-1');
      expect(leaf.id).toBeTruthy();
    });

    it('creates leaves with different ids', () => {
      const a = createLeaf('tab-1');
      const b = createLeaf('tab-2');
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('splitPane', () => {
    it('splits a leaf into a split node with two children', () => {
      const root = createLeaf('tab-1');
      const result = splitPane(root, root.id, 'horizontal', 'tab-2');
      expect(result.type).toBe('split');
      if (result.type === 'split') {
        expect(result.direction).toBe('horizontal');
        expect(result.ratio).toBe(0.5);
        expect(result.children).toHaveLength(2);
      }
    });

    it('returns tree unchanged if target not found', () => {
      const root = createLeaf('tab-1');
      const result = splitPane(root, 'nonexistent', 'vertical', 'tab-2');
      expect(result).toEqual(root);
    });

    it('enforces max 4 panes', () => {
      let root = createLeaf('tab-1');
      root = splitPane(root, root.id, 'horizontal', 'tab-2');
      let leaves = flattenLeaves(root);
      root = splitPane(root, leaves[0].id, 'vertical', 'tab-3');
      leaves = flattenLeaves(root);
      root = splitPane(root, leaves[0].id, 'horizontal', 'tab-4');
      const countBefore = flattenLeaves(root).length;
      expect(countBefore).toBe(4);
      leaves = flattenLeaves(root);
      root = splitPane(root, leaves[0].id, 'vertical', 'tab-5');
      expect(flattenLeaves(root).length).toBe(4); // unchanged
    });

    it('creates vertical split', () => {
      const root = createLeaf('tab-1');
      const result = splitPane(root, root.id, 'vertical', 'tab-2');
      if (result.type === 'split') {
        expect(result.direction).toBe('vertical');
      }
    });
  });

  describe('closePane', () => {
    it('returns null when closing the only pane', () => {
      const root = createLeaf('tab-1');
      expect(closePane(root, root.id)).toBeNull();
    });

    it('returns sibling when closing one of two panes', () => {
      const root = createLeaf('tab-1');
      const split = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(split);
      const result = closePane(split, leaves[1].id);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('leaf');
    });

    it('preserves tree structure when closing nested pane', () => {
      let root = createLeaf('tab-1');
      root = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(root);
      root = splitPane(root, leaves[1].id, 'vertical', 'tab-3');
      // Close tab-3, should collapse back
      const allLeaves = flattenLeaves(root);
      const tab3 = allLeaves.find(l => l.terminalId === 'tab-3');
      if (tab3) {
        const result = closePane(root, tab3.id);
        expect(result).not.toBeNull();
        expect(flattenLeaves(result!)).toHaveLength(2);
      }
    });
  });

  describe('resizePane', () => {
    it('adjusts ratio of parent split', () => {
      const root = createLeaf('tab-1');
      const split = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(split);
      const result = resizePane(split, leaves[0].id, 0.3);
      if (result.type === 'split') {
        expect(result.ratio).toBe(0.3);
      }
    });

    it('clamps ratio at minimum 0.1', () => {
      const root = createLeaf('tab-1');
      const split = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(split);
      const result = resizePane(split, leaves[0].id, 0.02);
      if (result.type === 'split') {
        expect(result.ratio).toBeGreaterThanOrEqual(0.1);
      }
    });

    it('clamps ratio at maximum 0.9', () => {
      const root = createLeaf('tab-1');
      const split = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(split);
      const result = resizePane(split, leaves[0].id, 0.99);
      if (result.type === 'split') {
        expect(result.ratio).toBeLessThanOrEqual(0.9);
      }
    });
  });

  describe('findPane', () => {
    it('finds a leaf by id', () => {
      const root = createLeaf('tab-1');
      expect(findPane(root, root.id)).toBe(root);
    });

    it('finds nested pane', () => {
      let root = createLeaf('tab-1');
      root = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(root);
      expect(findPane(root, leaves[1].id)).toBe(leaves[1]);
    });

    it('returns null for missing id', () => {
      const root = createLeaf('tab-1');
      expect(findPane(root, 'nonexistent')).toBeNull();
    });
  });

  describe('flattenLeaves', () => {
    it('returns single leaf for leaf node', () => {
      const root = createLeaf('tab-1');
      expect(flattenLeaves(root)).toHaveLength(1);
    });

    it('returns all leaves in order', () => {
      let root = createLeaf('tab-1');
      root = splitPane(root, root.id, 'horizontal', 'tab-2');
      const leaves = flattenLeaves(root);
      expect(leaves).toHaveLength(2);
      expect(leaves[0].terminalId).toBe('tab-1');
      expect(leaves[1].terminalId).toBe('tab-2');
    });
  });

  describe('serialization', () => {
    it('round-trips a single leaf', () => {
      const root = createLeaf('tab-1');
      const json = serializeTree(root);
      const restored = deserializeTree(json);
      expect(restored.type).toBe('leaf');
      expect(flattenLeaves(restored)).toHaveLength(1);
    });

    it('round-trips a split tree', () => {
      let root = createLeaf('tab-1');
      root = splitPane(root, root.id, 'horizontal', 'tab-2');
      const json = serializeTree(root);
      const restored = deserializeTree(json);
      expect(flattenLeaves(restored)).toHaveLength(2);
    });
  });

  describe('presets', () => {
    it('creates single pane', () => {
      const tree = applyPreset('single', ['tab-1']);
      expect(flattenLeaves(tree)).toHaveLength(1);
    });

    it('creates side-by-side', () => {
      const tree = applyPreset('side-by-side', ['tab-1', 'tab-2']);
      expect(flattenLeaves(tree)).toHaveLength(2);
      if (tree.type === 'split') expect(tree.direction).toBe('vertical');
    });

    it('creates stacked', () => {
      const tree = applyPreset('stacked', ['tab-1', 'tab-2']);
      expect(flattenLeaves(tree)).toHaveLength(2);
      if (tree.type === 'split') expect(tree.direction).toBe('horizontal');
    });

    it('creates grid-2x2', () => {
      const tree = applyPreset('grid-2x2', ['t1', 't2', 't3', 't4']);
      expect(flattenLeaves(tree)).toHaveLength(4);
    });

    it('creates main-sidebar with 70/30 ratio', () => {
      const tree = applyPreset('main-sidebar', ['tab-1', 'tab-2']);
      if (tree.type === 'split') expect(tree.ratio).toBe(0.7);
    });
  });
});
