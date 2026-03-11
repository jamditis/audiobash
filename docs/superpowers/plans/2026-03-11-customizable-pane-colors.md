# Customizable pane colors implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed green/amber/gray/red activity strip with user-customizable pane colors that fade through brightness steps as terminals go idle.

**Architecture:** A new `paneColors.ts` utility owns the 8-color palette, HSL-based fade derivation, and localStorage persistence. The existing `usePaneActivity` hook gains 3 new states (fading/dim/inactive replace silent). PaneToolbar gets a color swatch button with a popover. PaneNode computes strip color from the pane's base color + activity state.

**Tech Stack:** React hooks, TypeScript, HSL color manipulation, localStorage, Tailwind CSS.

---

## File structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Update `ActivityState` to 6 states |
| `src/utils/paneColors.ts` | Create | Palette definitions, HSL fade derivation, localStorage persistence |
| `src/hooks/usePaneActivity.ts` | Modify | Update `deriveState` thresholds for fading/dim/inactive |
| `src/components/PaneNode.tsx` | Modify | Replace `ACTIVITY_COLORS` with `getStripColor(baseColor, state)` |
| `src/components/PaneToolbar.tsx` | Modify | Add color swatch button + popover picker |
| `src/components/PaneManager.tsx` | Modify | Own pane colors state, pass to PaneNode and PaneToolbar |
| `tests/unit/usePaneActivity.test.ts` | Modify | Update tests for 6 states |
| `tests/unit/paneColors.test.ts` | Create | Tests for color derivation and palette |

---

## Chunk 1: Data layer

### Task 1: Update ActivityState type and deriveState

**Files:**
- Modify: `src/types.ts:7`
- Modify: `src/hooks/usePaneActivity.ts:4,13-21`
- Modify: `tests/unit/usePaneActivity.test.ts`

- [ ] **Step 1: Update the ActivityState type**

In `src/types.ts`, replace line 7:

```typescript
// Before
export type ActivityState = 'active' | 'silent' | 'done' | 'error';

// After
export type ActivityState = 'active' | 'fading' | 'dim' | 'inactive' | 'done' | 'error';
```

- [ ] **Step 2: Update deriveState in usePaneActivity.ts**

Replace the `SILENCE_TIMEOUT_MS` constant and `deriveState` function:

```typescript
// Before (lines 4, 13-21)
const SILENCE_TIMEOUT_MS = 15000;
// ...
export function deriveState(activity: PaneActivity, now: number): ActivityState {
  if (activity.exited) {
    return activity.exitCode === 0 ? 'done' : 'error';
  }
  if (now - activity.lastOutputTime < SILENCE_TIMEOUT_MS) {
    return 'active';
  }
  return 'silent';
}

// After
const ACTIVE_MS = 15000;
const FADING_MS = 30000;
const DIM_MS = 60000;

export function deriveState(activity: PaneActivity, now: number): ActivityState {
  if (activity.exited) {
    return activity.exitCode === 0 ? 'done' : 'error';
  }
  const elapsed = now - activity.lastOutputTime;
  if (elapsed < ACTIVE_MS) return 'active';
  if (elapsed < FADING_MS) return 'fading';
  if (elapsed < DIM_MS) return 'dim';
  return 'inactive';
}
```

- [ ] **Step 3: Rewrite the test file**

Replace `tests/unit/usePaneActivity.test.ts` entirely:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveState } from '../../src/hooks/usePaneActivity';

interface PaneActivity {
  lastOutputTime: number;
  exited: boolean;
  exitCode: number | null;
}

describe('pane activity state derivation', () => {
  const NOW = 1710000000000;

  // Active: 0 - 15s
  it('returns active when output received within 15 seconds', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  it('returns active at exactly 14999ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 14999, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  // Fading: 15s - 30s
  it('returns fading at exactly 15000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 15000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('fading');
  });

  it('returns fading at 20000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 20000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('fading');
  });

  it('returns fading at exactly 29999ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 29999, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('fading');
  });

  // Dim: 30s - 60s
  it('returns dim at exactly 30000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 30000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('dim');
  });

  it('returns dim at 45000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 45000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('dim');
  });

  it('returns dim at exactly 59999ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 59999, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('dim');
  });

  // Inactive: 60s+
  it('returns inactive at exactly 60000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 60000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('inactive');
  });

  it('returns inactive at 120000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 120000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('inactive');
  });

  // Exit states
  it('returns done when process exited with code 0', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: true, exitCode: 0 };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('returns error when process exited with non-zero code', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: true, exitCode: 1 };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  it('returns error when process exited with code 127', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: true, exitCode: 127 };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  // Priority tests
  it('exit state takes priority over any timeout', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 120000, exited: true, exitCode: 0 };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('exit error takes priority over active output', () => {
    const activity: PaneActivity = { lastOutputTime: NOW, exited: true, exitCode: 1 };
    expect(deriveState(activity, NOW)).toBe('error');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/usePaneActivity.test.ts`
Expected: PASS — all 15 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/hooks/usePaneActivity.ts tests/unit/usePaneActivity.test.ts
git commit -m "feat: expand ActivityState to 6 states with fading/dim/inactive"
```

---

### Task 2: Create paneColors utility with tests

**Files:**
- Create: `tests/unit/paneColors.test.ts`
- Create: `src/utils/paneColors.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/paneColors.test.ts`:

```typescript
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
    // Acid is hsl(72, 100%, 50%) → should be vivid
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
    const names: PaneColorName[] = ['emerald', 'cobalt', 'crimson', 'violet', 'cyan', 'amber', 'rose', 'acid'];
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/paneColors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the paneColors utility**

Create `src/utils/paneColors.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/paneColors.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/utils/paneColors.ts tests/unit/paneColors.test.ts
git commit -m "feat: add pane color palette with HSL fade derivation and persistence"
```

---

## Chunk 2: UI integration

### Task 3: Update PaneNode to use getStripColor

**Files:**
- Modify: `src/components/PaneNode.tsx`

- [ ] **Step 1: Replace ACTIVITY_COLORS with getStripColor**

In `src/components/PaneNode.tsx`:

1. Replace the imports and color map (lines 5-12):

```typescript
// Before
import type { ActivityState } from '../types';

const ACTIVITY_COLORS: Record<ActivityState, string> = {
  active: '#3fb950',
  silent: '#d29922',
  done: '#484f58',
  error: '#f85149',
};

// After
import { getStripColor, type PaneColorName } from '../utils/paneColors';
```

2. Add `paneColors` to the props interface:

```typescript
interface PaneNodeProps {
  node: PaneNodeType;
  focusedId: string | null;
  zoomedId: string | null;
  isRecording: boolean;
  cliNotificationsEnabled: boolean;
  fontSize: number;
  activityStates: Map<string, ActivityState>;
  paneColors: Map<string, PaneColorName>;
  onFocus: (id: string) => void;
  onResize: (splitId: string, delta: number, containerSize: number) => void;
  onEqualize: (splitId: string) => void;
}
```

3. Destructure `paneColors` in the component signature:

```typescript
const PaneNodeComponent: React.FC<PaneNodeProps> = ({
  node, focusedId, zoomedId, isRecording, cliNotificationsEnabled, fontSize,
  activityStates, paneColors, onFocus, onResize, onEqualize,
}) => {
```

4. Update the leaf node color derivation (replace lines 35-36):

```typescript
// Before
const activityState = activityStates.get(node.terminalId) || 'active';
const stripColor = ACTIVITY_COLORS[activityState];

// After
const activityState = activityStates.get(node.terminalId) || 'active';
const colorName = paneColors.get(node.terminalId) || 'acid';
const stripColor = getStripColor(colorName, activityState);
```

5. Pass `paneColors` through both recursive calls (add `paneColors={paneColors}` alongside `activityStates={activityStates}`).

- [ ] **Step 2: Import ActivityState type for the prop**

The `activityStates` prop still needs the `ActivityState` type. Add it:

```typescript
import type { ActivityState } from '../types';
import { getStripColor, type PaneColorName } from '../utils/paneColors';
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: Existing tests pass. (PaneNode has no unit tests — it's integration-tested via the app.)

- [ ] **Step 4: Commit**

```bash
git add src/components/PaneNode.tsx
git commit -m "feat: use customizable pane colors for activity strip"
```

---

### Task 4: Add color swatch and popover to PaneToolbar

**Files:**
- Modify: `src/components/PaneToolbar.tsx`

- [ ] **Step 1: Add props for color**

Add imports and update the props interface:

```typescript
import React, { useState, useRef, useEffect } from 'react';
import type { PresetName } from '../utils/paneTree';
import { PANE_PALETTE, type PaneColorName } from '../utils/paneColors';
```

Update `PaneToolbarProps`:

```typescript
interface PaneToolbarProps {
  paneCount: number;
  isZoomed: boolean;
  currentColor: PaneColorName;
  onSplitH: () => void;
  onSplitV: () => void;
  onPreset: (name: PresetName) => void;
  onToggleZoom: () => void;
  onColorChange: (color: PaneColorName) => void;
}
```

- [ ] **Step 2: Change PaneToolbar from arrow function to function component with state**

The toolbar needs local state for the popover. Replace the entire component body:

```typescript
const PaneToolbar: React.FC<PaneToolbarProps> = ({
  paneCount, isZoomed, currentColor, onSplitH, onSplitV, onPreset, onToggleZoom, onColorChange,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPicker]);

  return (
    <div className="flex items-center gap-0.5 px-2 py-0.5 bg-void border-b border-void-300 text-xs font-mono select-none">
      {/* Split actions */}
      <button onClick={onSplitH} disabled={paneCount >= 4} className={paneCount >= 4 ? btnDisabled : btnDefault} title="Split horizontal (Alt+-)" aria-label="Split horizontal">
        <SplitHIcon />
      </button>
      <button onClick={onSplitV} disabled={paneCount >= 4} className={paneCount >= 4 ? btnDisabled : btnDefault} title="Split vertical (Alt+\)" aria-label="Split vertical">
        <SplitVIcon />
      </button>

      <span className="w-px h-3.5 bg-void-300 mx-1.5" />

      {/* Layout presets */}
      <button onClick={() => onPreset('single')} className={btnDefault} title="Single pane" aria-label="Single pane"><SingleIcon /></button>
      <button onClick={() => onPreset('side-by-side')} className={btnDefault} title="Side by side" aria-label="Side by side"><SideBySideIcon /></button>
      <button onClick={() => onPreset('stacked')} className={btnDefault} title="Stacked" aria-label="Stacked"><StackedIcon /></button>
      <button onClick={() => onPreset('grid-2x2')} className={btnDefault} title="Grid 2x2" aria-label="Grid 2x2"><GridIcon /></button>
      <button onClick={() => onPreset('main-sidebar')} className={btnDefault} title="Main + sidebar" aria-label="Main plus sidebar"><MainSidebarIcon /></button>

      <span className="w-px h-3.5 bg-void-300 mx-1.5" />

      {/* Zoom toggle */}
      <button onClick={onToggleZoom} className={isZoomed ? `${btnBase} text-accent hover:text-accent-glow hover:bg-void-300` : btnDefault} title="Toggle pane zoom (Alt+Z)" aria-label="Toggle pane zoom">
        <ZoomIcon active={isZoomed} />
      </button>

      <span className="w-px h-3.5 bg-void-300 mx-1.5" />

      {/* Color swatch */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(p => !p)}
          className={`${btnBase} hover:bg-void-300`}
          title="Pane color"
          aria-label="Change pane color"
        >
          <div
            className="w-3 h-3 rounded-sm border border-crt-white/30"
            style={{ backgroundColor: `hsl(${PANE_PALETTE[currentColor].h}, ${PANE_PALETTE[currentColor].s}%, ${PANE_PALETTE[currentColor].l}%)` }}
          />
        </button>
        {showPicker && (
          <div className="absolute top-full left-0 mt-1 flex gap-1.5 p-1.5 bg-[#1a1a1a] border border-[#444] rounded z-50 shadow-lg">
            {(Object.keys(PANE_PALETTE) as PaneColorName[]).map(name => (
              <button
                key={name}
                onClick={() => { onColorChange(name); setShowPicker(false); }}
                className="w-4 h-4 rounded-sm transition-all duration-100"
                style={{
                  backgroundColor: `hsl(${PANE_PALETTE[name].h}, ${PANE_PALETTE[name].s}%, ${PANE_PALETTE[name].l}%)`,
                  border: name === currentColor ? '1px solid #ccff00' : '1px solid transparent',
                  boxShadow: name === currentColor ? '0 0 4px rgba(204, 255, 0, 0.4)' : 'none',
                }}
                title={name.charAt(0).toUpperCase() + name.slice(1)}
                aria-label={`Set pane color to ${name}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pane counter */}
      <span className="ml-auto text-crt-white/25 tabular-nums tracking-wide">
        {paneCount}<span className="text-crt-white/15">/</span>4 panes
      </span>
    </div>
  );
};
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PaneToolbar.tsx
git commit -m "feat: add color swatch and picker popover to pane toolbar"
```

---

### Task 5: Wire pane colors into PaneManager

**Files:**
- Modify: `src/components/PaneManager.tsx`

- [ ] **Step 1: Add imports**

Add to the imports:

```typescript
import { loadPaneColors, savePaneColor, DEFAULT_PANE_COLOR, type PaneColorName } from '../utils/paneColors';
```

- [ ] **Step 2: Add pane colors state**

After `const activityStates = usePaneActivity();` (line 41), add:

```typescript
const [paneColors, setPaneColors] = useState<Map<string, PaneColorName>>(() => loadPaneColors());
```

- [ ] **Step 3: Add handleColorChange callback**

After the `resizeByDirection` callback (after line 204), add:

```typescript
const handleColorChange = useCallback((colorName: PaneColorName) => {
  if (!focusedPaneId) return;
  const leaves = flattenLeaves(paneRoot);
  const leaf = leaves.find(l => l.id === focusedPaneId);
  if (!leaf) return;
  savePaneColor(leaf.terminalId, colorName);
  setPaneColors(prev => {
    const next = new Map(prev);
    next.set(leaf.terminalId, colorName);
    return next;
  });
}, [focusedPaneId, paneRoot]);
```

- [ ] **Step 4: Derive currentColor for the toolbar**

Before the `return` JSX (before line 224), add:

```typescript
const focusedLeaf = focusedPaneId
  ? flattenLeaves(paneRoot).find(l => l.id === focusedPaneId)
  : null;
const currentColor: PaneColorName = focusedLeaf
  ? (paneColors.get(focusedLeaf.terminalId) ?? DEFAULT_PANE_COLOR)
  : DEFAULT_PANE_COLOR;
```

- [ ] **Step 5: Pass props to PaneToolbar**

Update the `<PaneToolbar>` JSX to include the new props:

```tsx
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
```

- [ ] **Step 6: Pass paneColors to PaneNodeComponent**

Add `paneColors={paneColors}` to the `<PaneNodeComponent>`:

```tsx
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
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/PaneManager.tsx
git commit -m "feat: wire pane color state into PaneManager"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run electron:dev`

- [ ] **Step 2: Verify default acid strip**

Open the app. The single terminal pane should show an acid-colored (#ccff00) 3px strip at the top.

- [ ] **Step 3: Verify color picker**

Click the colored swatch in the toolbar. A popover with 8 color swatches should appear. Click "Cobalt" (blue). The strip should change to blue.

- [ ] **Step 4: Verify fade steps**

Wait 15 seconds — strip should dim. Wait 30 seconds — strip should get darker. Wait 60 seconds — strip should go gray.

- [ ] **Step 5: Verify persistence**

Close and reopen the app. The pane should still show the color you picked.

- [ ] **Step 6: Verify multi-pane with different colors**

Split into 2 panes. Set different colors on each. Confirm they fade independently.

- [ ] **Step 7: Verify error override**

In a pane, run `cmd /c exit 1`. The strip should go red regardless of the pane's chosen color.

- [ ] **Step 8: Final commit with any fixups**

```bash
git add -A
git commit -m "feat: customizable pane colors — complete implementation"
```
