# AudioBash v1.4.0 Implementation Plan

> Target: Local-first voice transcription with smart recording

## Goals

1. **Zero-cost transcription** - Local Whisper processing, no API required
2. **Smarter recording** - VAD auto-stop, no manual timing needed
3. **Better accuracy** - Enhanced context, custom vocabulary UI

---

## Implementation Order

```
Week 1: Local Whisper Integration
        ↓
Week 2: VAD + Recording Modes
        ↓
Week 3: Context & Vocabulary Enhancements
        ↓
Week 4: Polish, Testing, Release
```

---

## Task 1: Local Whisper Integration

### 1.1 Add Dependencies

```bash
npm install nodejs-whisper
```

**Alternative options evaluated:**
- `nodejs-whisper` ✅ - Auto WAV conversion, model management, Apple Silicon optimized
- `@fugood/whisper.node` - Better GPU support but more complex setup
- `smart-whisper` - Good for parallel inference but less maintained

### 1.2 Create Whisper Service

**New file: `electron/whisperService.cjs`**

```javascript
const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const fs = require('fs');
const os = require('os');

class WhisperService {
  constructor() {
    this.modelsDir = path.join(os.homedir(), '.audiobash', 'models');
    this.currentModel = 'base.en';
  }

  async ensureModelExists(modelName) {
    // nodejs-whisper handles download automatically
    // but we can check/report progress
  }

  async transcribe(audioPath) {
    const result = await nodewhisper(audioPath, {
      modelName: this.currentModel,
      autoDownloadModelName: this.currentModel,
      removeWavFileAfterTranscription: true,
    });
    return result;
  }

  async getAvailableModels() {
    return [
      { id: 'tiny.en', size: '75 MB', speed: 'Fastest', accuracy: 'Good' },
      { id: 'base.en', size: '142 MB', speed: 'Fast', accuracy: 'Better' },
      { id: 'small.en', size: '466 MB', speed: 'Medium', accuracy: 'Best' },
    ];
  }

  setModel(modelName) {
    this.currentModel = modelName;
  }
}

module.exports = { WhisperService };
```

### 1.3 Add IPC Handlers

**Modify: `electron/main.cjs`**

```javascript
const { WhisperService } = require('./whisperService.cjs');
const whisperService = new WhisperService();

// Add to IPC handlers section
ipcMain.handle('whisper-transcribe', async (event, audioPath) => {
  try {
    const result = await whisperService.transcribe(audioPath);
    return { success: true, text: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('whisper-set-model', async (event, modelName) => {
  whisperService.setModel(modelName);
  return { success: true };
});

ipcMain.handle('whisper-get-models', async () => {
  return whisperService.getAvailableModels();
});

ipcMain.handle('save-temp-audio', async (event, base64Data) => {
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `audiobash-${Date.now()}.webm`);
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
});
```

### 1.4 Update Preload

**Modify: `electron/preload.cjs`**

```javascript
// Add to contextBridge.exposeInMainWorld
whisperTranscribe: (audioPath) => ipcRenderer.invoke('whisper-transcribe', audioPath),
whisperSetModel: (model) => ipcRenderer.invoke('whisper-set-model', model),
whisperGetModels: () => ipcRenderer.invoke('whisper-get-models'),
saveTempAudio: (base64) => ipcRenderer.invoke('save-temp-audio', base64),
```

### 1.5 Update Transcription Service

**Modify: `src/services/transcriptionService.ts`**

Add new model types:
```typescript
export type ModelId =
  // Existing cloud providers
  | 'gemini-2.0-flash'
  | 'gemini-2.5-flash'
  | 'openai-whisper'
  | 'openai-gpt4'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'elevenlabs-scribe'
  // New local providers
  | 'whisper-local-tiny'
  | 'whisper-local-base'
  | 'whisper-local-small';

// Add to MODELS array
{ id: 'whisper-local-tiny', name: 'Whisper Tiny (Local)', provider: 'local', description: '75MB, fastest', supportsAgent: false },
{ id: 'whisper-local-base', name: 'Whisper Base (Local)', provider: 'local', description: '142MB, recommended', supportsAgent: false },
{ id: 'whisper-local-small', name: 'Whisper Small (Local)', provider: 'local', description: '466MB, best accuracy', supportsAgent: false },
```

Update `transcribeLocal`:
```typescript
private async transcribeLocalWhisper(
  audioBlob: Blob,
  modelId: ModelId
): Promise<TranscribeResult> {
  // Convert blob to base64
  const base64 = await blobToBase64(audioBlob);

  // Save to temp file via IPC
  const tempPath = await window.electron.saveTempAudio(base64);

  // Set model based on selection
  const modelMap: Record<string, string> = {
    'whisper-local-tiny': 'tiny.en',
    'whisper-local-base': 'base.en',
    'whisper-local-small': 'small.en',
  };
  await window.electron.whisperSetModel(modelMap[modelId]);

  // Transcribe
  const result = await window.electron.whisperTranscribe(tempPath);

  if (!result.success) {
    throw new Error(result.error);
  }

  return { text: result.text, cost: '$0.00 (Local)' };
}
```

### 1.6 Settings UI for Model Selection

**Modify: `src/components/Settings.tsx`**

Add model management section:
- Model dropdown with size/speed info
- Download status indicator
- "Download now" button for preloading
- Storage usage display

---

## Task 2: Voice Activity Detection

### 2.1 Add VAD Package

```bash
npm install @ricky0123/vad-web
```

### 2.2 Create VAD Hook

**New file: `src/hooks/useVAD.ts`**

```typescript
import { useRef, useEffect, useCallback, useState } from 'react';
import { MicVAD, RealTimeVADOptions } from '@ricky0123/vad-web';

interface UseVADOptions {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  silenceThreshold?: number; // ms of silence before stopping
}

export function useVAD(options: UseVADOptions) {
  const vadRef = useRef<MicVAD | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const start = useCallback(async () => {
    if (vadRef.current) return;

    vadRef.current = await MicVAD.new({
      onSpeechStart: () => {
        setIsSpeaking(true);
        options.onSpeechStart?.();
      },
      onSpeechEnd: (audio) => {
        setIsSpeaking(false);
        options.onSpeechEnd?.(audio);
      },
      // Silero VAD model - very accurate
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionFrames: 8,
      frameSamples: 1536,
      minSpeechFrames: 3,
    });

    vadRef.current.start();
    setIsListening(true);
  }, [options]);

  const stop = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.destroy();
      vadRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { start, stop, isListening, isSpeaking };
}
```

### 2.3 Integrate with VoiceOverlay

**Modify: `src/components/VoiceOverlay.tsx`**

Add recording mode state:
```typescript
type RecordingMode = 'manual' | 'vad' | 'continuous';

const [recordingMode, setRecordingMode] = useState<RecordingMode>('manual');
```

Add VAD integration:
```typescript
const { start: startVAD, stop: stopVAD, isSpeaking } = useVAD({
  onSpeechEnd: async (audio) => {
    if (recordingMode === 'vad' || recordingMode === 'continuous') {
      // Convert Float32Array to Blob
      const blob = float32ToBlob(audio);
      await processAudio(blob);

      if (recordingMode === 'continuous') {
        // Restart listening
        startVAD();
      }
    }
  },
});
```

### 2.4 UI Updates

Add mode selector to VoiceOverlay:
```tsx
<div className="flex gap-1 text-[9px]">
  <button
    onClick={() => setRecordingMode('manual')}
    className={recordingMode === 'manual' ? 'text-accent' : 'text-crt-white/30'}
  >
    Manual
  </button>
  <button
    onClick={() => setRecordingMode('vad')}
    className={recordingMode === 'vad' ? 'text-accent' : 'text-crt-white/30'}
  >
    Auto-Stop
  </button>
  <button
    onClick={() => setRecordingMode('continuous')}
    className={recordingMode === 'continuous' ? 'text-accent' : 'text-crt-white/30'}
  >
    Continuous
  </button>
</div>
```

Add speaking indicator:
```tsx
{isSpeaking && (
  <div className="absolute top-2 right-2 w-2 h-2 bg-crt-green rounded-full animate-pulse" />
)}
```

---

## Task 3: Enhanced Context & Vocabulary

### 3.1 Expand Terminal Context

**Modify: `electron/main.cjs` - getTerminalContext handler**

```javascript
// Increase context window
const truncatedOutput = context.recentOutput.slice(-2000); // was 500

// Add git context
const gitBranch = await execAsync('git branch --show-current', { cwd });
const gitStatus = await execAsync('git status --porcelain', { cwd });

// Add project detection
const projectType = detectProjectType(cwd); // check for package.json, Cargo.toml, etc.

return {
  ...existingContext,
  gitBranch,
  gitStatus: gitStatus.split('\n').slice(0, 10),
  projectType,
};
```

### 3.2 Vocabulary Management UI

**Modify: `src/components/Settings.tsx`**

Add vocabulary section:
```tsx
<section className="space-y-4">
  <h3 className="text-sm font-mono uppercase tracking-wider text-crt-white/70">
    Custom Vocabulary
  </h3>

  {/* Vocabulary list */}
  <div className="space-y-2">
    {vocabulary.map((entry, i) => (
      <div key={i} className="flex gap-2 items-center">
        <input
          value={entry.spoken}
          onChange={(e) => updateVocab(i, 'spoken', e.target.value)}
          placeholder="Sounds like..."
          className="flex-1 bg-void-200 border border-void-300 rounded px-2 py-1 text-xs"
        />
        <span className="text-crt-white/30">→</span>
        <input
          value={entry.written}
          onChange={(e) => updateVocab(i, 'written', e.target.value)}
          placeholder="Write as..."
          className="flex-1 bg-void-200 border border-void-300 rounded px-2 py-1 text-xs"
        />
        <button onClick={() => removeVocab(i)} className="text-accent">×</button>
      </div>
    ))}
  </div>

  <button onClick={addVocabEntry} className="text-xs text-crt-white/50 hover:text-accent">
    + Add vocabulary entry
  </button>

  {/* Import/Export */}
  <div className="flex gap-2 pt-2 border-t border-void-300">
    <button onClick={exportVocab} className="text-xs text-crt-white/30">
      Export JSON
    </button>
    <button onClick={importVocab} className="text-xs text-crt-white/30">
      Import JSON
    </button>
  </div>
</section>
```

---

## Task 4: Agent Mode with Local Whisper

### 4.1 Two-Stage Processing

For local Whisper + agent mode, implement two-stage processing:

```typescript
// Stage 1: Local Whisper transcription
const rawText = await transcribeLocalWhisper(blob, modelId);

// Stage 2: LLM for command conversion (if agent mode)
if (mode === 'agent' && rawText) {
  const command = await convertToCommand(rawText, context);
  return { text: command, cost: '$0.00 (Local) + LLM' };
}
```

### 4.2 Offline Agent Mode (Future)

For fully offline agent mode, consider:
- Local LLM via llama.cpp / Ollama
- Rule-based command patterns
- Fine-tuned small model for command extraction

---

## Testing Plan

### Unit Tests

```typescript
// tests/whisper-service.test.ts
describe('WhisperService', () => {
  it('should transcribe audio file', async () => {
    const result = await whisperService.transcribe('test-audio.wav');
    expect(result).toContain('expected text');
  });

  it('should handle missing model gracefully', async () => {
    // Should auto-download or show helpful error
  });
});

// tests/vad.test.ts
describe('VAD Hook', () => {
  it('should detect speech start', async () => {});
  it('should detect speech end after silence', async () => {});
  it('should work in continuous mode', async () => {});
});
```

### Integration Tests

```typescript
// tests/transcription-flow.test.ts
describe('Transcription Flow', () => {
  it('should transcribe with local Whisper', async () => {});
  it('should fall back to cloud on local failure', async () => {});
  it('should apply vocabulary corrections', async () => {});
});
```

### Manual Testing Checklist

- [ ] First-time model download works
- [ ] Model switching works
- [ ] VAD detects speech correctly
- [ ] Continuous mode restarts properly
- [ ] Context is included in agent prompts
- [ ] Vocabulary corrections are applied
- [ ] Works offline (local mode)
- [ ] Works on Windows
- [ ] Works on macOS (Intel + Apple Silicon)
- [ ] Works on Linux

---

## Rollout Plan

### Alpha (Internal Testing)
1. Implement local Whisper (Task 1)
2. Test on all platforms
3. Fix critical bugs

### Beta (Limited Release)
1. Add VAD (Task 2)
2. Add vocabulary UI (Task 3)
3. Gather feedback from beta users

### Release v1.4.0
1. Polish based on feedback
2. Update documentation
3. Create release notes
4. Publish to GitHub releases

---

## Files Changed Summary

### New Files
- `electron/whisperService.cjs`
- `src/hooks/useVAD.ts`
- `src/utils/audioConversion.ts`

### Modified Files
- `package.json` - Add dependencies
- `electron/main.cjs` - Add IPC handlers
- `electron/preload.cjs` - Expose new APIs
- `src/services/transcriptionService.ts` - Add local providers
- `src/components/VoiceOverlay.tsx` - Add VAD, recording modes
- `src/components/Settings.tsx` - Add model selection, vocabulary UI
- `src/types.ts` - Add new type definitions

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| nodejs-whisper native compilation fails | High | Fall back to WASM version, add clear error messages |
| Model download slow/fails | Medium | Add progress indicator, retry logic, offline fallback |
| VAD false positives | Medium | Make sensitivity configurable, add manual override |
| Large app size with models | Medium | Download models on-demand, not bundled |
| Performance on older hardware | Low | Default to tiny model, add performance warnings |

---

## Success Metrics

1. **Zero API calls** - Users can transcribe without any cloud API
2. **<2s latency** - Time from speech end to text display
3. **>95% accuracy** - On common terminal commands
4. **<200MB install** - Not including optional large models
