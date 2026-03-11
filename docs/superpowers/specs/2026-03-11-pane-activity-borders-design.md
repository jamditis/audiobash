# Pane activity borders

**Date:** 2026-03-11
**Status:** Approved

## Summary

Add a 3px colored strip to the top edge of each terminal pane that reflects the pane's activity state in real time. Inspired by jawn-tmux's colored pane borders for monitoring parallel AI agent sessions.

## Problem

When running multiple terminal panes (Claude Code in one, dev server in another, tests in a third), you have to visually scan each pane to know which agents are still working, which are waiting, and which have finished. There's no at-a-glance indicator.

## Solution

A thin colored strip at the top of each pane that changes color based on PTY activity:

| State | Color | Hex | Condition |
|-------|-------|-----|-----------|
| Active | Green | `#3fb950` | PTY output received within last 15 seconds |
| Silent | Amber | `#d29922` | No PTY output for 15+ seconds |
| Done | Gray | `#484f58` | Process exited with code 0 |
| Error | Red | `#f85149` | Process exited with non-zero code |

The strip is 3px tall, spans the full width of the pane, and sits at the top edge. Color transitions use a 200ms ease to avoid flashing.

## Data flow

```
PTY (node-pty)
  |
  ├── onData → IPC 'terminal-activity' { tabId, type: 'data' }
  └── onExit → IPC 'terminal-activity' { tabId, type: 'exit', exitCode }
        |
        v
  Renderer (usePaneActivity hook)
    - Map<tabId, { lastOutputTime, exitInfo }>
    - 1-second setInterval derives current state per terminal
    - Returns: Map<tabId, 'active' | 'silent' | 'done' | 'error'>
        |
        v
  PaneNode component
    - Reads state for its terminalId
    - Renders 3px top strip with state color
```

## Architecture

### New IPC channel: terminal-activity

Main process sends lightweight activity signals to the renderer. This is separate from the existing `terminal-data` channel to keep the activity tracking decoupled from terminal output rendering.

The `data` events should be throttled in the main process (at most one per second per terminal) to avoid flooding IPC with signals on every byte of PTY output.

### New hook: usePaneActivity

```typescript
type ActivityState = 'active' | 'silent' | 'done' | 'error';

interface PaneActivity {
  lastOutputTime: number;
  exitCode: number | null;
  exited: boolean;
}

function usePaneActivity(): Map<string, ActivityState>
```

The hook:
1. Listens to `terminal-activity` IPC events
2. Maintains a `Map<string, PaneActivity>` ref tracking per-terminal state
3. Runs a 1-second interval that derives `ActivityState` from the raw state
4. Returns a `Map<string, ActivityState>` that components can read

State derivation logic:
- If `exited` is true: return `exitCode === 0 ? 'done' : 'error'`
- If `Date.now() - lastOutputTime < 15000`: return `'active'`
- Otherwise: return `'silent'`

### PaneNode changes

The leaf node wrapper div gets a child strip element:

```tsx
<div className="h-full w-full relative">
  <div
    className="absolute top-0 left-0 right-0 h-[3px] z-10 transition-colors duration-200"
    style={{ backgroundColor: stateColor }}
  />
  <Terminal ... />
</div>
```

Color mapping:
```typescript
const ACTIVITY_COLORS: Record<ActivityState, string> = {
  active: '#3fb950',
  silent: '#d29922',
  done: '#484f58',
  error: '#f85149',
};
```

## Files to create

- `src/hooks/usePaneActivity.ts` — activity state tracking hook
- `tests/unit/usePaneActivity.test.ts` — hook logic tests

## Files to modify

- `electron/main.cjs` — emit `terminal-activity` IPC events on PTY data (throttled) and exit
- `electron/preload.cjs` — expose `onTerminalActivity` in context bridge
- `src/types.ts` — add `ActivityState` and `PaneActivity` types
- `src/components/PaneNode.tsx` — render top strip, consume activity state
- `src/components/PaneManager.tsx` — instantiate `usePaneActivity`, pass state down

## Constants

- `SILENCE_TIMEOUT_MS = 15000` — threshold for active-to-silent transition
- `ACTIVITY_POLL_INTERVAL_MS = 1000` — how often the hook re-derives state
- `ACTIVITY_THROTTLE_MS = 1000` — minimum interval between IPC data events per terminal

## Edge cases

- **Terminal pool reuse:** When a terminal is reused for a new pane (preset switching), its activity state should reset. The hook clears state for a terminal when it receives the first `data` event after an `exit`.
- **Single pane layout:** The strip renders the same way. No special casing.
- **New terminal spawn:** Starts in `active` state (lastOutputTime = now) since shell startup produces output.
- **Zoomed pane:** Strip still visible at top of zoomed pane.

## Out of scope

- Output tail preview / sidebar
- Cross-machine monitoring
- Task completion pattern matching (only uses exit codes)
- User-configurable timeout (hardcoded at 15s)
- Color customization in settings

## Testing

- Unit tests for state derivation logic (active/silent/done/error transitions)
- Unit tests for throttling behavior
- Unit tests for terminal reuse reset
- Verify strip renders in PaneNode (component test or manual)
