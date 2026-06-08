# AudioBash v3.0.0 release design

**Date:** 2026-03-10
**Scope:** Bug fixes + tmux-style pane system + Anthropic /voice mode integration

---

## Summary

AudioBash v3.0.0 addresses four bugs (notification chimes, split view, window controls, zoom/resize), rebuilds the pane management system with a tmux-inspired tree architecture, and adds integration with Anthropic Claude Code /voice mode.

Three phases, executed in order: bug fixes first, then pane rebuild, then voice integration.

---

## Phase A: bug fixes

### A1. Notification chimes not firing

Three failure points in the current code path:

1. **AudioContext auto-suspend:** Chromium suspends AudioContext until a user gesture. Fix: pre-warm on first interaction, await resume() before scheduling oscillators.
2. **Fallback audio path:** Relative path resolves incorrectly in production builds. Fix: use Electron resource path or embed as base64 data URL.
3. **Pattern drift:** Audit 49 CLI_INPUT_PATTERNS against current Claude Code output. Add debug toggle in Settings.

Files: src/utils/notificationSound.ts, src/components/Settings.tsx, src/App.tsx

### A2. Window controls

- **Drag region:** Audit TitleBar.tsx no-drag attributes on all interactive elements.
- **State persistence:** Save window.getBounds() to userData/window-state.json (debounced). Restore on launch. Handle off-screen/resolution changes.

Files: electron/main.cjs, src/components/TitleBar.tsx

### A3. Zoom and resize

- **Font zoom:** Ctrl+Plus/Minus/0 shortcuts via IPC. Adjust xterm fontSize + fit. Persist in localStorage.
- **Window resize reflow:** Increase ResizeObserver debounce. Guard against unstable dimensions. Force re-fit after layout transitions.

Files: electron/main.cjs, electron/preload.cjs, src/components/Terminal.tsx, src/App.tsx

---

## Phase B: tmux-style pane system

### Architecture: binary tree

Replace flat pane array with a binary tree. Each node is leaf (terminal) or split (two children, horizontal or vertical). Splitting wraps target leaf in new split node. Closing collapses parent. Resize affects only siblings. Tree serializes for session save/restore.

### Data model

- PaneLeaf: type, id, terminalId
- PaneSplit: type, id, direction, ratio (0-1), children pair
- PaneState: root node, focusedPaneId, zoomedPaneId

### New components

- **PaneManager.tsx** - Top-level container, owns state, renders recursively
- **PaneNode.tsx** - Recursive renderer (leaf=Terminal, split=two children + divider)
- **PaneDivider.tsx** - Mouse+touch drag, min size enforcement, double-click equalize
- **PaneToolbar.tsx** - Layout visualization, quick-split buttons, session name

### Removed components

SplitContainer.tsx, ResizeDivider.tsx, LayoutSelector.tsx, FocusIndicator.tsx

### Keyboard shortcuts (Alt prefix)

- Alt+backslash: Split vertical
- Alt+-: Split horizontal
- Alt+Arrow: Move focus
- Alt+Shift+Arrow: Resize pane
- Alt+W: Close pane
- Alt+Z: Toggle pane zoom
- Alt+L: Cycle presets
- Alt+1-4: Focus by index

### Features

- Preset layouts: Single, Side-by-side, Stacked, Grid 2x2, Main+sidebar
- Named sessions: Alt+Shift+S to save, stored in userData/sessions.json
- Focus tracking: acid border, status bar info, voice targets focused pane
- Pane zoom: Alt+Z fullscreens one pane with ZOOMED badge
- Max 4 panes

---

## Phase C: Anthropic /voice mode integration

### Detection

New module src/utils/voiceModeDetector.ts monitors terminal output for /voice mode patterns. Emits { active, terminalId } state changes.

### Smart handoff

- Shows Claude Voice Active indicator on pane
- Push-to-talk targets different pane if available
- Single pane: disables AudioBash mic
- Badge shows voice source: AB or CC

### Enhanced value

Visual voice indicator, multi-terminal routing, transcription preview, quick toggle, notification chimes still fire.

### UI

Voice source indicator [AB Voice] / [CC /voice]. Mic button changes when CC voice active.

Files: src/utils/voiceModeDetector.ts (new), VoiceOverlay.tsx, StatusIndicator.tsx, App.tsx

---

## Testing

- Phase A: AudioContext, fallback path, patterns, window state, zoom
- Phase B: Pane tree ops, shortcuts, sessions, edge cases
- Phase C: Detection, handoff, mic routing
- Maintain 700+ test count

## Migration

- Preset layouts become tree presets
- localStorage carries over with fallback
- No breaking IPC changes
- Alt+L unchanged

## Version: 3.0.0 (major bump for pane rewrite)
