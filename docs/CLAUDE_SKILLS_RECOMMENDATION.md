# Claude Skills Recommendation for AudioBash

> Based on comprehensive codebase analysis applying the 4 Core Truths:
> - **Expertise Transfer, Not Instructions** - Make Claude *think* like an expert
> - **Flow, Not Friction** - Produce output, not intermediate documents
> - **Voice Matches Domain** - Sound like a practitioner
> - **Focused Beats Comprehensive** - Every section earns its place

---

## Executive Summary

After deep analysis of AudioBash's architecture (2,300+ lines Electron, 768-line App.tsx, 1,007-line Settings.tsx, 43+ IPC handlers), these skills would have the highest impact on development velocity:

| Skill | Impact | Complexity | Frequency of Use |
|-------|--------|------------|------------------|
| **ipc-handler** | High | Low | Every feature |
| **settings-section** | High | Medium | Every config change |
| **transcription-provider** | High | Medium | Per-provider |
| **react-component** | Medium | Medium | UI features |
| **test-suite** | Medium | Low | Every PR |
| **agent-prompt** | Medium | Low | Context improvements |

---

## Skill 1: `ipc-handler` (Highest Priority)

### Problem It Solves
AudioBash has 43+ IPC handlers scattered across `main.cjs` (1,260 lines). Adding new Electron↔Renderer communication requires:
1. Handler in `main.cjs` (ipcMain.handle or ipcMain.on)
2. Bridge in `preload.cjs` (contextBridge.exposeInMainWorld)
3. TypeScript types in renderer
4. Often a service class method

**Current Pain**: Developers add handlers inconsistently, miss preload exposure, or forget error handling patterns.

### What Claude Should Think Like
An Electron architect who:
- Knows `handle` (async/response) vs `on` (fire-and-forget) patterns
- Understands security implications of contextBridge
- Follows AudioBash naming conventions (`kebab-case` for IPC, `camelCase` for JS)
- Always wraps in try-catch with `{ success, data, error }` responses

### Skill Output
Given a feature description, produce:
1. Complete `ipcMain.handle()` or `ipcMain.on()` code block
2. `preload.cjs` exposure with correct invoke/send pattern
3. TypeScript interface for the response type
4. Usage example in renderer

### Example Invocation
```
User: "Add IPC handler to get system CPU usage"

Skill produces ready-to-paste code for:
- main.cjs handler using os.cpus()
- preload.cjs exposure
- Renderer usage: window.electron.getCpuUsage()
```

### Key Patterns to Embed
```javascript
// ALWAYS use this response pattern:
ipcMain.handle('feature-name', async (event, ...args) => {
  try {
    const result = await doWork(args);
    return { success: true, data: result };
  } catch (error) {
    console.error('[AudioBash] feature-name error:', error);
    return { success: false, error: error.message };
  }
});

// ALWAYS expose in preload with matching name:
featureName: (...args) => ipcRenderer.invoke('feature-name', ...args),
```

---

## Skill 2: `settings-section` (High Priority)

### Problem It Solves
Settings.tsx is 1,007 lines with inconsistent patterns:
- Toggle switches implemented 5+ times with subtle differences
- API key inputs have different validation approaches
- No standard section wrapper component
- State scattered across 15+ useState hooks

**Current Pain**: Adding a new settings section requires reading 1000 lines to find patterns, often resulting in inconsistent UI.

### What Claude Should Think Like
A React developer who:
- Knows AudioBash's void/brutalist aesthetic (colors: void-100, accent #ff3333, crt-green)
- Uses existing Tailwind patterns from Settings.tsx
- Manages localStorage persistence correctly
- Handles the Settings modal's save/cancel flow

### Skill Output
Given a setting type (toggle, text input, select, multi-input), produce:
1. Complete JSX section with proper styling
2. State hook with localStorage sync
3. IPC call if Electron storage needed
4. Reset/default value logic

### Example Invocation
```
User: "Add a setting for transcription timeout (number input, 5-60 seconds)"

Skill produces:
- useState with localStorage init
- Number input with Tailwind styling matching existing
- Validation (min/max)
- Save handler with IPC bridge
```

### Key Patterns to Embed
```tsx
// Standard section wrapper:
<div className="space-y-3">
  <label className="block text-[10px] text-crt-white/50 font-mono uppercase">
    Setting Name
  </label>
  {/* Input or toggle here */}
  <p className="text-[9px] text-crt-white/30">
    Description text explaining the setting
  </p>
</div>

// Toggle switch pattern:
<button
  onClick={() => setEnabled(!enabled)}
  className={`w-10 h-5 rounded-full transition-colors ${
    enabled ? 'bg-crt-green' : 'bg-void-300'
  }`}
>
  <div className={`w-4 h-4 rounded-full bg-crt-white transition-transform ${
    enabled ? 'translate-x-5' : 'translate-x-0.5'
  }`} />
</button>
```

---

## Skill 3: `transcription-provider` (High Priority)

### Problem It Solves
TranscriptionService supports 6 providers with provider-specific:
- API initialization patterns
- Request/response formats
- Cost calculation
- Error handling
- Agent mode compatibility

**Current Pain**: Adding a new provider (e.g., AssemblyAI, Deepgram) requires understanding the entire 550-line service class.

### What Claude Should Think Like
An AI/ML engineer who:
- Understands audio encoding (WebM, WAV, base64)
- Knows API patterns for speech-to-text services
- Follows the `transcribeWith{Provider}` naming convention
- Handles both raw transcription and agent mode routing

### Skill Output
Given a provider name and API documentation URL, produce:
1. New ModelId type union member
2. MODELS array entry with correct metadata
3. Complete `transcribeWith{Provider}()` method
4. API key handling in Settings.tsx
5. Cost calculation logic

### Example Invocation
```
User: "Add Deepgram as a transcription provider"

Skill produces:
- 'deepgram-nova' ModelId
- MODELS entry with description, supportsAgent: false
- transcribeWithDeepgram() with FormData multipart
- Settings section for Deepgram API key
```

### Key Patterns to Embed
```typescript
// Provider method signature:
private async transcribeWith{Provider}(
  audioBlob: Blob,
  mode: TranscriptionMode,
  modelId: ModelId,
  durationMs: number
): Promise<TranscribeResult>

// Always return:
return {
  text: transcribedText.trim(),
  cost: this.calculateCost(durationMs, 'provider-name')
};

// Cost calculation pattern:
private calculateCost(durationMs: number, provider: string): string {
  const minutes = durationMs / 60000;
  const rates: Record<string, number> = {
    'gemini': 0.0001,
    'openai': 0.006,
    // Add new provider rate
  };
  return `$${(minutes * rates[provider]).toFixed(4)}`;
}
```

---

## Skill 4: `react-component` (Medium Priority)

### Problem It Solves
Components use inconsistent patterns:
- Some have inline styles, others Tailwind
- Props interfaces defined inline vs exported
- Event handlers sometimes useCallback, sometimes inline
- No standard file structure

**Current Pain**: New components don't match existing aesthetic or patterns.

### What Claude Should Think Like
A React developer who:
- Uses Tailwind with AudioBash's custom colors (void-*, crt-*, accent)
- Follows hooks best practices (useCallback for handlers, useMemo for expensive ops)
- Knows when to lift state vs keep local
- Uses the existing icon patterns (inline SVG components)

### Skill Output
Given component requirements, produce:
1. Complete TypeScript component file
2. Props interface (exported)
3. Internal state with proper typing
4. Event handlers with useCallback
5. Tailwind classes matching aesthetic

### Key Patterns to Embed
```tsx
// Standard component structure:
interface ComponentNameProps {
  prop1: string;
  onAction?: () => void;
}

export const ComponentName: React.FC<ComponentNameProps> = ({
  prop1,
  onAction,
}) => {
  const [state, setState] = useState<StateType>(initial);

  const handleClick = useCallback(() => {
    // Handler logic
    onAction?.();
  }, [onAction]);

  return (
    <div className="bg-void-100 border border-void-300 rounded">
      {/* Content */}
    </div>
  );
};

// Color palette reference:
// bg-void-100 (#0a0a0a), bg-void-200 (#111111), bg-void-300 (#1a1a1a)
// text-crt-white (#f0f0f0), text-crt-white/50 (50% opacity)
// text-accent (#ff3333), text-crt-green (#33ff33), text-crt-amber (#ffaa00)
// border-void-300, hover:border-crt-white/20
```

---

## Skill 5: `test-suite` (Medium Priority)

### Problem It Solves
Only 70 tests exist, all configuration-based. Missing:
- Unit tests for transcriptionService
- Component tests for React UI
- IPC integration tests
- Audio utility tests

**Current Pain**: No test coverage for business logic, easy to introduce regressions.

### What Claude Should Think Like
A QA engineer who:
- Knows Vitest patterns (describe, it, expect)
- Mocks Electron IPC for renderer tests
- Uses test fixtures for audio files
- Writes cross-platform assertions

### Skill Output
Given a module/function to test, produce:
1. Complete test file with describe blocks
2. Proper mocking setup
3. Edge case coverage
4. Cross-platform considerations

### Key Patterns to Embed
```typescript
// Test file structure:
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('functionName', () => {
    it('should handle normal case', () => {
      const result = functionName(input);
      expect(result).toEqual(expected);
    });

    it('should handle edge case', () => {
      expect(() => functionName(invalid)).toThrow();
    });
  });
});

// Mock Electron IPC:
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
  },
}));
```

---

## Skill 6: `agent-prompt` (Medium Priority)

### Problem It Solves
Agent mode prompts are embedded in transcriptionService.ts with:
- OS-specific command mappings
- Shell-specific syntax (PowerShell vs Bash)
- Terminal context injection
- Custom instructions merging

**Current Pain**: Improving agent intelligence requires understanding the entire prompt architecture.

### What Claude Should Think Like
A prompt engineer who:
- Knows OS command differences (Windows: Get-ChildItem, Unix: ls -la)
- Understands shell quoting rules
- Builds context-aware prompts
- Handles edge cases (empty cwd, no recent output)

### Skill Output
Given a context enhancement (e.g., "add git branch awareness"), produce:
1. Context extraction logic for main.cjs
2. Prompt section additions
3. Example transformations (input → command)

### Key Patterns to Embed
```typescript
// Context building pattern:
private buildAgentPrompt(context?: TerminalContext): string {
  const os = context?.os || 'unknown';
  const shell = context?.shell || 'unknown';

  let prompt = `You are a CLI assistant for ${os} using ${shell}.\n`;

  if (context?.cwd) {
    prompt += `Current directory: ${context.cwd}\n`;
  }

  if (context?.lastError) {
    prompt += `Recent error: ${context.lastError}\n`;
  }

  // OS-specific examples:
  if (os === 'windows') {
    prompt += `Use PowerShell commands: Get-ChildItem, Set-Location, etc.\n`;
  } else {
    prompt += `Use Unix commands: ls, cd, grep, etc.\n`;
  }

  return prompt;
}
```

---

## Implementation Priority

### Phase 1: Core Development Skills (Week 1)
1. **ipc-handler** - Every feature needs this
2. **settings-section** - Settings changes are frequent

### Phase 2: Feature-Specific Skills (Week 2)
3. **transcription-provider** - For adding new AI services
4. **react-component** - For UI work

### Phase 3: Quality Skills (Week 3)
5. **test-suite** - Improve coverage
6. **agent-prompt** - Enhance intelligence

---

## Skill File Structure

Each skill should be a `.md` file in `~/.claude/skills/audiobash/`:

```
~/.claude/skills/audiobash/
├── ipc-handler.md
├── settings-section.md
├── transcription-provider.md
├── react-component.md
├── test-suite.md
└── agent-prompt.md
```

Or as project-local slash commands in `.claude/commands/`:

```
.claude/commands/
├── ipc-handler.md
├── settings-section.md
└── ...
```

---

## Measurement Criteria

A skill is successful if it:
1. **Reduces time-to-implementation** by 50%+ for its domain
2. **Produces code that passes existing tests** without modification
3. **Matches project patterns** (naming, styling, error handling)
4. **Requires minimal human editing** before commit

---

## Next Steps

1. Create the highest-impact skill first (`ipc-handler`)
2. Test on a real feature (e.g., adding system info IPC)
3. Iterate based on friction points
4. Add remaining skills in priority order
