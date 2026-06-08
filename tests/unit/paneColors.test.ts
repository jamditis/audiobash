import { describe, it, expect, beforeEach } from 'vitest';
import {
  PANE_PALETTE,
  getStripColor,
  loadPaneColors,
  savePaneColor,
  type PaneColorName,
} from '../../src/utils/paneColors';

describe('pane color palette', () => {
  it('has 8 preset colors', () => {
    expect(Object.keys(PANE_PALETTE)).toHaveLength(8);
  });

  it('each preset has h, s, l values', () => {
    for (const [name, hsl] of Object.entries(PANE_PALETTE)) {
      expect(hsl).toHaveProperty('h');
      expect(hsl).toHaveProperty('s');
      expect(hsl).toHaveProperty('l');
      expect(typeof hsl.h).toBe('number');
      expect(typeof hsl.s).toBe('number');
      expect(typeof hsl.l).toBe('number');
    }
  });

  it('includes acid as a preset', () => {
    expect(PANE_PALETTE.acid).toBeDefined();
  });
});

describe('getStripColor', () => {
  it('returns full color for active state', () => {
    const color = getStripColor('acid', 'active');
    expect(color).toMatch(/^hsl\(/);
  });

  it('returns dimmer color for fading state', () => {
    const active = getStripColor('cobalt', 'active');
    const fading = getStripColor('cobalt', 'fading');
    expect(active).not.toBe(fading);
  });

  it('returns darker color for dim state', () => {
    const fading = getStripColor('cobalt', 'fading');
    const dim = getStripColor('cobalt', 'dim');
    expect(fading).not.toBe(dim);
  });

  it('returns gray for inactive state', () => {
    expect(getStripColor('cobalt', 'inactive')).toBe('#484f58');
  });

  it('returns gray for done state', () => {
    expect(getStripColor('emerald', 'done')).toBe('#484f58');
  });

  it('returns red for error state regardless of base color', () => {
    expect(getStripColor('cobalt', 'error')).toBe('#f85149');
    expect(getStripColor('acid', 'error')).toBe('#f85149');
    expect(getStripColor('rose', 'error')).toBe('#f85149');
  });

  it('works for all palette colors in active state', () => {
    const names: PaneColorName[] = [
      'emerald',
      'cobalt',
      'crimson',
      'violet',
      'cyan',
      'amber',
      'rose',
      'acid',
    ];
    for (const name of names) {
      const color = getStripColor(name, 'active');
      expect(color).toMatch(/^hsl\(/);
    }
  });

  it('falls back to acid for unknown color name', () => {
    const color = getStripColor('nonexistent' as PaneColorName, 'active');
    const acidColor = getStripColor('acid', 'active');
    expect(color).toBe(acidColor);
  });
});

describe('pane color persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty map when nothing saved', () => {
    const colors = loadPaneColors();
    expect(colors.size).toBe(0);
  });

  it('saves and loads a color', () => {
    savePaneColor('tab-1', 'cobalt');
    const colors = loadPaneColors();
    expect(colors.get('tab-1')).toBe('cobalt');
  });

  it('saves multiple colors', () => {
    savePaneColor('tab-1', 'cobalt');
    savePaneColor('tab-2', 'crimson');
    const colors = loadPaneColors();
    expect(colors.get('tab-1')).toBe('cobalt');
    expect(colors.get('tab-2')).toBe('crimson');
  });

  it('overwrites existing color', () => {
    savePaneColor('tab-1', 'cobalt');
    savePaneColor('tab-1', 'rose');
    const colors = loadPaneColors();
    expect(colors.get('tab-1')).toBe('rose');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('audiobash:pane-colors', 'not-json');
    const colors = loadPaneColors();
    expect(colors.size).toBe(0);
  });
});
