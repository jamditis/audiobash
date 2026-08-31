# AudioBash

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/jamditis/audiobash)](https://github.com/jamditis/audiobash/releases)
[![GitHub stars](https://img.shields.io/github/stars/jamditis/audiobash)](https://github.com/jamditis/audiobash/stargazers)
[![Build](https://github.com/jamditis/audiobash/actions/workflows/build.yml/badge.svg)](https://github.com/jamditis/audiobash/actions/workflows/build.yml)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/jamditis/audiobash/releases)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/jamditis/audiobash/releases)
[![Website](https://img.shields.io/badge/website-audiobash.app-ff3333)](https://audiobash.app)

![AudioBash](https://i.imgur.com/rUHuOhx.png)

A voice-controlled terminal for developers. Speak commands, execute them instantly.

**Website:** [audiobash.app](https://audiobash.app)

## Features

- **Voice-to-terminal** - Speak naturally and have your words transcribed directly into the terminal
- **Cross-platform** - Native builds for Windows, macOS (Intel & Apple Silicon), and Linux (AppImage & .deb)
- **Tmux-style pane system** - Binary tree pane architecture with split horizontal (Alt+-) and vertical (Alt+\), drag dividers, double-click to equalize, 5 preset layouts
- **Customizable pane colors** - 8-color palette (Emerald, Cobalt, Crimson, Violet, Cyan, Amber, Rose, Acid) with activity-based fade: full color → fading → dim → gray as terminals go idle. Error exits always red. Colors persist across restarts
- **Pane keyboard navigation** - Alt+Arrow to move focus, Alt+1-4 for direct focus, Alt+Shift+Arrow to resize, Alt+Z to zoom/unzoom
- **Named pane sessions** - Save and load pane layouts by name
- **Claude Code /voice integration** - Detects Claude Code /voice mode, shows [CC /voice] badge in voice panel, disables mic button during CC /voice, smart handoff (cancels any active recording without sending partial audio)
- **Multi-terminal voice routing** - Voice commands directed to the correct terminal automatically
- **Context-aware agent mode** - AI understands your environment: current directory, recent output, errors
- **Custom instructions** - Add personal instructions for transcription and agent modes
- **Custom vocabulary** - Map spoken words to correct spellings (e.g., "next js" → "Next.js")
- **CLI notifications** - Audio chime when CLI tools request input/approval
- **Font zoom** - Ctrl+Plus/Minus/0 to adjust terminal font size
- **Window persistence** - Window position and size saved across sessions
- **Multi-tab support** - Run up to 4 terminal sessions simultaneously
- **Quick directory navigation** - Jump to recent or favorite folders with one click
- **Multiple AI providers** - Gemini 2.0/2.5 Flash, ElevenLabs Scribe (real-time or batch), or local Whisper after FFmpeg is on PATH and its binary and model are downloaded (plus Parakeet, if you run your own NVIDIA GPU server)
- **Auto-copy** - Selected text is automatically copied to clipboard
- **Always-on-top mode** - Pin the voice panel while you work
- **System tray** - Runs quietly in background, accessible via global shortcuts
- **Extensive keyboard shortcuts** - 20 customizable shortcuts for power users
- **Preview pane** - Embedded web preview for localhost dev servers, HTML, images, and markdown
- **Screenshot capture** - Take screenshots of the preview pane (saves to current working directory)
- **Auto-refresh** - File watcher automatically refreshes preview when source files change

<a href="[http://www.youtube.com/watch?feature=player_embedded&v=nTQUwghvy5Q](https://www.youtube.com/watch?v=EMllHx3lIyk)" target="_blank">
 <img src="https://i.imgur.com/eVs5hBZ.png" alt="Watch the video" width="100%" border="10" />
</a>

## Installation

### Windows

Download the latest `.exe` installer from [Releases](https://github.com/jamditis/audiobash/releases).

### macOS

Download `AudioBash-3.4.0-arm64.dmg` for Apple Silicon or `AudioBash-3.4.0-x64.dmg` for Intel from [v3.4.0](https://github.com/jamditis/audiobash/releases/tag/v3.4.0). Drag AudioBash to Applications and open it normally. Both builds are signed and notarized by Apple.

### Linux

Download the latest `.AppImage` or `.deb` from [Releases](https://github.com/jamditis/audiobash/releases).

```bash
# AppImage (portable, runs on most distributions)
chmod +x AudioBash-*.AppImage
./AudioBash-*.AppImage

# Debian / Ubuntu
sudo dpkg -i AudioBash-*.deb
```

Global shortcuts use the desktop's GlobalShortcuts portal on Wayland and fall back to X11.

### Build from source (any platform)

```bash
git clone https://github.com/jamditis/audiobash.git
cd audiobash
npm install
npm run electron:build
```

## Usage

1. **Launch AudioBash** - The app starts with your default shell (PowerShell on Windows, zsh on macOS)
2. **Press Alt+S** (or Option+S on Mac) - Opens the voice panel and starts recording
3. **Speak your command** - e.g., "list all files in the current directory"
4. **Press Alt+S again** - Transcription is sent to the terminal

### Keyboard shortcuts

#### Voice
| Shortcut | Action |
|----------|--------|
| `Alt+S` | Start/stop voice recording |
| `Alt+A` | Cancel recording (abort without sending) |
| `Alt+M` | Toggle raw/agent mode |
| `Alt+R` | Resend last transcription |

#### Window
| Shortcut | Action |
|----------|--------|
| `Alt+H` | Show/hide window |
| `Alt+L` | Cycle through layouts |

#### Terminal
| Shortcut | Action |
|----------|--------|
| `Alt+C` | Clear terminal |
| `Alt+→` | Focus next pane |
| `Alt+←` | Focus previous pane |
| `Alt+B` | Bookmark current directory |

#### Tabs
| Shortcut | Action |
|----------|--------|
| `Alt+1-4` | Switch to tab 1-4 |

#### Preview
| Shortcut | Action |
|----------|--------|
| `Alt+P` | Toggle preview pane |
| `Alt+Shift+P` | Capture screenshot |

### Voice panel modes

- **Auto-send** - Automatically execute transcribed commands (toggle in settings)
- **Pin mode** - Keep voice panel open while working

## Configuration

Open Settings (gear icon in title bar) to configure:

- **API Keys** - Add keys for Gemini, OpenAI, Anthropic, or ElevenLabs
- **Transcription model** - Choose between cloud or local transcription
- **Default shell** - PowerShell, CMD, or Bash
- **Visual theme** - Select from multiple color schemes
- **Scanlines** - Enable retro CRT effect

### Getting API keys

- **Gemini** (recommended): [Google AI Studio](https://aistudio.google.com/app/apikey)
- **OpenAI**: [OpenAI Platform](https://platform.openai.com/api-keys)
- **Anthropic**: [Anthropic Console](https://console.anthropic.com/settings/keys)

## macOS code signing

The v3.4.0 arm64 and x64 packages are signed with a Developer ID Application certificate, notarized by Apple, and stapled. The release checks also verify nested signatures and require Gatekeeper acceptance before publication.

If macOS rejects a v3.4.0 download, delete that copy and download the correct DMG again from the [official release](https://github.com/jamditis/audiobash/releases/tag/v3.4.0). Do not override the warning.

## Support the project

AudioBash is free and open source. If it's useful to you, consider helping cover development costs such as Apple Developer Program membership for signed and notarized Mac releases.

[![Sponsor](https://img.shields.io/badge/sponsor-❤-ff3333)](https://github.com/sponsors/jamditis)
[![Venmo](https://img.shields.io/badge/venmo-@jamditis-008CFF)](https://venmo.com/jamditis)

## Known issues

### Apple Silicon (M1/M2/M3/M4) crash on launch

**Status:** Root cause fixed in v2.4.0. The v3.4.0 Mac builds are signed and notarized; see [macOS code signing](#macos-code-signing) above.

Earlier versions crashed on Apple Silicon because the build process invalidated ARM64 code signatures on node-pty helper binaries. v2.4.0 fixed that root cause. v3.4.0 repairs and verifies the native helpers during packaging before the final Developer ID signature.

See the [troubleshooting guide](docs/TROUBLESHOOTING.md) if a current release does not open normally.

## Tech stack

- **Electron** - Desktop application framework
- **React 19** - UI framework
- **TypeScript** - Type-safe JavaScript
- **xterm.js** - Terminal emulator
- **node-pty** - Pseudoterminal bindings
- **Tailwind CSS** - Styling
- **Vite** - Build tool

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run electron:build
```

## License

MIT

## Author

Joe Amditis ([@jamditis](https://github.com/jamditis))
