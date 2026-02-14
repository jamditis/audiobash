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
- **Context-aware agent mode** - AI understands your environment: current directory, recent output, errors
- **Custom instructions** - Add personal instructions for transcription and agent modes
- **Custom vocabulary** - Map spoken words to correct spellings (e.g., "next js" → "Next.js")
- **CLI notifications** - Audio chime when CLI tools request input/approval
- **Split view** - View up to 4 terminals simultaneously with 5 layout modes (single, horizontal, vertical, 2x2 grid, 1+2)
- **Resizable panes** - Drag dividers to resize terminal panes in split view
- **Focus indicator** - Voice badge shows which terminal receives voice commands in split mode
- **Tab rename** - Double-click tab names to customize them
- **Multi-tab support** - Run up to 4 terminal sessions simultaneously
- **Quick directory navigation** - Jump to recent or favorite folders with one click
- **Multiple AI providers** - Gemini 2.0/2.5 Flash, OpenAI Whisper, Claude, or ElevenLabs
- **Auto-copy** - Selected text is automatically copied to clipboard
- **Always-on-top mode** - Pin the voice panel while you work
- **System tray** - Runs quietly in background, accessible via global shortcuts
- **Extensive keyboard shortcuts** - 16 customizable shortcuts for power users
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

> **Signed builds coming soon.** The current DMG builds are unsigned and may not launch on Apple Silicon. Build from source for the most reliable experience. See [macOS code signing](#macos-code-signing-coming-soon).

```bash
git clone https://github.com/jamditis/audiobash.git
cd audiobash
npm install
npm run electron:dev                  # Run in dev mode
# OR
npm run electron:build:mac:arm64      # Build DMG for Apple Silicon (M1/M2/M3/M4)
npm run electron:build:mac:x64        # Build DMG for Intel Macs
```

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

## macOS code signing (coming soon)

The macOS DMG builds are currently **unsigned**, which means Gatekeeper blocks them on Apple Silicon Macs and may cause crashes even after using `xattr -cr` or right-click → Open. We're aware this is a bad experience.

**We've enrolled in the Apple Developer Program** and are waiting for activation (can take up to 48 hours). Once active, all macOS builds will be:

- **Signed** with a Developer ID Application certificate
- **Notarized** by Apple — Gatekeeper will trust the app on first launch
- **No workarounds needed** — download, drag to Applications, double-click, done

Until then, the most reliable way to run AudioBash on Mac is to **build from source**:

```bash
git clone https://github.com/jamditis/audiobash.git
cd audiobash
npm install
npm run electron:dev
```

Follow [#29](https://github.com/jamditis/audiobash/issues/29) for updates.

## Support the project

AudioBash is free and open source. If it's useful to you, consider helping cover development costs like the $99/year Apple Developer certificate that makes macOS builds work without workarounds.

[![Sponsor](https://img.shields.io/badge/sponsor-❤-ff3333)](https://github.com/sponsors/jamditis)
[![Venmo](https://img.shields.io/badge/venmo-@jamditis-008CFF)](https://venmo.com/jamditis)

## Known issues

### Apple Silicon (M1/M2/M3/M4) crash on launch

**Status:** Root cause fixed in v2.4.0. Signed + notarized builds coming soon — see [macOS code signing](#macos-code-signing-coming-soon) above.

Earlier versions crashed on Apple Silicon because the build process invalidated ARM64 code signatures on node-pty helper binaries. Fixed in v2.4.0 by re-signing binaries after packaging. However, downloaded DMGs still require Gatekeeper workarounds that don't always work on ARM64. Proper code signing will eliminate this entirely.

See [troubleshooting guide](docs/TROUBLESHOOTING.md) for current workarounds or build from source.

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
