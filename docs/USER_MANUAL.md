# AudioBash User Manual

**Version 2.0.0** | Voice-Controlled Terminal for Claude Code

---

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
   - [Windows Installation](#windows-installation)
   - [macOS Installation](#macos-installation)
3. [First-Time Setup](#first-time-setup)
4. [Using AudioBash](#using-audiobash)
   - [Keyboard Shortcuts](#keyboard-shortcuts)
   - [Voice Recording](#voice-recording)
   - [Terminal Modes](#terminal-modes)
   - [Multi-Tab Interface](#multi-tab-interface)
5. [Settings & Configuration](#settings--configuration)
   - [API Keys](#api-keys)
   - [Transcription Providers](#transcription-providers)
   - [Text-to-Speech](#text-to-speech)
6. [Troubleshooting](#troubleshooting)
7. [FAQ](#faq)

---

## Introduction

AudioBash is a voice-controlled terminal application designed to work seamlessly with Claude Code. Instead of typing commands, you can speak them directly into your terminal. The application transcribes your voice input using AI-powered speech recognition and executes commands in a real terminal environment.

### Key Features

- **Push-to-Talk Voice Input**: Hold a hotkey to record, release to transcribe and execute
- **Multi-Provider Transcription**: Choose from Gemini, OpenAI Whisper, Claude, or Groq
- **Real Terminal Environment**: Full PTY (pseudo-terminal) with shell access
- **Agent Mode**: AI-powered command generation for complex tasks
- **Cross-Platform**: Works on Windows 10/11 and macOS (Intel & Apple Silicon)
- **Global Hotkeys**: Control recording from anywhere on your system

---

## Installation

### Windows Installation

#### System Requirements
- Windows 10 or Windows 11
- 4GB RAM minimum (8GB recommended)
- 200MB disk space
- Microphone for voice input

#### Installation Steps

1. **Download the Installer**
   - Visit [github.com/jamditis/audiobash/releases](https://github.com/jamditis/audiobash/releases)
   - Download `AudioBash.Setup.2.0.0.exe`

2. **Run the Installer**
   - Double-click the downloaded `.exe` file
   - If Windows SmartScreen appears, click "More info" → "Run anyway"
   - Follow the installation wizard
   - Choose your installation directory (default: `C:\Program Files\AudioBash`)

3. **Launch AudioBash**
   - Find AudioBash in your Start Menu
   - Or double-click the desktop shortcut (if created during install)

4. **Grant Microphone Access**
   - Windows will prompt for microphone permission on first use
   - Click "Yes" to allow

---

### macOS Installation

#### System Requirements
- macOS 11 (Big Sur) or later
- Apple Silicon (M1/M2/M3) or Intel processor
- 4GB RAM minimum (8GB recommended)
- 200MB disk space
- Microphone for voice input

#### Installation Steps

1. **Download the DMG**
   - Visit [github.com/jamditis/audiobash/releases](https://github.com/jamditis/audiobash/releases)
   - Download the appropriate version:
     - **Apple Silicon (M1/M2/M3)**: `AudioBash-2.0.0-arm64.dmg`
     - **Intel Macs**: `AudioBash-2.0.0-x64.dmg`

2. **Install the App**
   - Double-click the downloaded `.dmg` file
   - Drag `AudioBash.app` to the Applications folder
   - Eject the DMG (right-click → Eject)

3. **First Launch (Important!)**

   Because AudioBash is not notarized by Apple, you must bypass Gatekeeper:

   **Method 1 - Right-Click (Recommended)**
   - Open Finder → Applications
   - **Right-click** (or Control+click) on `AudioBash.app`
   - Select "Open" from the context menu
   - Click "Open" in the security dialog
   - *(You only need to do this once)*

   **Method 2 - Terminal Command**
   ```bash
   xattr -cr /Applications/AudioBash.app
   ```
   Then double-click to open normally.

4. **Grant Permissions**

   macOS will request the following permissions:

   - **Microphone Access**: Required for voice recording
     - Go to System Settings → Privacy & Security → Microphone
     - Enable AudioBash

   - **Accessibility Access**: Required for global hotkeys
     - Go to System Settings → Privacy & Security → Accessibility
     - Add AudioBash to the list

---

## First-Time Setup

When you launch AudioBash for the first time, you'll see the onboarding wizard.

### Step 1: Choose Your Transcription Provider

AudioBash supports multiple AI providers for speech-to-text:

| Provider | Best For | API Key Source |
|----------|----------|----------------|
| **Gemini** (Recommended) | Fast, accurate, free tier | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenAI Whisper** | High accuracy | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Claude** | Anthropic ecosystem | [console.anthropic.com](https://console.anthropic.com/) |
| **Groq** | Very fast | [console.groq.com](https://console.groq.com/keys) |

### Step 2: Enter Your API Key

1. Click the **gear icon** (⚙) in the top-right corner
2. Select your transcription provider from the dropdown
3. Paste your API key in the text field
4. Click "Save"

### Step 3: Test Voice Recording

1. Press **Option+S** (Mac) or **Alt+S** (Windows) to start recording
2. Say a simple command: "list files in current directory"
3. Press **Option+S** or **Alt+S** again to stop
4. Watch the transcription appear in the terminal

---

## Using AudioBash

### Keyboard Shortcuts

| Action | Windows | macOS |
|--------|---------|-------|
| Start/Stop Recording | `Alt+S` | `Option+S` |
| Cancel Recording | `Alt+A` | `Option+A` |
| Toggle Raw/Agent Mode | `Alt+M` | `Option+M` |
| Show/Hide Window | `Alt+H` | `Option+H` |
| Clear Terminal | `Alt+C` | `Option+C` |
| Cycle Layouts | `Alt+L` | `Option+L` |
| New Tab | `Ctrl+T` | `Cmd+T` |
| Close Tab | `Ctrl+W` | `Cmd+W` |
| Next Tab | `Ctrl+Tab` | `Ctrl+Tab` |
| Previous Tab | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab` |

### Voice Recording

AudioBash uses a **push-to-talk** model:

1. **Press** the hotkey to start recording
2. **Speak** your command clearly
3. **Release** (or press again) to stop and transcribe

#### Recording States

| Indicator | Meaning |
|-----------|---------|
| 🔴 Red pulse | Recording in progress |
| 🟡 Yellow | Processing/transcribing |
| 🟢 Green | Ready to record |
| ⚪ Gray | Disabled/No API key |

#### Tips for Best Results

- Speak clearly and at a natural pace
- Pause briefly before complex commands
- Background noise is handled, but quieter environments work better
- Wait for the previous command to finish before recording the next

### Terminal Modes

AudioBash has two modes for handling voice input:

#### Raw Mode (Default)
- Transcribed text is sent directly to the terminal
- What you say is exactly what gets typed
- Best for: Simple commands, when you know exactly what to type

**Example**: "cd projects" → `cd projects` is typed

#### Agent Mode
- An AI interprets your intent and generates the appropriate command
- Handles natural language requests
- Best for: Complex tasks, when you're unsure of exact syntax

**Example**: "show me all JavaScript files modified in the last week" → `find . -name "*.js" -mtime -7`

Toggle between modes with **Alt+M** (Windows) or **Option+M** (Mac).

### Multi-Tab Interface

AudioBash supports multiple terminal tabs:

- **New Tab**: Click the `+` button or press `Ctrl/Cmd+T`
- **Switch Tabs**: Click on tabs or use `Ctrl+Tab`
- **Close Tab**: Click the `×` on the tab or press `Ctrl/Cmd+W`
- **Rename Tab**: Double-click the tab title

Each tab maintains its own:
- Working directory
- Command history
- Shell session

---

## Settings & Configuration

Access settings by clicking the **gear icon** (⚙) in the top-right corner.

### API Keys

Store API keys for various services:

| Setting | Purpose |
|---------|---------|
| Transcription API Key | Speech-to-text (Gemini, OpenAI, etc.) |
| Claude API Key | Agent mode intelligence |
| ElevenLabs API Key | Text-to-speech responses |

### Transcription Providers

Choose your preferred speech recognition service:

- **Gemini 2.0 Flash** - Google's fast, accurate model (recommended)
- **OpenAI Whisper** - Industry-standard accuracy
- **Groq Whisper** - Ultra-fast processing
- **Claude** - Uses Anthropic's model

### Text-to-Speech

Enable spoken responses for terminal output:

1. Enable "Text-to-Speech" in settings
2. Enter your ElevenLabs API key
3. Choose a voice from the dropdown
4. Adjust speech rate and volume

---

## Troubleshooting

### Windows Issues

#### "Windows protected your PC" SmartScreen warning
- Click "More info" → "Run anyway"
- This appears because the app isn't signed with an expensive certificate

#### Global shortcuts not working
- Check for conflicts with other applications
- Try running AudioBash as Administrator
- Restart AudioBash

#### No sound in recording
- Check Windows Sound Settings → Input
- Ensure correct microphone is selected
- Check microphone permissions in Windows Privacy settings

### macOS Issues

#### "AudioBash is damaged and can't be opened"
This is Gatekeeper blocking an unsigned app. Fix with:
```bash
xattr -cr /Applications/AudioBash.app
```

#### Terminal doesn't accept keyboard input
1. Click inside the terminal window
2. If still not working, try closing and reopening the app
3. Check that AudioBash has Accessibility permissions

#### Global shortcuts (Option+S) not working
1. Go to System Settings → Privacy & Security → Accessibility
2. Find AudioBash in the list (add it if not present)
3. Toggle it off and on again
4. Restart AudioBash

#### Microphone not working
1. Go to System Settings → Privacy & Security → Microphone
2. Ensure AudioBash is enabled
3. Test your microphone in another app first

### General Issues

#### "API key is invalid" error
- Double-check you copied the entire key
- Verify the key is for the correct provider
- Some providers require billing to be set up
- Try generating a new API key

#### Transcription is inaccurate
- Speak more slowly and clearly
- Reduce background noise
- Try a different transcription provider
- Check your internet connection (transcription requires API calls)

#### Terminal shows garbled output
- Try pressing `Ctrl+C` to interrupt
- Type `reset` and press Enter
- Close the tab and open a new one

---

## FAQ

### Is AudioBash free?
Yes! AudioBash itself is free and open source. However, the AI transcription services require API keys, which may have usage costs depending on the provider. Gemini offers a generous free tier.

### Does AudioBash work offline?
No. Voice transcription requires internet connectivity to reach the AI provider APIs.

### Can I use AudioBash with any shell?
Yes. On Windows, it defaults to PowerShell. On macOS/Linux, it uses your default shell (usually zsh or bash). You can start any shell by typing its name.

### Is my voice data private?
Your audio is sent to your chosen transcription provider (Google, OpenAI, etc.) for processing. AudioBash does not store your recordings. Review your provider's privacy policy for details.

### How do I update AudioBash?
Download the latest version from the releases page and install it over your existing installation. Your settings are preserved.

### Can I use AudioBash with Claude Code CLI?
Absolutely! That's exactly what it's designed for. Just type `claude` in the terminal to start Claude Code, then use voice commands to interact with it.

### Where are settings stored?
- **Windows**: `%APPDATA%\AudioBash\`
- **macOS**: `~/Library/Application Support/AudioBash/`

### How do I report bugs or request features?
Visit [github.com/jamditis/audiobash/issues](https://github.com/jamditis/audiobash/issues)

---

## Support

- **Documentation**: [github.com/jamditis/audiobash](https://github.com/jamditis/audiobash)
- **Issues**: [github.com/jamditis/audiobash/issues](https://github.com/jamditis/audiobash/issues)
- **Author**: Joe Amditis ([@jamditis](https://github.com/jamditis))

---

*AudioBash v2.0.0 - Voice-controlled terminal for Claude Code*
