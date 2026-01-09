# AudioBash Session Templates

This guide documents recommended named sessions for organizing AudioBash development work using Claude Code's `/rename` and `/resume` features.

## Why Use Named Sessions?

Named sessions help you:
- **Context preservation** - Resume work exactly where you left off
- **Focus management** - Keep different workstreams separate
- **Collaboration** - Share session names with team members
- **History tracking** - Easily reference past work on specific features

## Quick Start

```bash
# Start a new session
claude

# Name it for your current work
/rename voice-pipeline

# ... work on voice transcription ...
# Exit when done

# Resume later
claude /resume voice-pipeline
```

---

## Feature Development Sessions

### `voice-pipeline`
**Purpose:** Voice transcription improvements and audio processing
**Scope:**
- Gemini API integration and optimization
- MediaRecorder improvements
- Audio quality enhancements
- Push-to-talk mechanics
- Transcription accuracy tuning

**Key files:**
- `/home/user/audiobash/src/services/` - Transcription services
- `/home/user/audiobash/src/utils/` - Audio utilities
- `/home/user/audiobash/src/components/VoicePanel.tsx`

**Example usage:**
```bash
claude
/rename voice-pipeline
# Work on improving transcription accuracy with Gemini 2.0
```

---

### `multi-tab`
**Purpose:** Terminal tab management and split-screen layouts
**Scope:**
- xterm.js multi-instance management
- node-pty process lifecycle
- Tab UI/UX improvements
- Split pane functionality
- Resize debouncing and stability

**Key files:**
- `/home/user/audiobash/src/components/Terminal.tsx`
- `/home/user/audiobash/electron/main.cjs` - PTY management
- `/home/user/audiobash/src/App.tsx` - Layout management

**Known issues to address:**
- Multi-tab stability on macOS
- Resize debouncing improvements

**Example usage:**
```bash
claude /resume multi-tab
# Continue work on split-screen resize handling
```

---

### `mobile-remote`
**Purpose:** WebSocket companion app for mobile control
**Scope:**
- WebSocket server implementation
- Mobile web UI for voice input
- Remote command sending
- Authentication and security
- QR code pairing

**Key files:**
- New: `/home/user/audiobash/electron/websocket-server.cjs`
- New: `/home/user/audiobash/mobile/` directory
- `/home/user/audiobash/electron/main.cjs` - Integration

**Example usage:**
```bash
claude
/rename mobile-remote
# Implement WebSocket server for mobile companion app
```

---

### `preview-pane`
**Purpose:** Side panel for previewing files, images, markdown
**Scope:**
- File preview component
- Markdown rendering
- Image viewer
- PDF support
- Syntax highlighting for code

**Key files:**
- New: `/home/user/audiobash/src/components/PreviewPane.tsx`
- `/home/user/audiobash/src/App.tsx` - Layout integration

**Example usage:**
```bash
claude
/rename preview-pane
# Add markdown preview functionality to side panel
```

---

### `settings-ui`
**Purpose:** Settings panel and configuration management
**Scope:**
- Settings component improvements
- API key management
- Theme customization
- Keyboard shortcuts configuration
- Persistence to electron-store

**Key files:**
- `/home/user/audiobash/src/components/Settings.tsx` (if exists)
- `/home/user/audiobash/electron/main.cjs` - electron-store integration

**Example usage:**
```bash
claude /resume settings-ui
# Add dark/light theme toggle to settings panel
```

---

## Maintenance Sessions

### `security-hardening`
**Purpose:** Security improvements and vulnerability fixes
**Scope:**
- Dependency audits (`npm audit`)
- IPC security review
- API key protection
- Content Security Policy
- Node integration safety

**Key files:**
- `/home/user/audiobash/electron/preload.cjs` - Context bridge
- `/home/user/audiobash/electron/main.cjs` - Security headers
- `/home/user/audiobash/package.json` - Dependencies

**Checklist:**
- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Review contextBridge exposure
- [ ] Validate input sanitization
- [ ] Check for hardcoded secrets

**Example usage:**
```bash
claude
/rename security-hardening
# Audit dependencies and fix critical vulnerabilities
```

---

### `perf-optimization`
**Purpose:** Performance tuning and optimization
**Scope:**
- Render performance profiling
- Memory leak detection
- Bundle size reduction
- Terminal rendering optimization
- IPC throughput improvements

**Key files:**
- `/home/user/audiobash/vite.config.ts` - Build optimization
- `/home/user/audiobash/src/components/Terminal.tsx` - Render optimization
- `/home/user/audiobash/electron/main.cjs` - IPC optimization

**Tools to use:**
- Chrome DevTools Performance tab
- React DevTools Profiler
- `npm run electron:build` - Check bundle size

**Example usage:**
```bash
claude /resume perf-optimization
# Profile terminal rendering and optimize for large outputs
```

---

### `test-coverage`
**Purpose:** Adding and improving test coverage
**Scope:**
- Unit tests for components
- Integration tests for IPC
- E2E tests with Playwright
- Cross-platform test validation
- Increasing coverage from current 70 tests

**Key files:**
- `/home/user/audiobash/tests/` - Test suite
- `/home/user/audiobash/package.json` - Test scripts
- New test files in `/home/user/audiobash/src/components/__tests__/`

**Example usage:**
```bash
claude
/rename test-coverage
# Add unit tests for VoicePanel component
```

---

### `docs-update`
**Purpose:** Documentation improvements and updates
**Scope:**
- GitHub Pages content (`/home/user/audiobash/docs/`)
- CLAUDE.md updates
- README improvements
- API documentation
- Screenshot updates

**Key files:**
- `/home/user/audiobash/CLAUDE.md`
- `/home/user/audiobash/README.md`
- `/home/user/audiobash/docs/*.html` - GitHub Pages
- `/home/user/audiobash/scripts/*-screenshot.py`

**Example usage:**
```bash
claude /resume docs-update
# Update manual.html with new voice features
```

---

## Platform-Specific Sessions

### `macos-fixes`
**Purpose:** macOS-specific bug fixes and improvements
**Scope:**
- Multi-tab stability on macOS
- Gatekeeper signing issues
- Native notifications
- Shell detection (zsh)
- ARM64 build optimization

**Key files:**
- `/home/user/audiobash/docs/MACOS_BUILD.md`
- `/home/user/audiobash/electron/main.cjs` - Shell detection
- `/home/user/audiobash/.github/workflows/build.yml` - macOS CI

**Test environment:**
- M1 MacBook Pro with macOS

**Example usage:**
```bash
claude
/rename macos-fixes
# Fix multi-tab resize issues on macOS
```

---

### `windows-compat`
**Purpose:** Windows compatibility and PowerShell integration
**Scope:**
- PowerShell-specific commands
- Windows API integrations
- Installer improvements (NSIS)
- Auto-update configuration
- Path handling differences

**Key files:**
- `/home/user/audiobash/electron/main.cjs` - PowerShell spawn
- `/home/user/audiobash/package.json` - Windows build config

**Example usage:**
```bash
claude /resume windows-compat
# Improve PowerShell command suggestions in AI prompts
```

---

### `linux-support`
**Purpose:** Linux builds and distribution
**Scope:**
- AppImage/Snap/Flatpak builds
- Linux shell detection (bash/zsh)
- Desktop integration
- Permissions and security
- Package manager compatibility

**Key files:**
- `/home/user/audiobash/.github/workflows/build.yml` - Linux CI
- `/home/user/audiobash/electron/main.cjs` - Shell detection
- New: `/home/user/audiobash/linux/` - Package configs

**Example usage:**
```bash
claude
/rename linux-support
# Create AppImage build configuration
```

---

## Release Sessions

### `release-2.x.x`
**Purpose:** Version-specific release preparation
**Naming convention:** Use actual version number (e.g., `release-2.1.0`)

**Scope:**
- Version bumping in package.json
- CHANGELOG.md updates
- Release notes drafting
- Build verification (all platforms)
- GitHub release creation
- Documentation updates for new version

**Release checklist:**
- [ ] Update version in package.json
- [ ] Update CHANGELOG.md
- [ ] Run `npm test` - verify all tests pass
- [ ] Build for all platforms: `npm run electron:build`
- [ ] Test installers on each platform
- [ ] Update docs/releases.html
- [ ] Create GitHub release with binaries
- [ ] Announce on relevant channels

**Example usage:**
```bash
claude
/rename release-2.1.0
# Prepare release 2.1.0 with new voice features

# ... complete release work ...

# Later, for hotfix:
claude /resume release-2.1.0
# Review what was done for 2.1.0 release
```

---

## Session Naming Best Practices

### ✅ Good session names
- **Descriptive:** `voice-pipeline`, `mobile-remote`
- **Kebab-case:** Use hyphens, not spaces or underscores
- **Specific:** `macos-multi-tab-fix` better than `bug-fix`
- **Dated releases:** `release-2.1.0` better than `release-next`

### ❌ Avoid
- Generic names: `work`, `bug-fix`, `updates`
- Dates only: `2026-01-09` (not descriptive)
- Too long: `fix-the-voice-recording-issue-with-gemini-api`

---

## Advanced Workflows

### Long-running feature development
```bash
# Day 1: Start new feature
claude
/rename mobile-remote
# Implement WebSocket server

# Day 2: Resume work
claude /resume mobile-remote
# Continue with mobile UI

# Day 5: Feature complete, start new work
claude
/rename settings-ui
```

### Context switching
```bash
# Working on features
claude /resume voice-pipeline

# Urgent bug reported
# Exit and switch context
claude
/rename hotfix-recording-crash
# Fix critical bug

# Back to features
claude /resume voice-pipeline
```

### Release preparation
```bash
# Prepare release
claude
/rename release-2.1.0
# Version bump, changelog, testing

# Found bug during testing
# Create focused session for fix
claude
/rename fix-tab-memory-leak
# Fix and test

# Return to release
claude /resume release-2.1.0
# Continue with release checklist
```

---

## Tips

1. **Name early:** Use `/rename` as soon as you know what you're working on
2. **Be consistent:** Use the same names across related sessions
3. **Document progress:** At the end of each session, summarize what's done
4. **Clean up old sessions:** Periodically review and archive completed work
5. **Share names:** Use these templates when asking for help or collaborating

---

## Session History Management

To view available sessions to resume:
```bash
claude /resume
# Claude will show available sessions
```

To start fresh while keeping old session:
```bash
claude
# New unnamed session, old sessions preserved
```

---

*Last updated: 2026-01-09*
*For AudioBash version: 2.x*
