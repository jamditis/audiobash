# AudioBash feature backlog

> Last updated: February 2026 | Current version: 2.4.1

## Overview

This backlog tracks planned features for AudioBash, organized by priority and development phase.

---

## Priority levels

- **P0**: Critical - Core functionality improvements
- **P1**: High - Competitive parity with leading tools
- **P2**: Medium - Nice-to-have differentiators
- **P3**: Low - Future consideration

---

## Completed

These features have shipped:

- [x] **Local Whisper integration** (v2.3.0) — Offline transcription with tiny/base/small models
- [x] **Voice activity detection** (v2.1.0) — ElevenLabs Scribe v2 real-time with auto-commit on silence
- [x] **Custom vocabulary UI** (v1.1.0) — Map misheard words to correct spellings
- [x] **Custom instructions** (v1.1.0) — Per-mode transcription guidance
- [x] **CLI input notifications** (v1.1.0) — Audio chime on approval prompts
- [x] **Model cycling** (v2.3.0) — Click model name in voice overlay to switch providers
- [x] **Enhanced terminal context** (v1.0.2) — CWD, recent output, errors, OS, shell
- [x] **macOS support** (v2.0.0) — Native Apple Silicon and Intel builds
- [x] **Split view** (v1.0.4) — 5 layout modes with resizable panes
- [x] **Preview pane** (v2.3.x) — Embedded web preview with auto-refresh and screenshot capture
- [x] **Remote control** (v2.1.x) — Phone-based input via WebSocket, simplified in v2.4.1
- [x] **ElevenLabs real-time** (v2.1.0) — WebSocket streaming at ~150ms latency
- [x] **Code signing infrastructure** (v2.4.1) — Entitlements, notarization hook, hardened runtime

---

## Phase 1: macOS code signing (P0)

### 1.1 Signed + notarized builds
- **Status**: 🟡 Infrastructure ready, waiting on Apple Developer activation
- **Dependencies**: Apple Developer Program ($99/yr, paid, pending activation)

**Remaining tasks:**
- [ ] Create Developer ID Application certificate
- [ ] Get Team ID
- [ ] Create app-specific password for notarization
- [ ] Build signed + notarized DMGs
- [ ] Upload to GitHub release
- [ ] Update docs to remove "unsigned" warnings

---

## Phase 2: Smart recording (P1)

### 2.1 Continuous recording mode
- **Status**: 🔴 Not started
- **Effort**: Low (0.5 days)

**Tasks:**
- [ ] Implement auto-restart after transcription
- [ ] Add visual state for "listening for next command"
- [ ] Add escape hatch to exit continuous mode

---

## Phase 3: Context improvements (P1)

### 3.1 Project context detection
- **Status**: 🔴 Not started
- **Effort**: Medium (1 day)

**Tasks:**
- [ ] Detect project type (Node, Python, Rust, etc.)
- [ ] Read package.json/requirements.txt for dependencies
- [ ] Add project-specific vocabulary automatically

### 3.2 Active window context
- **Status**: 🔴 Not started
- **Effort**: Low (0.5 days)

**Tasks:**
- [ ] Capture active window title/app
- [ ] Different behavior for terminal vs browser vs IDE

---

## Phase 4: Agent mode improvements (P1)

### 4.1 Command confirmation mode
- **Status**: 🔴 Not started
- **Effort**: Low (0.5 days)

**Tasks:**
- [ ] Show command preview before execution
- [ ] "Dangerous command" detection (rm -rf, etc.)

### 4.2 Multi-step command chains
- **Status**: 🔴 Not started
- **Effort**: Medium (1-2 days)

**Tasks:**
- [ ] Parse "then" / "and then" in voice input
- [ ] Execute commands sequentially
- [ ] Stop on error

---

## Phase 5: Advanced features (P2)

### 5.1 Multi-language support
- **Status**: 🔴 Not started
- **Effort**: Medium (1-2 days)

### 5.2 Auto-learn vocabulary
- **Status**: 🔴 Not started
- **Effort**: Medium (1-2 days)

### 5.3 Voice command history browser
- **Status**: 🔴 Not started
- **Effort**: Low (0.5 days)

---

## Phase 6: Integrations (P3)

### 6.1 VS Code extension
- **Status**: 🔴 Not started
- **Effort**: High (3-5 days)

### 6.2 Plugin system
- **Status**: 🔴 Not started
- **Effort**: High (5+ days)

### 6.3 Linux support (AppImage, .deb)
- **Status**: 🔴 Not started (build config exists)

---

## Technical debt

- [ ] Enable TypeScript strict null checks
- [ ] Add E2E tests for voice flow
- [ ] Add CONTRIBUTING.md

---

## References

- [Release notes](https://audiobash.app/releases.html)
- [macOS build guide](./MACOS_BUILD.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
