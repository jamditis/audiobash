# AudioBash - Voice-controlled terminal for Claude Code

## Project overview
AudioBash is an Electron app with an embedded terminal (xterm.js + node-pty) and push-to-talk voice input. It lets you talk to Claude Code without window switching or manual pasting.

## Tech stack
- **Framework**: Electron + React 19 (TypeScript)
- **Build**: Vite 6
- **Terminal**: xterm.js + node-pty
- **AI**: Google Gemini API (transcription)
- **Audio**: MediaRecorder API (WebM)
- **Styling**: Tailwind CSS v3

## Directory structure
```
audiobash/
├── electron/
│   ├── main.cjs          # Electron main process, node-pty
│   └── preload.cjs       # Context bridge for IPC
├── src/
│   ├── components/
│   │   ├── Terminal.tsx  # xterm.js wrapper
│   │   ├── VoicePanel.tsx # Voice input UI
│   │   └── TitleBar.tsx  # Frameless window controls
│   ├── services/         # Transcription service (port from Yap)
│   ├── utils/            # Audio utilities
│   ├── App.tsx           # Main layout
│   ├── index.tsx         # React entry
│   ├── index.css         # Tailwind entry
│   └── types.ts          # TypeScript interfaces
├── assets/               # Icons
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── CLAUDE.md
```

## Quick start

### 1. Install dependencies
```bash
npm install
```

### 2. Run in development
```bash
npm run electron:dev
```

### 3. Build for production
```bash
npm run electron:build
```

## Keyboard shortcuts
- `Alt+S` - Toggle voice recording
- `Alt+H` - Show/hide window

## Architecture

### Data flow
```
User speaks → MediaRecorder → Audio blob → Gemini API → Transcribed text
                                                              ↓
                                                    pty.write(text + '\r')
                                                              ↓
                                                    Shell executes command
                                                              ↓
                                                    pty.onData → xterm.write()
```

### IPC communication
- Main process owns the PTY process (node-pty)
- Renderer uses xterm.js for display
- IPC bridge connects them:
  - `terminal-write`: Renderer → Main (user input)
  - `terminal-data`: Main → Renderer (shell output)
  - `send-to-terminal`: Voice transcription → Shell

## Aesthetic
- **Void/brutalist** - Deep blacks (#050505), minimal decoration
- **Retrotechnofuturism** - CRT-inspired, scan lines, glow effects
- **High contrast** - Clear readability
- **Colors**: Accent red (#ff3333), CRT green (#33ff33), amber (#ffaa00)

## Troubleshooting

### node-pty build errors
node-pty requires native compilation:
```bash
npm rebuild node-pty
```

### Blank terminal
- Check DevTools console for errors
- Ensure PTY spawned successfully (check main process logs)

### Global shortcuts not working
- Check for conflicts with other apps
- Run as administrator if needed
