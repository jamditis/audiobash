import type { ActivityState } from '../types';

interface HSL {
  h: number;
  s: number;
  l: number;
}

export type PaneColorName = 'emerald' | 'cobalt' | 'crimson' | 'violet' | 'cyan' | 'amber' | 'rose' | 'acid';

export const DEFAULT_PANE_COLOR: PaneColorName = 'acid';

export const PANE_PALETTE: Record<PaneColorName, HSL> = {
  emerald: { h: 130, s: 50, l: 48 },
  cobalt:  { h: 215, s: 100, l: 67 },
  crimson: { h: 2, s: 93, l: 63 },
  violet:  { h: 265, s: 100, l: 77 },
  cyan:    { h: 170, s: 58, l: 52 },
  amber:   { h: 40, s: 73, l: 48 },
  rose:    { h: 330, s: 89, l: 72 },
  acid:    { h: 72, s: 100, l: 50 },
};

const GRAY = '#484f58';
const ERROR_RED = '#f85149';

const STORAGE_KEY = 'audiobash:pane-colors';

function hslToString(h: number, s: number, l: number): string {
  return `hsl(${h}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export function getStripColor(colorName: PaneColorName, state: ActivityState): string {
  if (state === 'error') return ERROR_RED;
  if (state === 'done' || state === 'inactive') return GRAY;

  const base = PANE_PALETTE[colorName] ?? PANE_PALETTE[DEFAULT_PANE_COLOR];

  if (state === 'active') {
    return hslToString(base.h, base.s, base.l);
  }
  if (state === 'fading') {
    return hslToString(base.h, base.s * 0.75, Math.max(10, base.l - 15));
  }
  // dim
  return hslToString(base.h, base.s * 0.5, Math.max(10, base.l - 30));
}

export function loadPaneColors(): Map<string, PaneColorName> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return new Map();
    return new Map(Object.entries(parsed) as [string, PaneColorName][]);
  } catch {
    return new Map();
  }
}

export function savePaneColor(terminalId: string, colorName: PaneColorName): void {
  const colors = loadPaneColors();
  colors.set(terminalId, colorName);
  const obj: Record<string, string> = {};
  colors.forEach((v, k) => { obj[k] = v; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}
