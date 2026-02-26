# AudioBash user manual

**Version 2.4.1** | Voice-controlled terminal for Claude Code

---

## Table of contents

1. [Introduction](#introduction)
2. [Installation](#installation)
   - [Windows installation](#windows-installation)
   - [macOS installation](#macos-installation)
3. [First-time setup](#first-time-setup)
4. [Using AudioBash](#using-audiobash)
   - [Keyboard shortcuts](#keyboard-shortcuts)
   - [Voice recording](#voice-recording)
   - [Terminal modes](#terminal-modes)
   - [Multi-tab interface](#multi-tab-interface)
   - [Split view layouts](#split-view-layouts)
   - [Preview pane](#preview-pane)
   - [Remote control](#remote-control)
5. [Settings & configuration](#settings--configuration)
   - [API keys](#api-keys)
   - [Transcription providers](#transcription-providers)
   - [Local Whisper (offline)](#local-whisper-offline)
   - [Voice activity detection](#voice-activity-detection)
   - [Custom vocabulary](#custom-vocabulary)
   - [Custom instructions](#custom-instructions)
   - [Text-to-speech](#text-to-speech)
6. [Troubleshooting](#troubleshooting)
7. [FAQ](#faq)

---

## Introduction

AudioBash is a voice-controlled terminal application designed to work with Claude Code. Instead of typing commands, you can speak them directly into your terminal. The app transcribes your voice using AI-powered speech recognition and executes commands in a real terminal environment.

### Key features

- **Push-to-talk voice input** — Hold a hotkey to record, release to transcribe and execute
- **Multi-provider transcription** — Gemini, OpenAI Whisper, ElevenLabs, Claude, or local Whisper
- **Local Whisper** — Offline transcription with no API key required
- **ElevenLabs real-time streaming** — WebSocket-based transcription at ~150ms latency
- **Voice activity detection** — Auto-commit on silence with ElevenLabs Scribe v2
- **Real terminal environment** — Full PTY (pseudo-terminal) with shell access
- **Agent mode** — AI-powered command generation for complex tasks
- **Split view** — 5 layout modes with resizable panes
- **Preview pane** — Embedded web preview with auto-refresh and screenshot capture
- **Remote control** — Voice input from your phone via WebSocket
- **Model cycling** — Click the model name in the voice overlay to switch providers
- **Custom vocabulary** — Map misheard words to correct spellings
- **Cross-platform** — Windows 10/11 and macOS (Intel & Apple Silicon)
- **Global hotkeys** — Control recording from anywhere on your system

---

## Installation

### Windows installation

#### System requirements
- Windows 10 or Windows 11
- 4GB RAM minimum (8GB recommended)
- 200MB disk space
- Microphone for voice input

#### Installation steps

1. **Download the installer**
   - Visit [audiobash.app](https://audiobash.app) or the [GitHub releases page](https://github.com/jamditis/audiobash/releases)
   - Download the latest `.exe` installer

2. **Run the installer**
   - Double-click the downloaded `.exe` file
   - If Windows SmartScreen appears, click "More info" → "Run anyway"
   - Follow the installation wizard

3. **Launch AudioBash**
   - Find AudioBash in your Start Menu
   - Or double-click the desktop shortcut

4. **Grant microphone access**
   - Windows will prompt for microphone permission on first use
   - Click "Yes" to allow

---

### macOS installation

#### System requirements
- macOS 11 (Big Sur) or later
- Apple Silicon (M1/M2/M3/M4) or Intel processor
- 4GB RAM minimum (8GB recommended)
- 200MB disk space
- Microphone for voice input

#### Installation steps

1. **Download the DMG**
   - Visit [audiobash.app](https://audiobash.app) or the [GitHub releases page](https://github.com/jamditis/audiobash/releases)
   - Download the appropriate version:
     - **Apple Silicon (M1/M2/M3/M4)**: `AudioBash-<version>-arm64.dmg`
     - **Intel Macs**: `AudioBash-<version>-x64.dmg`

2. **Install the app**
   - Double-click the downloaded `.dmg` file
   - Drag `AudioBash.app` to the Applications folder
   - Eject the DMG

3. **First launch (important)**

   AudioBash is not yet signed with an Apple Developer certificate (pending). You must bypass Gatekeeper on first launch:

   **Method 1 — Right-click (recommended)**
   - Open Finder → Applications
   - **Right-click** (or Control+click) on `AudioBash.app`
   - Select "Open" from the context menu
   - Click "Open" in the security dialog
   - You only need to do this once

   **Method 2 — Terminal command**
   ```bash
   xattr -cr /Applications/AudioBash.app
   ```
   Then double-click to open normally.

   > **Note:** Code signing infrastructure is in place and signed builds will ship once Apple Developer Program activation completes.

4. **Grant permissions**

   macOS will request the following:

   - **Microphone access**: Required for voice recording
     - System Settings → Privacy & Security → Microphone → enable AudioBash

   - **Accessibility access**: Required for global hotkeys
     - System Settings → Privacy & Security → Accessibility → add AudioBash

---

## First-time setup

When you launch AudioBash for the first time, you'll see the onboarding wizard.

### Step 1: Choose your transcription provider

| Provider | Best for | API key source |
|----------|----------|----------------|
| **Gemini** (recommended) | Fast, accurate, free tier | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **ElevenLabs** | Real-time streaming (~150ms) | [elevenlabs.io](https://elevenlabs.io) |
| **OpenAI Whisper** | High accuracy | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Claude** | Anthropic ecosystem | [console.anthropic.com](https://console.anthropic.com/) |
| **Local Whisper** | Offline, no API key | Built-in (downloads model on first use) |

### Step 2: Enter your API key

1. Click the **gear icon** (⚙) in the top-right corner
2. Select your transcription provider from the dropdown
3. Paste your API key (not needed for local Whisper)
4. Click "Save"

### Step 3: Test voice recording

1. Press **Option+S** (Mac) or **Alt+S** (Windows) to start recording
2. Say a simple command: "list files in current directory"
3. Press **Option+S** or **Alt+S** again to stop
4. Watch the transcription appear in the terminal

---

## Using AudioBash

### Keyboard shortcuts

| Action | Windows | macOS |
|--------|---------|-------|
| Start/stop recording | `Alt+S` | `Option+S` |
| Cancel recording | `Alt+A` | `Option+A` |
| Toggle raw/agent mode | `Alt+M` | `Option+M` |
| Show/hide window | `Alt+H` | `Option+H` |
| Clear terminal | `Alt+C` | `Option+C` |
| Cycle layouts | `Alt+L` | `Option+L` |
| New tab | `Ctrl+T` | `Cmd+T` |
| Close tab | `Ctrl+W` | `Cmd+W` |
| Next tab | `Ctrl+Tab` | `Ctrl+Tab` |
| Previous tab | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab` |

### Voice recording

AudioBash uses a **push-to-talk** model:

1. **Press** the hotkey to start recording
2. **Speak** your command clearly
3. **Press again** to stop and transcribe

#### Recording states

| Indicator | Meaning |
|-----------|---------|
| Red pulse | Recording in progress |
| Yellow | Processing/transcribing |
| Green | Ready to record |
| Gray | Disabled or no API key |

#### Tips for best results

- Speak clearly at a natural pace
- Pause briefly before complex commands
- Background noise is handled, but quieter environments work better
- Wait for the previous command to finish before recording the next

### Terminal modes

AudioBash has two modes for handling voice input:

#### Raw mode (default)
- Transcribed text is sent directly to the terminal
- What you say is exactly what gets typed
- Best for simple commands when you know the exact syntax

**Example:** "cd projects" → `cd projects` is typed

#### Agent mode
- An AI interprets your intent and generates the appropriate command
- Handles natural language requests
- Best for complex tasks when you're unsure of exact syntax

**Example:** "show me all JavaScript files modified in the last week" → `find . -name "*.js" -mtime -7`

Toggle between modes with **Alt+M** (Windows) or **Option+M** (Mac).

### Multi-tab interface

AudioBash supports multiple terminal tabs:

- **New tab**: Click the `+` button or press `Ctrl/Cmd+T`
- **Switch tabs**: Click on tabs or use `Ctrl+Tab`
- **Close tab**: Click the `×` on the tab or press `Ctrl/Cmd+W`
- **Rename tab**: Double-click the tab title

Each tab maintains its own working directory, command history, and shell session.

### Split view layouts

Press **Alt+L** (Windows) or **Option+L** (Mac) to cycle through 5 layout modes:

1. **Full** — Single terminal, full width
2. **Split horizontal** — Two terminals side by side
3. **Split vertical** — Two terminals stacked
4. **Triple** — Three-pane layout
5. **Quad** — Four-pane layout

Pane dividers are resizable by dragging.

### Preview pane

The embedded preview pane shows web content alongside your terminal:

- Auto-refreshes when files change
- Screenshot capture for sharing
- Useful for front-end development with live reload

### Remote control

Control AudioBash from your phone via WebSocket:

1. Open the remote control URL shown in the app (served at `http://<your-ip>:8765/`)
2. Use the on-screen buttons to start/stop recording
3. Voice input from your phone is sent to the terminal on your computer

This is useful when your computer is across the room or connected to an external display.

---

## Settings & configuration

Access settings by clicking the **gear icon** (⚙) in the top-right corner.

### API keys

Store API keys for various services:

| Setting | Purpose |
|---------|---------|
| Transcription API key | Speech-to-text (Gemini, OpenAI, ElevenLabs, etc.) |
| Claude API key | Agent mode intelligence |
| ElevenLabs API key | Real-time streaming and text-to-speech |

All keys are encrypted using Electron's `safeStorage` API and stored locally.

### Transcription providers

Choose your preferred speech recognition service:

- **Gemini 2.0 Flash** — Google's fast, accurate model (recommended, free tier)
- **ElevenLabs Scribe** — Real-time WebSocket streaming at ~150ms latency
- **OpenAI Whisper** — Industry-standard accuracy
- **Claude** — Anthropic's model
- **Local Whisper** — Offline, runs on your machine

Click the model name in the voice overlay to cycle between providers without opening settings.

### Local Whisper (offline)

AudioBash includes built-in Whisper support for offline transcription:

- No API key required
- Downloads the model on first use (tiny/base/small sizes available)
- Runs entirely on your machine
- Good for privacy-sensitive use or when you don't have internet

### Voice activity detection

With ElevenLabs Scribe v2, AudioBash can detect when you stop speaking and auto-commit the transcription:

- No need to press the hotkey again to stop
- Transcription commits automatically after a silence threshold
- Configure the silence duration in settings

### Custom vocabulary

Map misheard words to their correct spellings:

1. Open Settings → Custom vocabulary
2. Add entries like: "see dee" → "cd", "git hub" → "GitHub"
3. The corrections apply automatically to all transcriptions

### Custom instructions

Add per-mode transcription guidance:

- Tell the transcription provider extra context about your use case
- Example: "I'm working on a Python project. Technical terms like pytest, venv, and pip are common."

### Text-to-speech

Enable spoken responses for terminal output:

1. Enable "Text-to-speech" in settings
2. Enter your ElevenLabs API key
3. Choose a voice from the dropdown
4. Adjust speech rate and volume

---

## Troubleshooting

### Windows issues

#### "Windows protected your PC" SmartScreen warning
- Click "More info" → "Run anyway"
- This appears because the app isn't code-signed with a Windows certificate

#### Global shortcuts not working
- Check for conflicts with other applications
- Try running AudioBash as administrator
- Restart AudioBash

#### No sound in recording
- Check Windows Sound Settings → Input
- Ensure the correct microphone is selected
- Check microphone permissions in Windows Privacy settings

### macOS issues

#### "AudioBash is damaged and can't be opened"
This is Gatekeeper blocking an unsigned app. Fix with:
```bash
xattr -cr /Applications/AudioBash.app
```

#### App crashes on launch (Apple Silicon)
This was fixed in v2.4.0. If you're running an older version, update to the latest release. The crash was caused by invalid code signatures on native binaries inside the app bundle.

#### Terminal doesn't accept keyboard input
1. Click inside the terminal window
2. If still not working, close and reopen the app
3. Check that AudioBash has Accessibility permissions

#### Global shortcuts (Option+S) not working
1. System Settings → Privacy & Security → Accessibility
2. Find AudioBash in the list (add it if not present)
3. Toggle it off and on again
4. Restart AudioBash

#### Microphone not working
1. System Settings → Privacy & Security → Microphone
2. Ensure AudioBash is enabled
3. Test your microphone in another app first

### General issues

#### "API key is invalid" error
- Double-check you copied the entire key
- Verify the key is for the correct provider
- Some providers require billing to be set up
- Try generating a new API key

#### Transcription is inaccurate
- Speak more slowly and clearly
- Reduce background noise
- Try a different transcription provider
- Add common terms to your custom vocabulary
- Check your internet connection (cloud providers require API calls)

#### Terminal shows garbled output
- Press `Ctrl+C` to interrupt
- Type `reset` and press Enter
- Close the tab and open a new one

---

## FAQ

### Is AudioBash free?
Yes. AudioBash is free and open source. The cloud transcription services require API keys, which may have usage costs depending on the provider. Gemini offers a generous free tier, and local Whisper requires no API key at all.

### Does AudioBash work offline?
Partially. Local Whisper provides offline transcription with no internet required. Cloud providers (Gemini, OpenAI, ElevenLabs, Claude) require internet connectivity.

### Can I use AudioBash with any shell?
Yes. On Windows, it defaults to PowerShell. On macOS, it uses your default shell (usually zsh). You can start any shell by typing its name.

### Is my voice data private?
When using cloud providers, your audio is sent to the chosen provider (Google, OpenAI, ElevenLabs, Anthropic) for processing. AudioBash does not store your recordings. For full privacy, use local Whisper — audio never leaves your machine. Review your provider's privacy policy for details.

### How do I update AudioBash?
Download the latest version from [audiobash.app](https://audiobash.app) or the [GitHub releases page](https://github.com/jamditis/audiobash/releases) and install over your existing installation. Settings are preserved.

### Can I use AudioBash with Claude Code CLI?
Yes — that's exactly what it's designed for. Type `claude` in the terminal to start Claude Code, then use voice commands to interact with it.

### Where are settings stored?
- **Windows**: `%APPDATA%\AudioBash\`
- **macOS**: `~/Library/Application Support/AudioBash/`

### How do I report bugs or request features?
Visit [github.com/jamditis/audiobash/issues](https://github.com/jamditis/audiobash/issues)

---

## Support

- **Website**: [audiobash.app](https://audiobash.app)
- **Documentation**: [audiobash.app/manual.html](https://audiobash.app/manual.html)
- **Issues**: [github.com/jamditis/audiobash/issues](https://github.com/jamditis/audiobash/issues)
- **Sponsor**: [github.com/sponsors/jamditis](https://github.com/sponsors/jamditis)
- **Author**: Joe Amditis ([@jamditis](https://github.com/jamditis))

---

*AudioBash v2.4.1 — Voice-controlled terminal for Claude Code*
