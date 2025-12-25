# Voice Dictation Tools Research & Integration Guide

> Research compiled December 2025 for AudioBash v2.0 planning

## Executive Summary

This document analyzes the voice dictation landscape to inform AudioBash's evolution from cloud-dependent transcription to a hybrid local/cloud architecture with advanced features like screen context awareness, custom vocabularies, and voice activity detection.

---

## Table of Contents

1. [Commercial Tool Comparison](#commercial-tool-comparison)
2. [Open Source Projects](#open-source-projects)
3. [NPM Packages for Integration](#npm-packages-for-integration)
4. [Architecture Patterns](#architecture-patterns)
5. [Integration Strategy](#integration-strategy)

---

## Commercial Tool Comparison

| Tool | OS Support | Price | Accuracy | Key Differentiator |
|------|-----------|-------|----------|-------------------|
| **Aqua Voice** | Mac, Windows | $8/mo | ~99% | Screen context awareness, technical terms |
| **Wispr Flow** | Mac, Windows, iOS | $12-15/mo | 95%+ | IDE integrations (Cursor, VS Code), SOC2/HIPAA |
| **SuperWhisper** | macOS, iOS | $8.49/mo or $249 lifetime | Near-perfect | Offline mode, multiple AI models |
| **Willow Voice** | Mac, iOS | $15/mo | 3x better than built-in | YC-backed, custom dictionaries |
| **VoiceInk** | Mac only | $39 one-time | 99% | Open source, 100% offline |
| **Dragon Pro** | Windows only | $300-699 | 99% | Enterprise, legal/medical editions |

### Key Insights

1. **Screen Context Awareness** (Aqua Voice's differentiator): Analyzes on-screen content to improve transcription accuracy for technical terms
2. **IDE Integration** (Wispr Flow): Deep integration with Cursor/VS Code for developer workflows
3. **Hybrid Processing**: Most tools offer both cloud and local options
4. **Custom Vocabulary**: Critical for technical accuracy (programming terms, project-specific names)

---

## Open Source Projects

### Tier 1: Directly Applicable (Same Stack)

#### open-whispr (MIT License) ⭐ RECOMMENDED
- **GitHub**: https://github.com/HeroTools/open-whispr
- **Stack**: Electron + React 19 + TypeScript + Tailwind v4
- **Why Relevant**: Nearly identical stack to AudioBash, MIT license allows direct code reuse

**Key Architecture:**
```
open-whispr/
├── main.js                 # Electron main process
├── preload.js              # IPC bridge
├── whisper_bridge.py       # Python Whisper subprocess
├── src/
│   ├── components/         # React UI (shadcn/ui)
│   └── lib/
│       └── whisper-client.ts  # Provider abstraction
```

**Features to Adapt:**
- Local Whisper model management (auto-download, model selection)
- Multi-provider fallback (local → cloud)
- Global hotkey with visual feedback
- Auto-paste at cursor location

#### VoiceInk (GPL v3)
- **GitHub**: https://github.com/Beingpax/VoiceInk
- **Stack**: Swift/macOS + whisper.cpp
- **Why Relevant**: Context awareness, Power Mode patterns

**Patterns to Study:**
- Per-application context detection
- Custom vocabulary management
- AI enhancement post-processing

### Tier 2: Reference Implementations

| Project | License | Stack | Key Learning |
|---------|---------|-------|--------------|
| [whisper-writer](https://github.com/savbell/whisper-writer) | GPL v3 | Python + faster-whisper | Recording modes (continuous, VAD, PTT) |
| [Talon community](https://github.com/talonhub/community) | MIT | Python | Voice command grammars for coding |
| [vxtron](https://github.com/dtinth/vxtron) | MIT | Electron | Minimal voice-to-clipboard |
| [electron-voice](https://github.com/orthagonal/electron-voice) | MIT | Electron + Vosk | Vosk integration pattern |

### Tier 3: Core Libraries

#### whisper.cpp
- **GitHub**: https://github.com/ggml-org/whisper.cpp
- **What**: C++ port of OpenAI Whisper, optimized for CPU/GPU
- **Models**: tiny (75MB) → large (1.5GB)
- **Features**: VAD support, streaming, WASM build

**Key Examples in Repo:**
- `examples/stream/` - Real-time microphone transcription
- `examples/whisper.wasm/` - Browser WebAssembly version
- `examples/command/` - Voice command detection
- `bindings/javascript/` - Official Node.js addon

#### Vosk
- **GitHub**: https://github.com/alphacep/vosk-api
- **What**: Lightweight offline speech recognition
- **Why Consider**: 50MB models, true streaming, <100ms latency

#### Transformers.js
- **GitHub**: https://huggingface.co/docs/transformers.js
- **What**: Run Whisper in browser via ONNX/WebGPU
- **npm**: `@huggingface/transformers`

---

## NPM Packages for Integration

### Whisper Bindings

| Package | Install | Platform | Notes |
|---------|---------|----------|-------|
| `nodejs-whisper` | `npm i nodejs-whisper` | All | Auto WAV convert, Apple Silicon optimized |
| `@fugood/whisper.node` | `npm i @fugood/whisper.node` | All | Metal GPU (Mac), Vulkan/CUDA (Win/Linux) |
| `smart-whisper` | `npm i smart-whisper` | All | Auto model offloading, parallel inference |
| `whisper-node` | `npm i whisper-node` | All | Simple whisper.cpp bindings |

### Voice Activity Detection

| Package | Install | Notes |
|---------|---------|-------|
| `@ricky0123/vad-web` | `npm i @ricky0123/vad-web` | Browser VAD with Silero model |
| `@ricky0123/vad-node` | `npm i @ricky0123/vad-node` | Node.js VAD |

### Audio Processing

| Package | Install | Notes |
|---------|---------|-------|
| `@huggingface/transformers` | `npm i @huggingface/transformers` | Whisper in renderer process |
| `vosk` | `npm i vosk` | Lightweight streaming ASR |

### Screen/Context

| Package | Install | Notes |
|---------|---------|-------|
| `tesseract.js` | `npm i tesseract.js` | OCR for screen context |
| `active-win` | `npm i active-win` | Get active window info |

---

## Architecture Patterns

### Pattern 1: Python Bridge (open-whispr style)

```
Electron Main Process
    ↓ spawn
Python subprocess (whisper_bridge.py)
    ↓ uses
faster-whisper / whisper.cpp
    ↓ returns
JSON result via stdout
```

**Pros**: Best accuracy, full whisper.cpp features, easy model management
**Cons**: Requires Python bundled or installed, larger app size

### Pattern 2: Native Node Addon (whisper.node style)

```
Electron Main Process
    ↓ require
whisper.node native addon
    ↓ calls
whisper.cpp compiled library
```

**Pros**: No Python dependency, faster IPC
**Cons**: Complex build process, platform-specific binaries

### Pattern 3: Renderer WASM (Transformers.js style)

```
Electron Renderer Process
    ↓ import
@huggingface/transformers
    ↓ loads
ONNX model via WebAssembly/WebGPU
```

**Pros**: No native compilation, works in browser, WebGPU acceleration
**Cons**: Slower than native, larger memory footprint

### Pattern 4: Streaming VAD + Whisper

```
MediaRecorder → VAD (detect speech) → Whisper (transcribe segments)
                    ↓
              Silent: skip
              Speech: buffer → transcribe on pause
```

**Pros**: Lower latency, efficient processing, natural conversation flow
**Cons**: More complex state management

---

## Integration Strategy for AudioBash

### Current State

```typescript
// transcriptionService.ts - Current providers
type ModelId =
  | 'gemini-2.0-flash'    // Cloud
  | 'gemini-2.5-flash'    // Cloud
  | 'openai-whisper'      // Cloud
  | 'openai-gpt4'         // Cloud
  | 'claude-sonnet'       // Cloud
  | 'claude-haiku'        // Cloud
  | 'elevenlabs-scribe'   // Cloud
  | 'parakeet-local';     // Local (placeholder)
```

### Proposed Evolution

```typescript
// New provider architecture
type ModelId =
  // Cloud providers (existing)
  | 'gemini-2.0-flash'
  | 'gemini-2.5-flash'
  | 'openai-whisper'
  | 'openai-gpt4'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'elevenlabs-scribe'
  // Local providers (new)
  | 'whisper-local-tiny'    // 75MB, fastest
  | 'whisper-local-base'    // 142MB, recommended
  | 'whisper-local-small'   // 466MB, better accuracy
  | 'vosk-local';           // 50MB, streaming
```

### Phase 1: Local Whisper (Drop-in)

Add `nodejs-whisper` to existing architecture:

```typescript
// electron/whisperLocal.cjs
const { nodewhisper } = require('nodejs-whisper');

async function transcribe(audioPath, model = 'base.en') {
  return await nodewhisper(audioPath, {
    modelName: model,
    autoDownloadModelName: model,
  });
}
```

### Phase 2: Voice Activity Detection

Add VAD for smarter recording:

```typescript
// src/hooks/useVAD.ts
import { MicVAD } from '@ricky0123/vad-web';

export function useVAD(onSpeechEnd: (audio: Float32Array) => void) {
  const vadRef = useRef<MicVAD | null>(null);

  useEffect(() => {
    MicVAD.new({
      onSpeechEnd: (audio) => {
        onSpeechEnd(audio);
      },
      onSpeechStart: () => {
        // Visual feedback
      }
    }).then(vad => {
      vadRef.current = vad;
    });
  }, []);
}
```

### Phase 3: Screen Context Enhancement

Leverage existing terminal context + add window awareness:

```typescript
// Enhanced context for agent mode
interface EnhancedContext extends TerminalContext {
  activeWindow: {
    title: string;
    app: string;
  };
  screenText?: string;  // OCR of visible area (optional)
  projectContext?: {
    language: string;
    framework: string;
    recentFiles: string[];
  };
}
```

---

## Cost Analysis

| Approach | Model Size | Per-Minute Cost | Privacy |
|----------|-----------|-----------------|---------|
| Gemini Flash (current) | N/A | ~$0.0001 | Cloud |
| OpenAI Whisper API | N/A | $0.006 | Cloud |
| Local whisper-tiny | 75MB | **$0** | 100% Local |
| Local whisper-base | 142MB | **$0** | 100% Local |
| Local Vosk | 50MB | **$0** | 100% Local |

---

## Resources

### Curated Lists
- [awesome-whisper](https://github.com/sindresorhus/awesome-whisper) - Comprehensive Whisper ecosystem
- [Awesome-Whisper-Apps](https://github.com/danielrosehill/Awesome-Whisper-Apps) - Application focused

### Live Demos
- [whisper.cpp WASM](https://ggml.ai/whisper.cpp/) - Browser demo
- [whisper-web](https://github.com/xenova/whisper-web) - Transformers.js demo

### Documentation
- [whisper.cpp docs](https://github.com/ggml-org/whisper.cpp/blob/master/README.md)
- [Transformers.js ASR](https://huggingface.co/docs/transformers.js/index)
- [Vosk docs](https://alphacephei.com/vosk/)
