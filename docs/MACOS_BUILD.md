# Building AudioBash for macOS

This guide covers building and running AudioBash on macOS **without** Apple Developer credentials or App Store distribution.

## Quick start (build on your Mac)

The easiest approach is to clone the repo on your Mac and build locally. This ensures native binaries (like node-pty) compile correctly for your architecture.

### Prerequisites

1. **Node.js 18+** - Install via [nodejs.org](https://nodejs.org) or Homebrew:
   ```bash
   brew install node
   ```

2. **Xcode Command Line Tools** - Required for compiling native modules:
   ```bash
   xcode-select --install
   ```

3. **Python 3** - Usually pre-installed on macOS, needed for node-gyp:
   ```bash
   python3 --version
   ```

### Build steps

```bash
# Clone the repository
git clone https://github.com/jamditis/audiobash.git
cd audiobash

# Install dependencies (this compiles node-pty for your Mac)
npm install

# Build the app
npm run electron:build:mac:arm64   # For Apple Silicon (M1/M2/M3/M4)
# OR
npm run electron:build:mac:x64    # For Intel Macs
```

### Output files

After building, you'll find these in the `dist/` folder:

| File | Description |
|------|-------------|
| `AudioBash-{version}-arm64.dmg` | DMG installer (drag to Applications) |
| `AudioBash-{version}-arm64-mac.zip` | Portable zip (extract and run) |
| `mac-arm64/AudioBash.app` | Unpacked app bundle |

## Installing the unsigned app

Since the app isn't signed with an Apple Developer certificate, macOS Gatekeeper will block it by default. Here's how to bypass that:

### Method 1: Right-click to open (recommended)

1. Open the DMG or extract the zip
2. Drag `AudioBash.app` to `/Applications`
3. **Right-click** (or Control-click) on AudioBash.app
4. Select **"Open"** from the context menu
5. Click **"Open"** in the security dialog
6. The app will now open and be remembered as safe

### Method 2: System Settings

1. Try to open the app normally (it will be blocked)
2. Open **System Settings** → **Privacy & Security**
3. Scroll down to find "AudioBash was blocked..."
4. Click **"Open Anyway"**
5. Enter your password if prompted

### Method 3: Remove quarantine attribute (advanced)

```bash
# Remove the quarantine flag that triggers Gatekeeper
xattr -cr /Applications/AudioBash.app
```

## Running in development

For development/testing without building:

```bash
cd audiobash
npm install
npm run electron:dev
```

This runs the app directly with hot-reload enabled.

## Transferring from Windows

If you want to transfer a pre-built DMG from Windows to your Mac:

**Important:** You cannot cross-compile node-pty from Windows to macOS. The native bindings must be compiled on the target platform. Options:

1. **Build on Mac** (recommended) - Clone repo and build locally
2. **GitHub Actions** - Set up CI to build for all platforms (see below)
3. **Use portable zip** - If someone else builds on Mac, they can share the zip

### GitHub Actions setup (optional)

Add this workflow to build for macOS automatically:

```yaml
# .github/workflows/build-mac.yml
name: Build macOS

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build for macOS
        run: npm run electron:build:mac
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-build
          path: |
            dist/*.dmg
            dist/*.zip
```

## Keyboard shortcuts on macOS

AudioBash uses `Alt+` shortcuts by default, which map to `Option+` on Mac keyboards:

| Action | Shortcut |
|--------|----------|
| Start/stop recording | `Option+S` |
| Cancel recording | `Option+A` |
| Toggle window | `Option+H` |
| Toggle raw/agent mode | `Option+M` |
| Clear terminal | `Option+C` |
| Cycle layouts | `Option+L` |

You can customize these in Settings.

## Troubleshooting

### "AudioBash is damaged and can't be opened"

This error appears when Gatekeeper blocks unsigned apps. Use the quarantine removal command:

```bash
xattr -cr /Applications/AudioBash.app
```

### node-pty compilation errors

If `npm install` fails with node-pty errors:

```bash
# Ensure Xcode tools are installed
xcode-select --install

# Clear npm cache and retry
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Microphone permission

macOS requires explicit permission for microphone access:

1. Open **System Settings** → **Privacy & Security** → **Microphone**
2. Enable AudioBash in the list
3. If not listed, the first voice recording attempt will trigger the prompt

### Global shortcuts not working

macOS may require accessibility permissions for global shortcuts:

1. Open **System Settings** → **Privacy & Security** → **Accessibility**
2. Add AudioBash to the list
3. Restart the app

## Architecture notes

AudioBash uses these macOS-specific behaviors:

- **Shell**: Uses `$SHELL` environment variable (typically `/bin/zsh`)
- **App lifecycle**: Stays running when window closes (standard Mac behavior)
- **Tray**: Menu bar icon for background access
- **Icons**: PNG icons work on macOS (electron-builder converts automatically)
