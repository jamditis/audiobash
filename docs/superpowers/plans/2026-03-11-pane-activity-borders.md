# Pane activity borders implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3px colored top strip to each terminal pane that reflects activity state (active/silent/done/error), inspired by jawn-tmux.

**Architecture:** A new React hook (`usePaneActivity`) listens to the existing `onTerminalData` and `onTerminalClosed` IPC channels to track per-terminal activity timestamps and exit state. A 1-second interval derives the display state. PaneNode renders a colored strip div above each terminal leaf.

**Tech Stack:** React hooks, TypeScript, existing Electron IPC channels (no main process changes needed).

**Simplification from spec:** The spec proposed a new `terminal-activity` IPC channel with throttling in the main process. This is unnecessary — the existing `onTerminalData` and `onTerminalClosed` channels already provide the data. The hook just updates a timestamp on each data event (cheap operation, no throttling needed). This eliminates changes to `electron/main.cjs` and `electron/preload.cjs`.

---

## File structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add `ActivityState` type |
| `src/hooks/usePaneActivity.ts` | Create | Hook that tracks per-terminal activity state |
| `src/components/PaneNode.tsx` | Modify | Render 3px colored top strip on leaf nodes |
| `src/components/PaneManager.tsx` | Modify | Instantiate hook, pass activity states to PaneNode |
| `tests/unit/usePaneActivity.test.ts` | Create | Unit tests for state derivation logic |

---

## Chunk 1: Types and hook

### Task 1: Add ActivityState type

**Files:**
- Modify: `src/types.ts:1-3`

- [ ] **Step 1: Add ActivityState type to types.ts**

Add after the `ShellType` type (line 4):

```typescript
export type ActivityState = 'active' | 'silent' | 'done' | 'error';
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ActivityState type for pane activity borders"
```

---

### Task 2: Write tests for usePaneActivity

**Files:**
- Create: `tests/unit/usePaneActivity.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the state derivation logic directly (extracted as a pure function)
// The hook itself wraps this in React state management

const SILENCE_TIMEOUT_MS = 15000;

type ActivityState = 'active' | 'silent' | 'done' | 'error';

interface PaneActivity {
  lastOutputTime: number;
  exited: boolean;
  exitCode: number | null;
}

function deriveState(activity: PaneActivity, now: number): ActivityState {
  if (activity.exited) {
    return activity.exitCode === 0 ? 'done' : 'error';
  }
  if (now - activity.lastOutputTime < SILENCE_TIMEOUT_MS) {
    return 'active';
  }
  return 'silent';
}

describe('pane activity state derivation', () => {
  const NOW = 1710000000000;

  it('returns active when output received within 15 seconds', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000, // 5 seconds ago
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  it('returns active at exactly 14999ms', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 14999,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  it('returns silent when no output for 15+ seconds', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 15000,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('silent');
  });

  it('returns silent when no output for 60 seconds', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 60000,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('silent');
  });

  it('returns done when process exited with code 0', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: true,
      exitCode: 0,
    };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('returns error when process exited with non-zero code', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: true,
      exitCode: 1,
    };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  it('returns error when process exited with code 127', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: true,
      exitCode: 127,
    };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  it('exit state takes priority over silence timeout', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 60000, // long silence
      exited: true,
      exitCode: 0,
    };
    // Should be 'done', not 'silent'
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('exit state takes priority over active output', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW, // just now
      exited: true,
      exitCode: 1,
    };
    // Should be 'error', not 'active'
    expect(deriveState(activity, NOW)).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/usePaneActivity.test.ts`
Expected: FAIL — `deriveState` is defined inline in the test, so it should actually pass. This confirms the logic is correct before we wire it into the hook.

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/unit/usePaneActivity.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/usePaneActivity.test.ts
git commit -m "test: add pane activity state derivation tests"
```

---

### Task 3: Implement usePaneActivity hook

**Files:**
- Create: `src/hooks/usePaneActivity.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ActivityState } from '../types';

const SILENCE_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 1000;

interface PaneActivity {
  lastOutputTime: number;
  exited: boolean;
  exitCode: number | null;
}

export function deriveState(activity: PaneActivity, now: number): ActivityState {
  if (activity.exited) {
    return activity.exitCode === 0 ? 'done' : 'error';
  }
  if (now - activity.lastOutputTime < SILENCE_TIMEOUT_MS) {
    return 'active';
  }
  return 'silent';
}

export function usePaneActivity(): Map<string, ActivityState> {
  const activitiesRef = useRef<Map<string, PaneActivity>>(new Map());
  const [states, setStates] = useState<Map<string, ActivityState>>(new Map());

  // Listen for terminal output — just update timestamp
  useEffect(() => {
    const cleanup = window.electron.onTerminalData((tabId: string) => {
      const existing = activitiesRef.current.get(tabId);
      if (existing && existing.exited) {
        // Terminal reused after exit — reset state
        activitiesRef.current.set(tabId, {
          lastOutputTime: Date.now(),
          exited: false,
          exitCode: null,
        });
      } else {
        activitiesRef.current.set(tabId, {
          lastOutputTime: Date.now(),
          exited: existing?.exited ?? false,
          exitCode: existing?.exitCode ?? null,
        });
      }
    });
    return cleanup;
  }, []);

  // Listen for terminal close — record exit code
  useEffect(() => {
    const cleanup = window.electron.onTerminalClosed((tabId: string, exitCode: number) => {
      const existing = activitiesRef.current.get(tabId);
      activitiesRef.current.set(tabId, {
        lastOutputTime: existing?.lastOutputTime ?? Date.now(),
        exited: true,
        exitCode,
      });
    });
    return cleanup;
  }, []);

  // Poll every second to derive states from timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newStates = new Map<string, ActivityState>();
      activitiesRef.current.forEach((activity, tabId) => {
        newStates.set(tabId, deriveState(activity, now));
      });
      setStates(newStates);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return states;
}
```

- [ ] **Step 2: Update the test to import deriveState from the hook**

Replace the inline `deriveState` and types in `tests/unit/usePaneActivity.test.ts` with:

```typescript
import { deriveState } from '../../src/hooks/usePaneActivity';
```

Remove the inline `deriveState` function, `PaneActivity` interface, `ActivityState` type, and `SILENCE_TIMEOUT_MS` constant from the test file. Keep the `describe` block and all test cases — they now test the exported function.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/usePaneActivity.test.ts`
Expected: PASS — all 9 tests green, now testing the real exported function.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePaneActivity.ts tests/unit/usePaneActivity.test.ts
git commit -m "feat: add usePaneActivity hook for terminal activity tracking"
```

---

## Chunk 2: UI integration

### Task 4: Wire hook into PaneManager

**Files:**
- Modify: `src/components/PaneManager.tsx:1-2` (imports)
- Modify: `src/components/PaneManager.tsx:36` (hook call)
- Modify: `src/components/PaneManager.tsx:238-248` (pass prop)

- [ ] **Step 1: Add import**

Add to the imports at the top of `PaneManager.tsx`:

```typescript
import { usePaneActivity } from '../hooks/usePaneActivity';
```

And import the type:

```typescript
import type { ActivityState } from '../types';
```

- [ ] **Step 2: Call the hook inside the component**

Inside the `PaneManager` component body, after the existing `useState` calls (after line 39), add:

```typescript
const activityStates = usePaneActivity();
```

- [ ] **Step 3: Pass activityStates to PaneNodeComponent**

In the JSX where `PaneNodeComponent` is rendered (around line 238), add the `activityStates` prop:

```tsx
<PaneNodeComponent
  node={renderNode}
  focusedId={focusedPaneId}
  zoomedId={zoomedPaneId}
  isRecording={isRecording}
  cliNotificationsEnabled={cliNotificationsEnabled}
  fontSize={fontSize}
  activityStates={activityStates}
  onFocus={setFocusedPaneId}
  onResize={handleResize}
  onEqualize={handleEqualize}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PaneManager.tsx
git commit -m "feat: wire usePaneActivity hook into PaneManager"
```

---

### Task 5: Render activity strip in PaneNode

**Files:**
- Modify: `src/components/PaneNode.tsx`

- [ ] **Step 1: Add imports and color map**

Add the import at the top:

```typescript
import type { ActivityState } from '../types';
```

Add the color map constant before the component:

```typescript
const ACTIVITY_COLORS: Record<ActivityState, string> = {
  active: '#3fb950',
  silent: '#d29922',
  done: '#484f58',
  error: '#f85149',
};
```

- [ ] **Step 2: Add activityStates to props interface**

Update `PaneNodeProps` to include:

```typescript
activityStates: Map<string, ActivityState>;
```

- [ ] **Step 3: Destructure the new prop**

Add `activityStates` to the destructured props in the component signature.

- [ ] **Step 4: Render the strip in the leaf node**

In the leaf node branch (the `if (node.type === 'leaf')` block), change the return to:

```tsx
if (node.type === 'leaf') {
  const isFocused = node.id === focusedId;
  const activityState = activityStates.get(node.terminalId) || 'active';
  const stripColor = ACTIVITY_COLORS[activityState];
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
```

- [ ] **Step 5: Pass activityStates through recursive calls**

In the split node branch, pass `activityStates` to both recursive `PaneNodeComponent` children:

```tsx
<PaneNodeComponent
  node={node.children[0]}
  focusedId={focusedId} zoomedId={zoomedId} isRecording={isRecording}
  cliNotificationsEnabled={cliNotificationsEnabled} fontSize={fontSize}
  activityStates={activityStates}
  onFocus={onFocus} onResize={onResize} onEqualize={onEqualize}
/>
```

(Same for `node.children[1]`.)

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass, plus the 9 new activity tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/PaneNode.tsx
git commit -m "feat: render activity state strip on terminal panes"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run electron:dev`

- [ ] **Step 2: Verify single pane shows green strip**

Open the app. The single terminal pane should show a green 3px strip at the top (shell startup produces output).

- [ ] **Step 3: Verify silent transition**

Wait 15 seconds without typing. The strip should change from green to amber.

- [ ] **Step 4: Verify active transition back**

Type something in the terminal. The strip should change back to green.

- [ ] **Step 5: Verify multi-pane layout**

Split into 2 panes (Alt+-). Run a command in one pane, leave the other idle. Confirm each pane shows its own independent state color.

- [ ] **Step 6: Verify exit states**

In a pane, type `exit`. The strip should change to gray (done, exit code 0). In another pane, run a command that fails (e.g., `false` on Mac/Linux or `cmd /c exit 1` on Windows). The strip should change to red (error).

- [ ] **Step 7: Final commit with any fixups**

If any visual tweaks are needed (z-index, color adjustments), fix and commit:

```bash
git add -A
git commit -m "feat: pane activity borders — complete implementation"
```
