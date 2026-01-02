# AudioBash v2.0.0 Release Notes

**Release Date:** January 2, 2026

---

## Downloads

### Windows
- [AudioBash.Setup.2.0.0.exe](https://github.com/jamditis/audiobash/releases/download/v2.0.0/AudioBash.Setup.2.0.0.exe)

### macOS - Apple Silicon (M1/M2/M3)
- [AudioBash-2.0.0-arm64.dmg](https://github.com/jamditis/audiobash/releases/download/v2.0.0/AudioBash-2.0.0-arm64.dmg)

### macOS - Intel
- [AudioBash-2.0.0-x64.dmg](https://github.com/jamditis/audiobash/releases/download/v2.0.0/AudioBash-2.0.0-x64.dmg)

---

## Table of Contents

1. [What's New in v2.0.0](#whats-new-in-v200)
2. [Complete Feature Guide](#complete-feature-guide)
3. [Keyboard Shortcuts Reference](#keyboard-shortcuts-reference)
4. [Configuration Guide](#configuration-guide)
5. [Known Issues](#known-issues)
6. [Roadmap](#roadmap)
7. [Changelog](#changelog)

---

## What's New in v2.0.0

### macOS Support (Major Feature)

AudioBash now runs natively on macOS with full feature parity to Windows!

- **Apple Silicon Native**: Optimized builds for M1, M2, and M3 Macs (arm64)
- **Intel Mac Support**: x64 builds available for Intel-based Macs
- **macOS-Native Shell**: Uses your default shell (zsh, bash, etc.)
- **Global Hotkeys**: Option+S for push-to-talk (with Accessibility permissions)
- **DMG Distribution**: Easy drag-and-drop installation

### Cross-Platform Improvements

- **Shell Auto-Detection**: Automatically uses the correct shell for your OS
  - Windows: PowerShell
  - macOS: Your $SHELL (typically zsh)
- **Platform-Aware Agent Mode**: AI generates OS-appropriate commands
  - Windows: `dir`, `cls`, `Get-Process`
  - macOS: `ls -la`, `clear`, `ps aux`
- **Clear Command**: Automatically uses `cls` on Windows, `clear` on macOS/Linux

### Terminal Enhancements

- **Improved Focus Handling**: Fixed keyboard input issues on macOS
- **Better Tab Management**: More reliable multi-tab support
- **Resize Debouncing**: Smoother window resizing behavior

### Developer Experience

- **Comprehensive Test Suite**: 120+ tests covering cross-platform compatibility
- **Build Scripts**: Easy one-command builds for each platform
- **CI/CD Pipeline**: Automated builds for Windows, macOS (arm64), and macOS (x64)

---

## Previous Release: v1.1.0 Features

### Custom instructions
Personalize how AudioBash transcribes and interprets your voice commands.

- **Raw mode instructions**: Add context for speech-to-text (e.g., "I speak with a Boston accent", "Technical terms I use: kubectl, nginx, pytest")
- **Agent mode instructions**: Guide AI command generation (e.g., "Always use PowerShell syntax", "Prefer npm over yarn", "Use verbose flags")

Access via Settings → Custom Instructions section.

### Custom vocabulary
Map commonly misheard words to their correct spellings. Perfect for:
- Technical terms: "react js" → "React.js"
- Project names: "my app" → "MyApp"
- Commands: "get hub" → "GitHub"

The vocabulary corrections are applied after transcription, ensuring consistent output.

### CLI input notifications
Never miss an approval prompt again. AudioBash now plays an audio chime when it detects:
- Claude Code approval requests
- Y/n confirmation prompts
- Git confirmations
- npm/yarn prompts
- Any interactive CLI input request

Toggle on/off in Settings → CLI input notifications.

### Expanded keyboard shortcuts
14 global shortcuts for power users:

| Category | Shortcut | Action |
|----------|----------|--------|
| Voice | `Alt+S` | Start/stop recording |
| Voice | `Alt+A` | Cancel recording (abort) |
| Voice | `Alt+M` | Toggle raw/agent mode |
| Voice | `Alt+R` | Resend last transcription |
| Window | `Alt+H` | Show/hide window |
| Window | `Alt+L` | Cycle through layouts |
| Terminal | `Alt+C` | Clear terminal |
| Terminal | `Alt+→` | Focus next pane |
| Terminal | `Alt+←` | Focus previous pane |
| Terminal | `Alt+B` | Bookmark current directory |
| Tabs | `Alt+1` | Switch to tab 1 |
| Tabs | `Alt+2` | Switch to tab 2 |
| Tabs | `Alt+3` | Switch to tab 3 |
| Tabs | `Alt+4` | Switch to tab 4 |

---

## Complete feature guide

### Voice input

#### Recording modes
- **Agent mode** (default): Your speech is transcribed and converted into executable CLI commands. The AI understands context like your current directory, recent output, and errors.
- **Raw mode**: Verbatim transcription. Use this when talking to Claude Code or other CLI tools that expect natural language.

#### Voice panel
- Press `Alt+S` to open the voice panel and start recording
- Press `Alt+S` again to stop and send
- Press `Alt+A` to cancel without sending
- Pin the panel to keep it visible while working
- Auto-send can be toggled in Settings

### Terminal management

#### Multi-tab support
- Up to 4 terminal sessions simultaneously
- Click `+` to add a new tab
- Double-click tab name to rename
- Click `×` to close a tab

#### Split view layouts
5 layout modes for viewing multiple terminals:

| Mode | Description | Required tabs |
|------|-------------|---------------|
| Single | One terminal, full size | 1 |
| Horizontal | Two side-by-side | 2 |
| Vertical | Two stacked | 2 |
| 2×2 Grid | Four in quadrants | 4 |
| 1+2 | One large left, two stacked right | 3 |

- Use `Alt+L` to cycle through available layouts
- Click the layout icons in the tab bar to select directly
- Drag dividers to resize panes
- The "VOICE" badge shows which terminal receives voice commands

#### Focus management
In split view:
- Click a terminal pane to focus it
- Use `Alt+→` and `Alt+←` to navigate between panes
- The focused terminal receives all voice commands

### Directory navigation

#### Quick navigation panel
Click the folder icon in the status bar to open:
- **Recent directories**: Last 10 visited directories
- **Favorite directories**: Starred folders for quick access

#### Bookmarking
- Press `Alt+B` to add current directory to favorites
- Click the star icon next to any directory to favorite/unfavorite
- Click a directory to `cd` into it

### AI providers

AudioBash supports multiple transcription providers:

| Provider | Models | Best for |
|----------|--------|----------|
| **Gemini** | 2.0 Flash, 2.5 Flash | Fast, accurate, good context understanding |
| **OpenAI** | Whisper | High accuracy transcription |
| **Anthropic** | Claude | Complex command interpretation |
| **ElevenLabs** | Speech-to-text | High quality voice recognition |
| **Local** | Parakeet | Offline use, NVIDIA GPU required |

### Visual customization

#### Themes
Multiple color schemes available in Settings:
- Void (default dark)
- Cyberpunk
- Matrix
- Amber
- Ice

#### CRT scanlines
Enable retro scanline overlay for authentic terminal aesthetics.

### System tray
AudioBash minimizes to system tray:
- Click tray icon to show window
- Right-click for context menu
- Global shortcuts work even when minimized

---

## Keyboard shortcuts reference

### Voice commands
| Shortcut | Action | Notes |
|----------|--------|-------|
| `Alt+S` | Toggle recording | Opens voice panel if closed |
| `Alt+A` | Cancel recording | Aborts without sending to terminal |
| `Alt+M` | Toggle mode | Switches between raw and agent mode |
| `Alt+R` | Resend last | Sends previous transcription again |

### Window management
| Shortcut | Action | Notes |
|----------|--------|-------|
| `Alt+H` | Toggle window | Show/hide main window |
| `Alt+L` | Cycle layout | Rotates through available layouts |

### Terminal control
| Shortcut | Action | Notes |
|----------|--------|-------|
| `Alt+C` | Clear terminal | Sends `cls` (Windows) or `clear` (Unix) |
| `Alt+→` | Focus next | Moves focus to next pane in split view |
| `Alt+←` | Focus previous | Moves focus to previous pane |
| `Alt+B` | Bookmark | Adds current directory to favorites |

### Tab switching
| Shortcut | Action |
|----------|--------|
| `Alt+1` | Switch to tab 1 |
| `Alt+2` | Switch to tab 2 |
| `Alt+3` | Switch to tab 3 |
| `Alt+4` | Switch to tab 4 |

---

## Configuration guide

### API keys

#### Gemini (recommended)
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Paste in Settings → API Keys → Gemini

#### OpenAI
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new secret key
3. Paste in Settings → API Keys → OpenAI

#### Anthropic
1. Visit [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Create a new API key
3. Paste in Settings → API Keys → Anthropic

### Custom instructions

#### Raw mode instructions
Add context that helps with transcription accuracy:
```
Examples:
- "I speak quickly and sometimes mumble"
- "Technical terms I use: Kubernetes, PostgreSQL, nginx"
- "I have a British accent"
```

#### Agent mode instructions
Guide how commands are generated:
```
Examples:
- "Always use PowerShell syntax, not CMD"
- "Prefer verbose flags for clarity"
- "Use git aliases when available"
- "Default to npm, not yarn"
```

### Custom vocabulary

Add entries to correct common misheard words:

| Spoken | Written | Use case |
|--------|---------|----------|
| "next js" | "Next.js" | Framework name |
| "react" | "React" | Proper capitalization |
| "get hub" | "GitHub" | Common mishearing |
| "pie test" | "pytest" | Testing framework |
| "cube control" | "kubectl" | Kubernetes CLI |

---

## Known issues

### Current bugs

| Issue | Severity | Workaround | Status |
|-------|----------|------------|--------|
| Occasional transcription delay with long recordings | Low | Keep recordings under 30 seconds | Investigating |
| Split view dividers may flicker during rapid resize | Low | Release mouse briefly | Planned fix |
| CLI notification may trigger on false positives | Low | Disable in settings if problematic | Tuning patterns |

### Platform limitations

#### macOS
- **Unsigned App Warning**: First launch requires right-click → Open or `xattr -cr` command
- **Accessibility Permissions**: Required for global hotkeys - must add manually in System Settings
- **Microphone Permissions**: Grant access in System Settings → Privacy & Security

#### Windows
- **SmartScreen Warning**: First-time run shows "Windows protected your PC" - click "More info" → "Run anyway"
- **Microphone permissions**: Windows may require manual permission grant

#### General
- **NVIDIA required for local mode**: Parakeet requires CUDA-compatible GPU

### Browser/WebView issues

- High DPI displays may show slight blur on terminal text
- Some special characters may not render correctly in certain themes

---

## Roadmap

### v1.2.0 (planned)

#### Features under consideration
- [ ] **Customizable shortcuts**: Edit all keyboard shortcuts in Settings
- [ ] **Voice command history**: Browse and re-execute past transcriptions
- [ ] **Snippet library**: Save and quickly insert common commands
- [ ] **Multiple profiles**: Switch between different configurations
- [ ] **Export/import settings**: Backup and restore all settings

#### Improvements
- [ ] Faster transcription with streaming API support
- [ ] Better error recovery for failed API calls
- [ ] Improved CLI notification pattern detection
- [ ] Memory usage optimization for long sessions

### v2.1.0 (future)

#### Major features
- [x] ~~**macOS support**: Native macOS build~~ ✅ *Completed in v2.0.0!*
- [ ] **Linux support**: AppImage and .deb packages
- [ ] **Plugin system**: Extend functionality with custom plugins
- [ ] **Command aliases**: Define custom voice-to-command mappings
- [ ] **Multi-language support**: Transcription in other languages

#### Integrations
- [ ] VS Code extension for seamless IDE integration
- [ ] SSH session support
- [ ] tmux/screen integration
- [ ] Custom shell support (fish, zsh, nushell)

### Backlog (unscheduled)

- Cloud sync for settings and vocabulary
- Team/enterprise features
- Voice training for improved accuracy
- Transcription analytics and insights
- Accessibility improvements (screen reader support)
- Themes marketplace
- Recording playback for debugging

---

## Changelog

### v2.0.0 (January 2, 2026)
**Major release: macOS support arrives!**

#### Added
- Full macOS support with native Apple Silicon (arm64) and Intel (x64) builds
- DMG installer for macOS with drag-and-drop installation
- Cross-platform shell detection (zsh on Mac, PowerShell on Windows)
- Platform-aware AI agent mode (generates OS-appropriate commands)
- Comprehensive test suite with 120+ cross-platform tests
- CI/CD pipeline for multi-platform automated builds
- User manual and installation guide for both platforms

#### Changed
- Version bump to 2.0.0 to celebrate cross-platform milestone
- Terminal focus handling improved for macOS compatibility
- Updated keyboard shortcuts to use Option key on macOS (Alt on Windows)
- GitHub Pages updated with download options for both platforms

#### Fixed
- xterm.js focus issues on macOS (added tabIndex and requestAnimationFrame fix)
- node-pty spawn-helper permission loss during packaging (afterPack hook)
- postcss.config.js ESM syntax error on Node 18 (converted to CommonJS)
- Icon size requirements for macOS DMG (512x512 minimum)

#### Technical
- Added `scripts/afterPack.cjs` to restore spawn-helper permissions after electron-builder packaging
- Terminal container now has `tabIndex={0}` for proper macOS focus handling
- Focus order fixed: container focused before xterm via requestAnimationFrame

---

### v1.1.0 (December 11, 2025)
**Major release with custom instructions and extensive keyboard shortcuts**

#### Added
- Custom instructions for raw and agent transcription modes
- Custom vocabulary/pronunciations mapping
- CLI input notifications with audio chime
- Cancel recording shortcut (`Alt+A`)
- Toggle mode shortcut (`Alt+M`)
- Clear terminal shortcut (`Alt+C`)
- Cycle layout shortcut (`Alt+L`)
- Focus next/prev terminal shortcuts (`Alt+→`/`Alt+←`)
- Bookmark directory shortcut (`Alt+B`)
- Resend last transcription shortcut (`Alt+R`)
- Tab switching shortcuts (`Alt+1-4`)
- Installer branding with custom images

#### Changed
- Voice mode state now shared between App and VoiceOverlay
- Settings UI reorganized with categorized shortcuts display
- Last transcription saved for resend feature

#### Fixed
- TypeScript build errors with useEffect hook ordering

### v1.0.4 (December 11, 2025)
**Split view and tab management improvements**

#### Added
- Split view with 5 layout modes
- Resizable terminal panes
- Focus indicator for voice target
- Tab rename (double-click to edit)
- Custom installer branding

### v1.0.3 (December 10, 2025)
**Bug fixes and stability**

#### Fixed
- Tray icon visibility in packaged builds
- Icon path resolution for production

### v1.0.2 (December 10, 2025)
**Context-aware agent and quick navigation**

#### Added
- Context-aware agent mode (understands cwd, recent output, errors)
- Quick directory navigation panel
- Recent and favorite directories
- Directory bookmarking

### v1.0.1 (December 9, 2025)
**Initial public release**

#### Added
- Voice-to-terminal transcription
- Multi-tab terminal support
- Multiple AI provider support
- System tray integration
- Global keyboard shortcuts
- Theme selection
- CRT scanline effect

---

## Support

- **Issues**: [GitHub Issues](https://github.com/jamditis/audiobash/issues)
- **Source**: [GitHub Repository](https://github.com/jamditis/audiobash)
- **Author**: Joe Amditis ([@jamditis](https://github.com/jamditis))

---

*AudioBash is open source software released under the MIT License.*
