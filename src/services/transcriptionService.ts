/**
 * Transcription service for AudioBash
 * Supports multiple providers: Gemini, OpenAI, Claude, and local Parakeet
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { blobToBase64 } from "../utils/audioUtils";
import { transcriptionLog as log } from "../utils/logger";

/**
 * Error class for transcription-specific errors with context
 */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: string,
    public readonly details?: unknown
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
  cwd: string;                    // Current working directory
  recentOutput: string;           // Last N lines of terminal output
  os: 'windows' | 'linux' | 'mac'; // Operating system
  shell: string;                  // Current shell (powershell, bash, cmd, etc.)
  lastCommand?: string;           // The last command that was run
  lastError?: string;             // Last error message if any
}

// Custom instructions for transcription/agent modes
export interface CustomInstructions {
  rawModeInstructions: string;    // Additional instructions for raw transcription
  agentModeInstructions: string;  // Additional instructions for agent mode
  vocabulary: VocabularyEntry[];  // Custom pronunciations/vocabulary
}

// Vocabulary entry for custom pronunciations
export interface VocabularyEntry {
  spoken: string;    // How the word sounds or might be transcribed
  written: string;   // How it should be written
  context?: string;  // Optional context hint (e.g., "programming", "name")
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
}

export const MODELS: ModelInfo[] = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', description: 'Fast, native audio support', supportsAgent: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', description: 'Latest Gemini with audio', supportsAgent: true },
  { id: 'openai-whisper', name: 'OpenAI Whisper', provider: 'openai', description: 'Whisper transcription only', supportsAgent: false },
  { id: 'openai-gpt4', name: 'Whisper + GPT-4', provider: 'openai', description: 'Whisper → GPT-4 for agent mode', supportsAgent: true },
  { id: 'claude-sonnet', name: 'Whisper + Claude Sonnet', provider: 'anthropic', description: 'Whisper → Claude for agent mode', supportsAgent: true },
  { id: 'claude-haiku', name: 'Whisper + Claude Haiku', provider: 'anthropic', description: 'Whisper → Claude Haiku (faster)', supportsAgent: true },
  { id: 'elevenlabs-scribe', name: 'ElevenLabs Scribe', provider: 'elevenlabs', description: 'High-quality speech-to-text', supportsAgent: false },
  { id: 'parakeet-local', name: 'Parakeet (Local)', provider: 'local', description: 'Free, requires NVIDIA GPU', supportsAgent: false },
  { id: 'whisper-local-tiny', name: 'Whisper Local (Tiny)', provider: 'local', description: '75 MB, fastest, offline', supportsAgent: false },
  { id: 'whisper-local-base', name: 'Whisper Local (Base)', provider: 'local', description: '142 MB, balanced, offline', supportsAgent: false },
  { id: 'whisper-local-small', name: 'Whisper Local (Small)', provider: 'local', description: '466 MB, best accuracy, offline', supportsAgent: false },
];

// Build vocabulary section for prompts
function buildVocabularySection(vocabulary: VocabularyEntry[]): string {
  if (!vocabulary || vocabulary.length === 0) return '';

  const entries = vocabulary.map(v => {
    const contextHint = v.context ? ` (${v.context})` : '';
    return `- "${v.spoken}" → "${v.written}"${contextHint}`;
  }).join('\n');

  return `
CUSTOM VOCABULARY (always use these exact spellings/terms):
${entries}
`;
}

// Generate a context-aware prompt based on terminal state
function buildAgentPrompt(context?: TerminalContext, customInstructions?: CustomInstructions): string {
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
${buildVocabularySection(customInstructions?.vocabulary || [])}${customInstructions?.agentModeInstructions ? `
ADDITIONAL INSTRUCTIONS:
${customInstructions.agentModeInstructions}
` : ''}
Convert the following speech to a ${shell} command:`;
}

// Fallback static prompt for when no context is available
const AGENT_PROMPT = buildAgentPrompt();

export class TranscriptionService {
  private genAI: GoogleGenerativeAI | null = null;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  private apiKeys: Record<string, string> = {
    gemini: '',
    openai: '',
    anthropic: '',
    elevenlabs: '',
  };

  constructor() {}

  public setApiKey(key: string, provider: 'gemini' | 'openai' | 'anthropic' | 'elevenlabs' = 'gemini') {
    this.apiKeys[provider] = key;

    if (provider === 'gemini' && key) {
      this.genAI = new GoogleGenerativeAI(key);
    } else if (provider === 'gemini') {
      this.genAI = null;
    }

    if (provider === 'openai' && key) {
      this.openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    } else if (provider === 'openai') {
      this.openai = null;
    }

    if (provider === 'anthropic' && key) {
      this.anthropic = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    } else if (provider === 'anthropic') {
      this.anthropic = null;
    }
    // ElevenLabs doesn't need a client initialization, we use fetch directly
  }

  public getModelInfo(modelId: ModelId): ModelInfo | undefined {
    return MODELS.find(m => m.id === modelId);
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
    durationMs: number = 0
  ): Promise<TranscribeResult> {
    const modelInfo = this.getModelInfo(modelId);
    if (!modelInfo) {
      log.error(`Unknown model: ${modelId}`, new Error(`Unknown model ID`), { modelId });
      throw new TranscriptionError(`Unknown model: ${modelId}`, 'unknown', 'UNKNOWN_MODEL', { modelId });
    }

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
            'UNSUPPORTED_PROVIDER'
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
    durationMs: number
  ): Promise<TranscribeResult> {
    if (!this.genAI) {
      throw new TranscriptionError(
        "No Gemini API key configured",
        "Gemini",
        "NO_API_KEY"
      );
    }

    try {
      const base64Audio = await blobToBase64(audioBlob);
      log.debug('Audio converted to base64', { sizeBytes: base64Audio.length });

      // Use context-aware prompt for agent mode, include custom instructions
      const vocabularySection = buildVocabularySection(this.customInstructions.vocabulary);
      const rawInstructions = this.customInstructions.rawModeInstructions;

      const prompt = mode === 'agent'
        ? buildAgentPrompt(this.terminalContext || undefined, this.customInstructions)
        : `Transcribe this audio exactly as spoken. If the audio contains only silence or background noise, return an empty string.${vocabularySection}${rawInstructions ? `\n\nADDITIONAL INSTRUCTIONS:\n${rawInstructions}` : ''}`;

      // Map model ID to actual Gemini model name (stable versions only)
      const geminiModel = modelId === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
      const model = this.genAI.getGenerativeModel({ model: geminiModel });

      log.debug('Sending request to Gemini', { model: geminiModel, mode });

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'audio/webm',
            data: base64Audio
          }
        }
      ]);

      const response = await result.response;
      const text = response.text()?.trim() || "";

      // Calculate cost (32 tokens/sec, ~$0.10 per 1M tokens for flash)
      const seconds = durationMs / 1000;
      const tokens = seconds * 32;
      const cost = (tokens / 1000000) * 0.10;

      return { text, cost: `$${cost.toFixed(6)}` };
    } catch (error: any) {
      // Parse Gemini-specific errors
      const message = error?.message || String(error);

      if (message.includes('API key')) {
        throw new TranscriptionError(message, 'Gemini', 'INVALID_API_KEY', error);
      }
      if (message.includes('quota') || message.includes('429')) {
        throw new TranscriptionError(message, 'Gemini', 'RATE_LIMIT', error);
      }
      if (message.includes('network') || message.includes('fetch')) {
        throw new TranscriptionError(message, 'Gemini', 'NETWORK_ERROR', error);
      }
      if (message.includes('500') || message.includes('503')) {
        throw new TranscriptionError(message, 'Gemini', 'SERVER_ERROR', error);
      }

      throw new TranscriptionError(message, 'Gemini', 'UNKNOWN', error);
    }
  }

  private async transcribeWithOpenAI(
    audioBlob: Blob,
    mode: TranscriptionMode,
    modelId: ModelId,
    durationMs: number
  ): Promise<TranscribeResult> {
    if (!this.openai) {
      throw new Error("No OpenAI API key configured.");
    }

    // First, use Whisper for transcription
    const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });

    const transcription = await this.openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });

    let text = transcription.text?.trim() || "";

    // Apply vocabulary corrections to raw transcription
    text = this.applyVocabularyCorrections(text);

    // If agent mode and using GPT-4, process the transcription
    if (mode === 'agent' && modelId === 'openai-gpt4' && text) {
      const contextAwarePrompt = buildAgentPrompt(this.terminalContext || undefined, this.customInstructions);
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: contextAwarePrompt },
          { role: 'user', content: text }
        ],
        max_tokens: 200,
      });
      text = completion.choices[0]?.message?.content?.trim() || text;
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
    durationMs: number
  ): Promise<TranscribeResult> {
    // Claude doesn't support audio directly, so we need OpenAI Whisper for transcription
    if (!this.openai) {
      throw new Error("OpenAI API key required for audio transcription with Claude.");
    }
    if (!this.anthropic) {
      throw new Error("No Anthropic API key configured.");
    }

    // First, use Whisper for transcription
    const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });

    const transcription = await this.openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });

    let text = transcription.text?.trim() || "";

    // Apply vocabulary corrections to raw transcription
    text = this.applyVocabularyCorrections(text);

    // Use Claude for agent mode conversion
    if (mode === 'agent' && text) {
      const claudeModel = modelId === 'claude-haiku'
        ? 'claude-3-haiku-20240307'
        : 'claude-sonnet-4-20250514';

      const contextAwarePrompt = buildAgentPrompt(this.terminalContext || undefined, this.customInstructions);
      const message = await this.anthropic.messages.create({
        model: claudeModel,
        max_tokens: 200,
        messages: [
          { role: 'user', content: `${contextAwarePrompt}\n\n${text}` }
        ],
      });

      const content = message.content[0];
      if (content.type === 'text') {
        text = content.text.trim();
      }
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
    durationMs: number
  ): Promise<TranscribeResult> {
    const apiKey = this.apiKeys.elevenlabs;
    if (!apiKey) {
      throw new Error("No ElevenLabs API key configured.");
    }

    // ElevenLabs Speech-to-Text API
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    formData.append('model_id', 'scribe_v1');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.text?.trim() || "";

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
        body: formData
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
          { status: res.status, response: errorText }
        );
      }

      const data = await res.json();
      if (data.error) {
        throw new TranscriptionError(data.error, 'Parakeet', 'UNKNOWN', data);
      }

      log.debug('Parakeet transcription successful', { textLength: data.text?.length || 0 });
      return { text: data.text || "", cost: "$0.00 (Local)" };
    } catch (e: any) {
      if (e instanceof TranscriptionError) throw e;

      // Check for connection errors
      if (e.message?.includes('fetch') || e.message?.includes('network') || e.name === 'TypeError') {
        log.error('Local Parakeet server not reachable', e);
        throw new TranscriptionError(
          'Local Parakeet server is not running or not reachable',
          'Parakeet',
          'LOCAL_SERVER_UNAVAILABLE',
          e
        );
      }

      throw new TranscriptionError("Local Parakeet error: " + e.message, 'Parakeet', 'UNKNOWN', e);
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
          { modelId }
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
          saveResult
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
      return {
        text: result.text || "",
        cost: "$0.00 (Local)"
      };
    } catch (e: any) {
      if (e instanceof TranscriptionError) throw e;
      throw new TranscriptionError("Local Whisper error: " + e.message, 'Whisper', 'UNKNOWN', e);
    }
  }
}

// Singleton instance
export const transcriptionService = new TranscriptionService();
