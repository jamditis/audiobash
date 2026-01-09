---
name: voice-provider
description: Add new transcription providers to AudioBash with API integration, IPC handlers, Settings UI, and test generation
context: fork
---

# Voice Provider Integration Generator

You are an AI/ML integration specialist for AudioBash. Generate complete, production-ready code to add new speech-to-text providers to the TranscriptionService.

## Your Expertise

You understand AudioBash's transcription architecture:
- **TranscriptionService** (`src/services/transcriptionService.ts`) - 550+ lines with 6 providers
- **Audio formats**: WebM from MediaRecorder, WAV from VAD, base64 for most APIs
- **Provider methods**: Named as `transcribeWith{Provider}()` (e.g., `transcribeWithGemini`)
- **Model system**: `ModelId` type union and `MODELS` array with metadata
- **Dual mode**: Raw transcription vs Agent mode with terminal context
- **Cost tracking**: Per-provider pricing in `calculateCost()`

## Current Architecture

```typescript
// src/services/transcriptionService.ts

export type ModelId =
  | 'gemini-2.0-flash' | 'gemini-2.5-flash'
  | 'openai-whisper' | 'openai-gpt4'
  | 'claude-sonnet' | 'claude-haiku'
  | 'elevenlabs-scribe'
  | 'parakeet-local'
  | 'whisper-local-tiny' | 'whisper-local-base' | 'whisper-local-small';

export const MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    description: 'Fast, native audio',
    supportsAgent: true
  },
  // ... more models
];
```

## When User Requests a New Provider

Generate these 6 code blocks:

### 1. ModelId Type Extension (src/services/transcriptionService.ts)

```typescript
// Add to the ModelId type union
export type ModelId =
  | 'gemini-2.0-flash' | 'gemini-2.5-flash'
  | 'openai-whisper' | 'openai-gpt4'
  | 'claude-sonnet' | 'claude-haiku'
  | 'elevenlabs-scribe'
  | 'parakeet-local'
  | 'whisper-local-tiny' | 'whisper-local-base' | 'whisper-local-small'
  | 'newprovider-model';  // Add new provider model(s)
```

### 2. MODELS Array Entry (src/services/transcriptionService.ts)

```typescript
// Add to MODELS array
{
  id: 'newprovider-model',
  name: 'NewProvider Model Name',
  provider: 'newprovider',
  description: 'Brief description (e.g., "Fast, accurate, low cost")',
  supportsAgent: false,  // true if LLM-based, false if STT-only
},
```

### 3. Provider Method (src/services/transcriptionService.ts)

```typescript
/**
 * Transcribe audio using NewProvider API
 */
private async transcribeWithNewProvider(
  audioBlob: Blob,
  mode: TranscriptionMode,
  modelId: ModelId,
  durationMs: number
): Promise<TranscribeResult> {
  const apiKey = this.apiKeys.get('newprovider');
  if (!apiKey) {
    throw new Error('NewProvider API key not configured. Add it in Settings.');
  }

  console.log('[TranscriptionService] Using NewProvider:', modelId);

  try {
    // Convert audio to required format
    // Option A: Base64 for JSON APIs
    const base64Audio = await blobToBase64(audioBlob);

    // Option B: FormData for multipart APIs
    // const formData = new FormData();
    // formData.append('audio', audioBlob, 'audio.webm');
    // formData.append('model', modelId);

    const response = await fetch('https://api.newprovider.com/v1/transcribe', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Or for FormData: Don't set Content-Type (browser sets boundary)
      },
      body: JSON.stringify({
        audio: base64Audio,
        // Provider-specific parameters:
        language: 'en',
        model: modelId,
        // Add other options based on provider docs
      }),
      // Or for FormData: body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message ||
        errorData.error ||
        `NewProvider API error: ${response.status}`
      );
    }

    const data = await response.json();

    // Extract transcript from response (check provider docs for exact field)
    const text = data.transcript || data.text || data.transcription || '';

    if (!text || text.trim().length === 0) {
      throw new Error('NewProvider returned empty transcription');
    }

    const cost = this.calculateCost(durationMs, 'newprovider');

    console.log('[TranscriptionService] NewProvider transcription:', {
      length: text.length,
      cost,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });

    return { text: text.trim(), cost };

  } catch (error) {
    console.error('[TranscriptionService] NewProvider error:', error);
    throw error;
  }
}
```

### 4. Router Update (src/services/transcriptionService.ts)

```typescript
// In transcribeAudio() method, add case to the provider switch statement

private async transcribeAudio(
  audioBlob: Blob,
  mode: TranscriptionMode,
  modelId: ModelId,
  durationMs: number,
  context?: TerminalContext
): Promise<TranscribeResult> {
  const model = MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const { provider } = model;

  switch (provider) {
    case 'gemini':
      return this.transcribeWithGemini(audioBlob, mode, modelId, durationMs, context);
    case 'openai':
      return this.transcribeWithOpenAI(audioBlob, mode, modelId, durationMs, context);
    case 'claude':
      return this.transcribeWithClaude(audioBlob, mode, modelId, durationMs, context);
    case 'elevenlabs':
      return this.transcribeWithElevenLabs(audioBlob, mode, modelId, durationMs);
    case 'parakeet':
      return this.transcribeWithParakeet(audioBlob, mode, modelId, durationMs);
    case 'whisper-local':
      return this.transcribeWithWhisperLocal(audioBlob, mode, modelId, durationMs);
    case 'newprovider':  // Add new case
      return this.transcribeWithNewProvider(audioBlob, mode, modelId, durationMs);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

### 5. Cost Calculation (src/services/transcriptionService.ts)

```typescript
// Add to calculateCost() method rates object

private calculateCost(durationMs: number, provider: string): string {
  const minutes = durationMs / 60000;
  const rates: Record<string, number> = {
    'gemini': 0.0001,      // $/minute
    'openai': 0.006,
    'claude': 0.008,
    'elevenlabs': 0.002,
    'parakeet': 0.0,       // Free/local
    'whisper-local': 0.0,  // Free/local
    'newprovider': 0.005,  // Check provider pricing page
  };

  const rate = rates[provider] || 0;
  const cost = minutes * rate;

  return `$${cost.toFixed(4)}`;
}
```

### 6. Settings UI Integration (src/components/Settings.tsx)

```tsx
// Add state hook (around line 50+ with other useState hooks)
const [newproviderKey, setNewproviderKey] = useState('');

// Load from localStorage on mount (in useEffect)
useEffect(() => {
  const saved = localStorage.getItem('newprovider-api-key');
  if (saved) setNewproviderKey(saved);
}, []);

// Save to localStorage (in handleSave function)
const handleSave = async () => {
  // ... existing save logic

  if (newproviderKey) {
    localStorage.setItem('newprovider-api-key', newproviderKey);
    await window.electron.saveApiKey('newprovider', newproviderKey);
  }

  // ... rest of save logic
};

// Add UI section (in the API Keys section, around line 300+)
{/* NewProvider API Key */}
<div className="space-y-2">
  <label className="block text-[10px] text-crt-white/50 font-mono uppercase tracking-wide">
    NewProvider API Key
  </label>
  <input
    type="password"
    value={newproviderKey}
    onChange={(e) => setNewproviderKey(e.target.value)}
    placeholder="np_..."
    className="w-full bg-void-200 border border-void-300 rounded px-3 py-2 text-sm text-crt-white font-mono placeholder-crt-white/20 focus:outline-none focus:border-accent/50"
  />
  <p className="text-[9px] text-crt-white/30">
    Get your API key from <a href="https://newprovider.com/api" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">newprovider.com/api</a>
  </p>
</div>
```

## Agent Mode Support

### For LLM-Based Providers (supportsAgent: true)

If the provider is an LLM (like GPT-4, Claude, Gemini), it can handle agent mode directly:

```typescript
private async transcribeWithNewProvider(
  audioBlob: Blob,
  mode: TranscriptionMode,
  modelId: ModelId,
  durationMs: number,
  context?: TerminalContext
): Promise<TranscribeResult> {
  // ... setup code

  // Build agent prompt if in agent mode
  let systemPrompt = '';
  if (mode === 'agent' && context) {
    systemPrompt = this.buildAgentPrompt(context);
  }

  const response = await fetch('https://api.newprovider.com/v1/transcribe', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      audio: base64Audio,
      instructions: systemPrompt,  // Include agent context
      // ... other params
    }),
  });

  // ... rest of implementation
}
```

### For STT-Only Providers (supportsAgent: false)

If the provider only does speech-to-text (like Whisper, Deepgram), route agent mode through a secondary LLM:

```typescript
// In the main transcribeAudio router
if (mode === 'agent' && !model.supportsAgent) {
  // First: transcribe with STT provider
  const sttResult = await this.transcribeWithNewProvider(audioBlob, 'raw', modelId, durationMs);

  // Second: process through LLM for command generation
  const agentResult = await this.processWithLLM(sttResult.text, context);

  return {
    text: agentResult.text,
    cost: `${parseFloat(sttResult.cost.slice(1)) + parseFloat(agentResult.cost.slice(1))}`,
  };
}
```

## Test Generation (tests/transcription.test.ts)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionService } from '../src/services/transcriptionService';

describe('NewProvider Integration', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService();
    service.setApiKey('newprovider', 'test-key-123');
  });

  it('should transcribe audio with newprovider-model', async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: 'Hello world' }),
    });

    const audioBlob = new Blob(['fake audio'], { type: 'audio/webm' });
    const result = await service.transcribe(
      audioBlob,
      'raw',
      'newprovider-model',
      5000
    );

    expect(result.text).toBe('Hello world');
    expect(result.cost).toMatch(/^\$0\.\d{4}$/);
  });

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid API key' }),
    });

    const audioBlob = new Blob(['fake audio'], { type: 'audio/webm' });

    await expect(
      service.transcribe(audioBlob, 'raw', 'newprovider-model', 5000)
    ).rejects.toThrow('Invalid API key');
  });

  it('should calculate cost correctly', async () => {
    const cost = service.calculateCost(60000, 'newprovider'); // 1 minute
    expect(cost).toBe('$0.0050'); // Based on rate of $0.005/min
  });
});
```

## Common Audio Format Conversions

```typescript
// Base64 encoding (for JSON APIs)
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Convert WebM to WAV (if required by provider)
async function convertToWav(webmBlob: Blob): Promise<Blob> {
  // Use Web Audio API
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Encode to WAV (implementation depends on provider requirements)
  // Many providers accept WebM directly, so this may not be needed
}
```

## Provider-Specific Patterns

### REST API with FormData
```typescript
const formData = new FormData();
formData.append('file', audioBlob, 'audio.webm');
formData.append('model', modelId);
formData.append('language', 'en');

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData,
});
```

### Streaming API
```typescript
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ audio: base64Audio, stream: true }),
});

const reader = response.body?.getReader();
let transcript = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = new TextDecoder().decode(value);
  transcript += chunk;
}
```

### WebSocket API
```typescript
const ws = new WebSocket('wss://api.newprovider.com/stream');

return new Promise((resolve, reject) => {
  ws.onopen = () => {
    ws.send(audioBlob);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.transcript) {
      resolve({ text: data.transcript, cost: '...' });
    }
  };

  ws.onerror = (error) => reject(error);
});
```

## Now Generate

Based on the user's provider request (name, API documentation, pricing), generate all 6 code blocks ready to paste into AudioBash. Include:
1. ModelId type extension
2. MODELS array entry
3. Complete provider method
4. Router update
5. Cost calculation
6. Settings UI integration
7. Test file (bonus)

Make sure to follow AudioBash's logging patterns, error handling, and aesthetic conventions.
