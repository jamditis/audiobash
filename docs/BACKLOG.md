# AudioBash Feature Backlog

> Last updated: December 2025 | Version: 2.0 Planning

## Overview

This backlog tracks planned features for AudioBash, organized by priority and development phase. Features are informed by competitive analysis of Aqua Voice, Wispr Flow, SuperWhisper, and open source alternatives.

---

## Priority Levels

- **P0**: Critical - Core functionality improvements
- **P1**: High - Competitive parity with leading tools
- **P2**: Medium - Nice-to-have differentiators
- **P3**: Low - Future consideration

---

## Phase 1: Local Processing (P0)

Goal: Eliminate cloud dependency for basic transcription, reduce costs to $0.

### 1.1 Local Whisper Integration
- **Status**: 🔴 Not Started
- **Effort**: Medium (1-2 days)
- **Dependencies**: None

**Tasks:**
- [ ] Add `nodejs-whisper` package to dependencies
- [ ] Create `electron/whisperLocal.cjs` service
- [ ] Add model download/management in Settings
- [ ] Implement model selection UI (tiny/base/small)
- [ ] Add progress indicator for first-time model download
- [ ] Handle audio format conversion (WebM → WAV)
- [ ] Add IPC handlers in main process

**Files to Modify:**
- `package.json` - Add nodejs-whisper
- `electron/main.cjs` - Add IPC handlers
- `electron/preload.cjs` - Expose transcribeLocal
- `src/services/transcriptionService.ts` - Add local providers
- `src/components/Settings.tsx` - Add model management UI

**Acceptance Criteria:**
- User can transcribe without any API key
- Model downloads automatically on first use
- Supports tiny.en, base.en, small.en models
- Performance: <2s for 10s audio on M1 Mac

### 1.2 Vosk Streaming Option
- **Status**: 🔴 Not Started
- **Effort**: Medium (1-2 days)
- **Dependencies**: 1.1

**Tasks:**
- [ ] Add `vosk` package
- [ ] Download and bundle small English model (50MB)
- [ ] Implement streaming transcription
- [ ] Add word-by-word output display
- [ ] Create toggle between Whisper/Vosk in Settings

**Rationale:** Vosk offers <100ms latency vs Whisper's ~500ms, better for quick commands.

---

## Phase 2: Smart Recording (P0)

Goal: Improve recording UX with automatic speech detection.

### 2.1 Voice Activity Detection (VAD)
- **Status**: 🔴 Not Started
- **Effort**: Medium (1-2 days)
- **Dependencies**: None

**Tasks:**
- [ ] Add `@ricky0123/vad-web` package
- [ ] Create `src/hooks/useVAD.ts` hook
- [ ] Implement auto-stop on silence
- [ ] Add visual feedback for speech detection
- [ ] Configure silence threshold in Settings
- [ ] Add recording modes: Manual / VAD / Continuous

**Files to Modify:**
- `package.json` - Add vad-web
- `src/components/VoiceOverlay.tsx` - Integrate VAD
- `src/components/Settings.tsx` - Add VAD settings

**Acceptance Criteria:**
- Recording auto-stops after 1.5s of silence (configurable)
- Visual indicator shows speech vs silence
- Works alongside existing manual recording

### 2.2 Continuous Recording Mode
- **Status**: 🔴 Not Started
- **Effort**: Low (0.5 days)
- **Dependencies**: 2.1

**Tasks:**
- [ ] Implement auto-restart after transcription
- [ ] Add visual state for "listening for next command"
- [ ] Add escape hatch to exit continuous mode
- [ ] Handle rapid successive commands

---

## Phase 3: Context Awareness (P1)

Goal: Match Aqua Voice's "Deep Context" feature for better technical accuracy.

### 3.1 Enhanced Terminal Context
- **Status**: 🟡 Partial (basic context exists)
- **Effort**: Low (0.5 days)
- **Dependencies**: None

**Current State:** Already captures CWD, recent output, OS, shell, last command/error.

**Tasks:**
- [ ] Increase context window (currently 500 chars → 2000)
- [ ] Parse recent output for file names, paths, variables
- [ ] Extract error patterns for smarter "fix it" commands
- [ ] Add git branch/status to context

**Files to Modify:**
- `electron/main.cjs` - Enhance getTerminalContext
- `src/services/transcriptionService.ts` - Expand buildAgentPrompt

### 3.2 Project Context Detection
- **Status**: 🔴 Not Started
- **Effort**: Medium (1 day)
- **Dependencies**: 3.1

**Tasks:**
- [ ] Detect project type (Node, Python, Rust, etc.)
- [ ] Read package.json/requirements.txt for dependencies
- [ ] Identify framework (React, Vue, Django, etc.)
- [ ] Add project-specific vocabulary automatically

**Example Context:**
```json
{
  "projectType": "node",
  "framework": "react",
  "testRunner": "vitest",
  "packageManager": "npm",
  "mainDependencies": ["electron", "xterm.js", "node-pty"]
}
```

### 3.3 Active Window Context
- **Status**: 🔴 Not Started
- **Effort**: Low (0.5 days)
- **Dependencies**: None

**Tasks:**
- [ ] Add `active-win` package
- [ ] Capture active window title/app
- [ ] Use context in agent prompt
- [ ] Different behavior for terminal vs browser vs IDE

---

## Phase 4: Custom Vocabulary (P1)

Goal: Match Wispr Flow's custom vocabulary and "learn my words" feature.

### 4.1 Vocabulary Management UI
- **Status**: 🟡 Partial (data structure exists)
- **Effort**: Medium (1 day)
- **Dependencies**: None

**Current State:** `VocabularyEntry` interface exists but no UI.

**Tasks:**
- [ ] Create vocabulary editor in Settings
- [ ] Add import/export vocabulary (JSON)
- [ ] Add "Add to vocabulary" from transcript
- [ ] Sync vocabulary across devices (optional)

**Files to Modify:**
- `src/components/Settings.tsx` - Add vocabulary section
- `src/services/transcriptionService.ts` - Enhance vocabulary processing

### 4.2 Auto-Learn Vocabulary
- **Status**: 🔴 Not Started
- **Effort**: Medium (1-2 days)
- **Dependencies**: 4.1

**Tasks:**
- [ ] Track correction patterns (user edits transcript)
- [ ] Suggest vocabulary entries from corrections
- [ ] Learn from successfully executed commands
- [ ] Per-project vocabulary profiles

---

## Phase 5: Agent Mode Enhancements (P1)

Goal: Make agent mode smarter and more reliable.

### 5.1 Command Confirmation Mode
- **Status**: 🔴 Not Started
- **Effort**: Low (0.5 days)
- **Dependencies**: None

**Tasks:**
- [ ] Add optional confirmation before executing
- [ ] Show command preview with syntax highlighting
- [ ] Allow quick edit before execution
- [ ] "Dangerous command" detection (rm -rf, etc.)

### 5.2 Command History & Undo
- **Status**: 🔴 Not Started
- **Effort**: Medium (1 day)
- **Dependencies**: None

**Tasks:**
- [ ] Track voice-initiated commands
- [ ] Add "undo last command" voice command
- [ ] Show recent voice commands in overlay
- [ ] Learn from successful/failed commands

### 5.3 Multi-Step Command Chains
- **Status**: 🔴 Not Started
- **Effort**: Medium (1-2 days)
- **Dependencies**: 5.1

**Tasks:**
- [ ] Parse "then" / "and then" in voice input
- [ ] Execute commands sequentially
- [ ] Stop on error with rollback option
- [ ] Show progress through command chain

**Example:** "git add all files then commit with message fixed bug then push"

---

## Phase 6: Performance & UX (P2)

### 6.1 Streaming Transcription Display
- **Status**: 🔴 Not Started
- **Effort**: Medium (1 day)
- **Dependencies**: 1.2 or local Whisper streaming

**Tasks:**
- [ ] Show words as they're transcribed
- [ ] Typing animation effect
- [ ] Handle corrections/updates smoothly

### 6.2 Improved Audio Visualization
- **Status**: 🟡 Exists (basic waveform)
- **Effort**: Low (0.5 days)
- **Dependencies**: None

**Tasks:**
- [ ] Add spectrogram view option
- [ ] Show speech vs silence regions
- [ ] Add volume level indicator
- [ ] Improve visual feedback during processing

### 6.3 Keyboard Navigation
- **Status**: 🔴 Not Started
- **Effort**: Low (0.5 days)
- **Dependencies**: None

**Tasks:**
- [ ] Navigate transcript history with arrows
- [ ] Quick re-send previous transcript
- [ ] Edit mode for transcript correction

---

## Phase 7: Advanced Features (P2)

### 7.1 Whisper Model Fine-Tuning
- **Status**: 🔴 Not Started
- **Effort**: High (3-5 days)
- **Dependencies**: 1.1, 4.2

**Tasks:**
- [ ] Collect user corrections as training data
- [ ] Implement local fine-tuning pipeline
- [ ] Create personalized model per user
- [ ] A/B test accuracy improvements

### 7.2 Multi-Language Support
- **Status**: 🔴 Not Started
- **Effort**: Medium (1-2 days)
- **Dependencies**: 1.1

**Tasks:**
- [ ] Add language selector in Settings
- [ ] Download appropriate Whisper models
- [ ] Auto-detect language option
- [ ] Translate to English option (for agent mode)

### 7.3 Audio File Transcription
- **Status**: 🔴 Not Started
- **Effort**: Low (0.5 days)
- **Dependencies**: 1.1

**Tasks:**
- [ ] Add "Transcribe File" option
- [ ] Support MP3, WAV, M4A, WebM
- [ ] Show progress for long files
- [ ] Output to clipboard or file

---

## Phase 8: Integration & Extensibility (P3)

### 8.1 VS Code Extension
- **Status**: 🔴 Not Started
- **Effort**: High (3-5 days)
- **Dependencies**: Core features stable

**Tasks:**
- [ ] Create VS Code extension
- [ ] WebSocket connection to AudioBash
- [ ] Voice commands for VS Code actions
- [ ] Insert transcripts at cursor

### 8.2 Plugin System
- **Status**: 🔴 Not Started
- **Effort**: High (5+ days)
- **Dependencies**: Core architecture stable

**Tasks:**
- [ ] Define plugin API
- [ ] Allow custom voice commands
- [ ] Custom transcription providers
- [ ] Custom post-processors

### 8.3 API/CLI Mode
- **Status**: 🔴 Not Started
- **Effort**: Medium (2 days)
- **Dependencies**: 1.1

**Tasks:**
- [ ] Headless transcription mode
- [ ] HTTP API for external apps
- [ ] CLI tool: `audiobash transcribe file.mp3`
- [ ] Pipe support: `cat audio.wav | audiobash`

---

## Technical Debt

### TD1: TypeScript Strict Mode
- [ ] Enable strict null checks
- [ ] Fix all type errors
- [ ] Add missing type definitions

### TD2: Test Coverage
- [ ] Add unit tests for transcriptionService
- [ ] Add integration tests for IPC
- [ ] Add E2E tests for voice flow
- [ ] Target: 80% coverage

### TD3: Error Handling
- [ ] Standardize error types
- [ ] Add error recovery for transcription failures
- [ ] Improve error messages for users
- [ ] Add telemetry (opt-in) for debugging

### TD4: Documentation
- [x] Add VOICE_DICTATION_RESEARCH.md
- [x] Add BACKLOG.md
- [ ] Add ARCHITECTURE.md
- [ ] Add CONTRIBUTING.md
- [ ] Improve inline code documentation

---

## Milestones

### v1.4.0 - Local First
- Local Whisper integration (1.1)
- VAD auto-stop (2.1)
- Model management UI

### v1.5.0 - Context Aware
- Enhanced terminal context (3.1)
- Project context detection (3.2)
- Vocabulary management UI (4.1)

### v2.0.0 - Smart Agent
- Continuous recording mode (2.2)
- Command confirmation (5.1)
- Multi-step commands (5.3)
- Streaming display (6.1)

---

## How to Contribute

1. Pick an item from the backlog
2. Create a branch: `feature/backlog-item-name`
3. Implement with tests
4. Submit PR with demo video/gif
5. Update this document when complete

---

## References

- [Voice Dictation Research](./VOICE_DICTATION_RESEARCH.md)
- [Release Notes](./RELEASE_NOTES.md)
- [macOS Build Guide](./MACOS_BUILD.md)
