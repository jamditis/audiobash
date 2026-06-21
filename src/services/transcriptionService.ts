/**
 * Transcription service for AudioBash
 * Supports multiple providers: Gemini, OpenAI, Claude, and local Parakeet
 */

import { blobToBase64 } from '../utils/audioUtils';
import { transcriptionLog as log } from '../utils/logger';

// Cloud transcription runs in the Electron main process via IPC. The renderer never holds a
// browser SDK client (no `dangerouslyAllowBrowser`) and never sends API keys over the network
// itself — it forwards audio to main, which owns the keys and the provider SDKs.

/**
 * Type guard to check if an unknown error has a message property
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard to check if an unknown error has a name property (for TypeError checks)
 */
function isErrorWithName(error: unknown): error is { name: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string'
  );
}

/**
 * Safely extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return String(error);
}

/**
 * Error class for transcription-specific errors with context
 */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }

  toUserMessage(): string {
    switch (this.code) {
      case 'NO_API_KEY':
        return `No API key configured for ${this.provider}. Please add your API key in Settings.`;
      case 'INVALID_API_KEY':
        return `Invalid ${this.provider} API key. Please check your API key in Settings.`;
      case 'RATE_LIMIT':
        return `${this.provider} rate limit exceeded. Please wait a moment and try again.`;
      case 'QUOTA_EXCEEDED':
        return `${this.provider} quota exceeded. Please check your billing or try a different model.`;
      case 'NETWORK_ERROR':
        return `Network error connecting to ${this.provider}. Please check your internet connection.`;
      case 'SERVER_ERROR':
        return `${this.provider} server error. Please try again in a few moments.`;
      case 'AUDIO_TOO_SHORT':
        return 'Audio recording is too short. Please speak for at least 1 second.';
      case 'AUDIO_TOO_LONG':
        return 'Audio recording is too long. Please keep recordings under 5 minutes.';
      case 'UNSUPPORTED_FORMAT':
        return 'Audio format not supported. Please try again.';
      case 'LOCAL_SERVER_UNAVAILABLE':
        return 'Local transcription server not running. Please start the Parakeet server.';
      default:
        return this.message;
    }
  }
}

export interface TranscribeResult {
  text: string;
  cost: string;
}

export type TranscriptionMode = 'raw' | 'agent';

// Context information for smarter command translation
export interface TerminalContext {
  cwd: string; // Current working directory
  recentOutput: string; // Last N lines of terminal output
  os: 'windows' | 'linux' | 'mac'; // Operating system
  shell: string; // Current shell (powershell, bash, cmd, etc.)
  lastCommand?: string; // The last command that was run
  lastError?: string; // Last error message if any
}

// Custom instructions for transcription/agent modes
export interface CustomInstructions {
  rawModeInstructions: string; // Additional instructions for raw transcription
  agentModeInstructions: string; // Additional instructions for agent mode
  vocabulary: VocabularyEntry[]; // Custom pronunciations/vocabulary
}

// Vocabulary entry for custom pronunciations
export interface VocabularyEntry {
  spoken: string; // How the word sounds or might be transcribed
  written: string; // How it should be written
  context?: string; // Optional context hint (e.g., "programming", "name")
}

// Model identifiers
export type ModelId =
  | 'gemini-2.0-flash'
  | 'gemini-2.5-flash'
  | 'openai-whisper'
  | 'openai-gpt4'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'elevenlabs-scribe'
  | 'elevenlabs-scribe-realtime'
  | 'parakeet-local'
  | 'whisper-local-tiny'
  | 'whisper-local-base'
  | 'whisper-local-small';

export interface ModelInfo {
  id: ModelId;
  name: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'elevenlabs' | 'local';
  description: string;
  supportsAgent: boolean;
  isRealtime?: boolean; // True for streaming models like ElevenLabs real-time
}

export const MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    description: 'Fast, native audio support',
    supportsAgent: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'Latest Gemini with audio',
    supportsAgent: true,
  },
  {
    id: 'elevenlabs-scribe',
    name: 'ElevenLabs Scribe',
    provider: 'elevenlabs',
    description: 'High-quality speech-to-text (batch)',
    supportsAgent: false,
  },
  {
    id: 'elevenlabs-scribe-realtime',
    name: 'ElevenLabs Scribe v2',
    provider: 'elevenlabs',
    description: 'Real-time streaming (~150ms)',
    supportsAgent: false,
    isRealtime: true,
  },
  {
    id: 'parakeet-local',
    name: 'Parakeet (Local)',
    provider: 'local',
    description: 'Free, requires NVIDIA GPU',
    supportsAgent: false,
  },
  {
    id: 'whisper-local-small',
    name: 'Whisper Local',
    provider: 'local',
    description: '466 MB, best accuracy, offline',
    supportsAgent: false,
  },
];

// Build vocabulary section for prompts
function buildVocabularySection(vocabulary: VocabularyEntry[]): string {
  if (!vocabulary || vocabulary.length === 0) return '';

  const entries = vocabulary
    .map((v) => {
      const contextHint = v.context ? ` (${v.context})` : '';
      return `- "${v.spoken}" → "${v.written}"${contextHint}`;
    })
    .join('\n');

  return `
CUSTOM VOCABULARY (always use these exact spellings/terms):
${entries}
`;
}

// Generate a context-aware prompt based on terminal state
function buildAgentPrompt(
  context?: TerminalContext,
  customInstructions?: CustomInstructions,
): string {
  const osName = context?.os === 'windows' ? 'Windows' : context?.os === 'mac' ? 'macOS' : 'Linux';
  const shell = context?.shell || 'unknown shell';
  const cwd = context?.cwd || 'unknown directory';

  // Determine which command style to use
  const isWindows = context?.os === 'windows';
  const isPowerShell = shell.toLowerCase().includes('powershell');

  let osSpecificExamples = '';
  if (isWindows && isPowerShell) {
    osSpecificExamples = `
- "list all files" → Get-ChildItem or dir
- "show hidden files" → Get-ChildItem -Force
- "find files named config" → Get-ChildItem -Recurse -Filter "*config*"
- "what's my current directory" → Get-Location or pwd
- "go to desktop" → Set-Location ~\\Desktop or cd ~\\Desktop
- "show running processes" → Get-Process
- "check disk space" → Get-PSDrive`;
  } else if (isWindows) {
    osSpecificExamples = `
- "list all files" → dir /a
- "what's my current directory" → cd
- "show running processes" → tasklist
- "check disk space" → wmic logicaldisk get size,freespace,caption`;
  } else {
    osSpecificExamples = `
- "list all files" → ls -la
- "show hidden files" → ls -la
- "what's my current directory" → pwd
- "go to desktop" → cd ~/Desktop
- "show running processes" → ps aux
- "check disk space" → df -h`;
  }

  // Build context section if we have terminal context
  let contextSection = '';
  if (context) {
    contextSection = `
CURRENT ENVIRONMENT:
- Operating System: ${osName}
- Shell: ${shell}
- Current Directory: ${cwd}`;

    if (context.lastCommand) {
      contextSection += `\n- Last Command: ${context.lastCommand}`;
    }

    if (context.lastError) {
      contextSection += `\n- Last Error: ${context.lastError}`;
    }

    if (context.recentOutput) {
      // Truncate recent output to last 500 chars to avoid token bloat
      const truncatedOutput = context.recentOutput.slice(-500);
      contextSection += `\n\nRECENT TERMINAL OUTPUT (use this to understand context):
\`\`\`
${truncatedOutput}
\`\`\``;
    }
  }

  return `You are a CLI command translator for ${osName} using ${shell}. Your ONLY job is to convert spoken natural language into executable terminal commands.
${contextSection}

CRITICAL RULES:
1. Output ONLY the raw command - no explanations, no markdown, no backticks, no quotes around the output
2. Use ${osName}/${shell}-appropriate syntax and commands
3. If the user references "this folder" or "here", they mean: ${cwd}
4. If the user says to "fix it" or "try again" or references the last error, consider the recent output/error context
5. If the speech is unclear, silence, or not command-related, output an empty string
6. Relative paths are relative to: ${cwd}

OS-SPECIFIC EXAMPLES for ${osName}/${shell}:${osSpecificExamples}

UNIVERSAL EXAMPLES:
- "git status" → git status
- "run the dev server" → npm run dev
- "install lodash" → npm install lodash
- "run python script called main" → python main.py
- "build the project" → npm run build
- "start docker compose" → docker-compose up
- "hello there" → (empty - not a command)
- (silence) → (empty)
${buildVocabularySection(customInstructions?.vocabulary || [])}${
    customInstructions?.agentModeInstructions
      ? `
ADDITIONAL INSTRUCTIONS:
${customInstructions.agentModeInstructions}
`
      : ''
  }
Convert the following speech to a ${shell} command:`;
}

// Fallback static prompt for when no context is available
const AGENT_PROMPT = buildAgentPrompt();

export class TranscriptionService {
  // Tracks which providers have a key configured (for the model picker and config checks).
  // The actual cloud calls happen in the main process, so the renderer does not construct
  // any provider SDK client. The ElevenLabs key is the one exception held in the renderer
  // because real-time streaming uses a raw WebSocket from the renderer (see getElevenLabsApiKey).
  private apiKeys: Record<string, string> = {
    gemini: '',
    openai: '',
    anthropic: '',
    elevenlabs: '',
  };

  constructor() {}

  public setApiKey(
    key: string,
    provider: 'gemini' | 'openai' | 'anthropic' | 'elevenlabs' = 'gemini',
  ) {
    this.apiKeys[provider] = key;
  }

  /**
   * Map an error string returned by a main-process transcription handler back into a
   * TranscriptionError with a code, so the UI can show a friendly, provider-specific message.
   */
  private mapIpcError(message: string | undefined, provider: string): TranscriptionError {
    const msg = message || 'Transcription failed';
    const m = msg.toLowerCase();
    if (m.includes('no ') && m.includes('api key')) {
      return new TranscriptionError(msg, provider, 'NO_API_KEY');
    }
    if (
      m.includes('rate limit') ||
      m.includes('429') ||
      m.includes('quota') ||
      m.includes('resource_exhausted')
    ) {
      return new TranscriptionError(msg, provider, 'RATE_LIMIT');
    }
    if ((m.includes('invalid') && m.includes('key')) || m.includes('401') || m.includes('403')) {
      return new TranscriptionError(msg, provider, 'INVALID_API_KEY');
    }
    if (
      m.includes('network') ||
      m.includes('fetch') ||
      m.includes('econn') ||
      m.includes('etimedout')
    ) {
      return new TranscriptionError(msg, provider, 'NETWORK_ERROR');
    }
    if (m.includes('500') || m.includes('502') || m.includes('503') || m.includes('server error')) {
      return new TranscriptionError(msg, provider, 'SERVER_ERROR');
    }
    return new TranscriptionError(msg, provider, 'UNKNOWN');
  }

  /**
   * Validate a recorded audio blob before transcription. Guards against empty recordings and
   * oversized payloads (which would be rejected by the main process / provider anyway), and
   * checks the MIME type is an audio container we support.
   */
  private validateAudioBlob(blob: Blob, provider: string): void {
    const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB, matches the main-process limit
    const ALLOWED_PREFIXES = [
      'audio/webm',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/mpeg',
    ];

    if (!blob || blob.size === 0) {
      throw new TranscriptionError('Audio recording is empty', provider, 'AUDIO_TOO_SHORT');
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      throw new TranscriptionError('Audio recording is too large', provider, 'AUDIO_TOO_LONG');
    }
    // MediaRecorder reports types like "audio/webm;codecs=opus"; match on the prefix. Some
    // browsers report an empty type for short blobs, which we allow through to the provider.
    if (blob.type && !ALLOWED_PREFIXES.some((prefix) => blob.type.startsWith(prefix))) {
      throw new TranscriptionError(
        `Unsupported audio format: ${blob.type}`,
        provider,
        'UNSUPPORTED_FORMAT',
      );
    }
  }

  public getModelInfo(modelId: ModelId): ModelInfo | undefined {
    return MODELS.find((m) => m.id === modelId);
  }

  public hasApiKey(provider: 'gemini' | 'openai' | 'anthropic' | 'elevenlabs'): boolean {
    return !!this.apiKeys[provider];
  }

  // Store the current terminal context for use in prompts
  private terminalContext: TerminalContext | null = null;

  // Store custom instructions
  private customInstructions: CustomInstructions = {
    rawModeInstructions: '',
    agentModeInstructions: '',
    vocabulary: [],
  };

  public setTerminalContext(context: TerminalContext) {
    this.terminalContext = context;
  }

  public setCustomInstructions(instructions: CustomInstructions) {
    this.customInstructions = instructions;
  }

  public getCustomInstructions(): CustomInstructions {
    return this.customInstructions;
  }

  public getTerminalContext(): TerminalContext | null {
    return this.terminalContext;
  }

  /**
   * Build keyterms array from vocabulary for ElevenLabs real-time
   * Returns up to 100 terms (ElevenLabs limit)
   */
  public buildKeyterms(): string[] {
    if (!this.customInstructions.vocabulary.length) return [];

    // Extract the written form of each vocabulary entry
    // These are the terms we want ElevenLabs to recognize
    return this.customInstructions.vocabulary
      .slice(0, 100) // ElevenLabs limit
      .map((v) => v.written);
  }

  /**
   * Get ElevenLabs API key
   */
  public getElevenLabsApiKey(): string {
    return this.apiKeys.elevenlabs || '';
  }

  // Apply vocabulary corrections to transcribed text
  private applyVocabularyCorrections(text: string): string {
    if (!this.customInstructions.vocabulary.length) return text;

    let corrected = text;
    for (const entry of this.customInstructions.vocabulary) {
      // Case-insensitive replacement
      const regex = new RegExp(entry.spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      corrected = corrected.replace(regex, entry.written);
    }
    return corrected;
  }

  public async transcribeAudio(
    audioBlob: Blob,
    mode: TranscriptionMode = 'raw',
    modelId: ModelId = 'gemini-2.0-flash',
    durationMs: number = 0,
  ): Promise<TranscribeResult> {
    const modelInfo = this.getModelInfo(modelId);
    if (!modelInfo) {
      log.error(`Unknown model: ${modelId}`, new Error(`Unknown model ID`), { modelId });
      throw new TranscriptionError(`Unknown model: ${modelId}`, 'unknown', 'UNKNOWN_MODEL', {
        modelId,
      });
    }

    // Validate the audio blob before doing any work or sending it across IPC. The main-process
    // handlers re-validate the base64 payload, but checking here gives a faster, friendlier error.
    this.validateAudioBlob(audioBlob, modelInfo.provider);

    log.info('Starting transcription', {
      model: modelId,
      provider: modelInfo.provider,
      mode,
      audioDurationMs: durationMs,
      audioSizeBytes: audioBlob.size,
    });

    // Force raw mode if model doesn't support agent
    if (!modelInfo.supportsAgent && mode === 'agent') {
      log.debug('Model does not support agent mode, falling back to raw', { modelId });
      mode = 'raw';
    }

    const startTime = performance.now();

    try {
      let result: TranscribeResult;

      switch (modelInfo.provider) {
        case 'gemini':
          result = await this.transcribeWithGemini(audioBlob, mode, modelId, durationMs);
          break;
        case 'openai':
          result = await this.transcribeWithOpenAI(audioBlob, mode, modelId, durationMs);
          break;
        case 'anthropic':
          result = await this.transcribeWithClaude(audioBlob, mode, modelId, durationMs);
          break;
        case 'elevenlabs':
          result = await this.transcribeWithElevenLabs(audioBlob, durationMs);
          break;
        case 'local':
          // Check if it's a Whisper local model or Parakeet local
          if (modelId.startsWith('whisper-local-')) {
            result = await this.transcribeLocalWhisper(audioBlob, modelId);
          } else {
            result = await this.transcribeLocal(audioBlob);
          }
          break;
        default:
          throw new TranscriptionError(
            `Unsupported provider: ${modelInfo.provider}`,
            modelInfo.provider,
            'UNSUPPORTED_PROVIDER',
          );
      }

      const elapsed = performance.now() - startTime;
      log.info('Transcription completed', {
        model: modelId,
        mode,
        textLength: result.text.length,
        cost: result.cost,
        elapsedMs: Math.round(elapsed),
      });

      return result;
    } catch (error) {
      const elapsed = performance.now() - startTime;
      log.error('Transcription failed', error, {
        model: modelId,
        mode,
        provider: modelInfo.provider,
        elapsedMs: Math.round(elapsed),
      });
      throw error;
    }
  }

  private async transcribeWithGemini(
    audioBlob: Blob,
    mode: TranscriptionMode,
    modelId: string,
    durationMs: number,
  ): Promise<TranscribeResult> {
    if (!this.hasApiKey('gemini')) {
      throw new TranscriptionError('No Gemini API key configured', 'Gemini', 'NO_API_KEY');
    }

    try {
      const base64Audio = await blobToBase64(audioBlob);
      log.debug('Audio converted to base64', { sizeBytes: base64Audio.length });

      // Use context-aware prompt for agent mode, include custom instructions
      const vocabularySection = buildVocabularySection(this.customInstructions.vocabulary);
      const rawInstructions = this.customInstructions.rawModeInstructions;

      const prompt =
        mode === 'agent'
          ? buildAgentPrompt(this.terminalContext || undefined, this.customInstructions)
          : `Transcribe this audio exactly as spoken. If the audio contains only silence or background noise, return an empty string.${vocabularySection}${rawInstructions ? `\n\nADDITIONAL INSTRUCTIONS:\n${rawInstructions}` : ''}`;

      log.debug('Sending request to Gemini (via main process)', { modelId, mode });

      const result = await window.electron.transcribeWithGemini({
        audioBase64: base64Audio,
        prompt,
        modelId,
      });
      if (!result.success) {
        throw this.mapIpcError(result.error, 'Gemini');
      }

      const text = (result.text || '').trim();

      // Calculate cost (32 tokens/sec, ~$0.10 per 1M tokens for flash)
      const seconds = durationMs / 1000;
      const tokens = seconds * 32;
      const cost = (tokens / 1000000) * 0.1;

      return { text, cost: `$${cost.toFixed(6)}` };
    } catch (error: unknown) {
      if (error instanceof TranscriptionError) throw error;
      throw new TranscriptionError(getErrorMessage(error), 'Gemini', 'UNKNOWN', error);
    }
  }

  private async transcribeWithOpenAI(
    audioBlob: Blob,
    mode: TranscriptionMode,
    modelId: ModelId,
    durationMs: number,
  ): Promise<TranscribeResult> {
    if (!this.hasApiKey('openai')) {
      throw new TranscriptionError('No OpenAI API key configured.', 'OpenAI', 'NO_API_KEY');
    }

    const base64Audio = await blobToBase64(audioBlob);

    // In agent mode with GPT-4, main runs Whisper then GPT-4 with this prompt as the system
    // message. For raw mode (or non-gpt4 models) we send no prompt so main only runs Whisper.
    const prompt =
      mode === 'agent' && modelId === 'openai-gpt4'
        ? buildAgentPrompt(this.terminalContext || undefined, this.customInstructions)
        : '';

    const result = await window.electron.transcribeWithOpenAI({
      audioBase64: base64Audio,
      prompt,
      modelId,
    });
    if (!result.success) {
      throw this.mapIpcError(result.error, 'OpenAI');
    }

    let text = (result.text || '').trim();

    // Apply vocabulary corrections to raw transcriptions. In agent mode the vocabulary is
    // already supplied to the model inside the prompt, so don't double-apply it to a command.
    if (mode !== 'agent') {
      text = this.applyVocabularyCorrections(text);
    }

    // Calculate cost
    // Whisper: $0.006 per minute
    // GPT-4-turbo: ~$0.01 per 1K tokens input, $0.03 per 1K tokens output
    const minutes = durationMs / 60000;
    let cost = minutes * 0.006; // Whisper cost
    if (mode === 'agent' && modelId === 'openai-gpt4') {
      cost += 0.02; // Rough estimate for GPT-4 call
    }

    return { text, cost: `$${cost.toFixed(4)}` };
  }

  private async transcribeWithClaude(
    audioBlob: Blob,
    mode: TranscriptionMode,
    modelId: ModelId,
    durationMs: number,
  ): Promise<TranscribeResult> {
    // Claude doesn't support audio directly, so main uses OpenAI Whisper first, then Claude.
    if (!this.hasApiKey('openai')) {
      throw new TranscriptionError(
        'OpenAI API key required for audio transcription with Claude.',
        'OpenAI',
        'NO_API_KEY',
      );
    }
    if (!this.hasApiKey('anthropic')) {
      throw new TranscriptionError('No Anthropic API key configured.', 'Anthropic', 'NO_API_KEY');
    }

    const base64Audio = await blobToBase64(audioBlob);

    // In agent mode, main passes this prompt to Claude to convert the transcript to a command.
    // For raw mode we send no prompt so main returns the plain Whisper transcript.
    const prompt =
      mode === 'agent'
        ? buildAgentPrompt(this.terminalContext || undefined, this.customInstructions)
        : '';

    const result = await window.electron.transcribeWithAnthropic({
      audioBase64: base64Audio,
      prompt,
      modelId,
    });
    if (!result.success) {
      throw this.mapIpcError(result.error, 'Claude');
    }

    let text = (result.text || '').trim();

    // Apply vocabulary corrections only to raw transcripts; in agent mode the vocabulary is
    // already part of the prompt sent to Claude.
    if (mode !== 'agent') {
      text = this.applyVocabularyCorrections(text);
    }

    // Calculate cost
    const minutes = durationMs / 60000;
    let cost = minutes * 0.006; // Whisper cost
    if (mode === 'agent') {
      // Claude pricing varies by model
      cost += modelId === 'claude-haiku' ? 0.001 : 0.01;
    }

    return { text, cost: `$${cost.toFixed(4)}` };
  }

  private async transcribeWithElevenLabs(
    audioBlob: Blob,
    durationMs: number,
  ): Promise<TranscribeResult> {
    if (!this.hasApiKey('elevenlabs')) {
      throw new TranscriptionError('No ElevenLabs API key configured.', 'ElevenLabs', 'NO_API_KEY');
    }

    const base64Audio = await blobToBase64(audioBlob);
    const result = await window.electron.transcribeWithElevenLabs({ audioBase64: base64Audio });
    if (!result.success) {
      throw this.mapIpcError(result.error, 'ElevenLabs');
    }

    const text = (result.text || '').trim();

    // ElevenLabs Scribe pricing: ~$0.40 per hour = $0.0067 per minute
    const minutes = durationMs / 60000;
    const cost = minutes * 0.0067;

    return { text, cost: `$${cost.toFixed(4)}` };
  }

  private async transcribeLocal(blob: Blob): Promise<TranscribeResult> {
    log.debug('Starting local Parakeet transcription');

    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');

      const res = await fetch('http://localhost:8003/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        log.error('Local Parakeet server error', new Error(errorText), {
          status: res.status,
          response: errorText,
        });
        throw new TranscriptionError(
          `Local server returned ${res.status}: ${errorText}`,
          'Parakeet',
          res.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN',
          { status: res.status, response: errorText },
        );
      }

      const data = await res.json();
      if (data.error) {
        throw new TranscriptionError(data.error, 'Parakeet', 'UNKNOWN', data);
      }

      log.debug('Parakeet transcription successful', { textLength: data.text?.length || 0 });
      // Local models have no prompt-injection path for custom vocabulary, so apply the same
      // post-transcription corrections used by the cloud raw-mode paths (see issue #41).
      const text = this.applyVocabularyCorrections((data.text || '').trim());
      return { text, cost: '$0.00 (Local)' };
    } catch (e: unknown) {
      if (e instanceof TranscriptionError) throw e;

      const message = getErrorMessage(e);
      const name = isErrorWithName(e) ? e.name : '';

      // Check for connection errors
      if (message.includes('fetch') || message.includes('network') || name === 'TypeError') {
        log.error('Local Parakeet server not reachable', e);
        throw new TranscriptionError(
          'Local Parakeet server is not running or not reachable',
          'Parakeet',
          'LOCAL_SERVER_UNAVAILABLE',
          e,
        );
      }

      throw new TranscriptionError('Local Parakeet error: ' + message, 'Parakeet', 'UNKNOWN', e);
    }
  }

  private async transcribeLocalWhisper(blob: Blob, modelId: ModelId): Promise<TranscribeResult> {
    log.debug('Starting local Whisper transcription', { modelId });

    try {
      // Map model ID to Whisper model name
      const modelMap: Record<string, string> = {
        'whisper-local-tiny': 'tiny.en',
        'whisper-local-base': 'base.en',
        'whisper-local-small': 'small.en',
      };

      const whisperModel = modelMap[modelId];
      if (!whisperModel) {
        throw new TranscriptionError(
          `Unknown Whisper model: ${modelId}`,
          'Whisper',
          'UNKNOWN_MODEL',
          { modelId },
        );
      }

      // Set the model via IPC
      log.debug('Setting Whisper model', { whisperModel });
      await window.electron.whisperSetModel(whisperModel);

      // Convert blob to base64
      const base64Audio = await blobToBase64(blob);
      log.debug('Audio converted to base64', { sizeBytes: base64Audio.length });

      // Save audio to temp file via IPC
      const saveResult = await window.electron.saveTempAudio(base64Audio);
      if (!saveResult.success || !saveResult.path) {
        log.error('Failed to save temp audio file', new Error(saveResult.error || 'Unknown error'));
        throw new TranscriptionError(
          saveResult.error || 'Failed to save temp audio file',
          'Whisper',
          'UNKNOWN',
          saveResult,
        );
      }
      log.debug('Audio saved to temp file', { path: saveResult.path });

      // Transcribe via IPC
      const result = await window.electron.whisperTranscribe(saveResult.path);
      if (result.error) {
        log.error('Whisper transcription error', new Error(result.error));
        throw new TranscriptionError(result.error, 'Whisper', 'UNKNOWN', result);
      }

      log.debug('Whisper transcription successful', { textLength: result.text?.length || 0 });
      // whisper.cpp is invoked with no initial prompt, so custom vocabulary can't bias decoding.
      // Apply the post-transcription corrections to match the cloud raw-mode paths (see issue #41).
      const text = this.applyVocabularyCorrections((result.text || '').trim());
      return {
        text,
        cost: '$0.00 (Local)',
      };
    } catch (e: unknown) {
      if (e instanceof TranscriptionError) throw e;
      throw new TranscriptionError(
        'Local Whisper error: ' + getErrorMessage(e),
        'Whisper',
        'UNKNOWN',
        e,
      );
    }
  }
}

// Singleton instance
export const transcriptionService = new TranscriptionService();
