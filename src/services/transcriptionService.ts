/**
 * Transcription service for AudioBash
 * Supports multiple providers: Gemini, OpenAI, Claude, and local Parakeet
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { blobToBase64 } from "../utils/audioUtils";

export interface TranscribeResult {
  text: string;
  cost: string;
}

export type TranscriptionMode = 'raw' | 'agent';

// Model identifiers
export type ModelId =
  | 'gemini-2.0-flash'
  | 'gemini-2.5-flash'
  | 'openai-whisper'
  | 'openai-gpt4'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'elevenlabs-scribe'
  | 'parakeet-local';

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
];

const AGENT_PROMPT = `You are a CLI command translator. Your ONLY job is to convert spoken natural language into executable terminal/command prompt commands.

CRITICAL RULES:
1. Output ONLY the raw command - no explanations, no markdown, no backticks, no quotes around the output
2. Convert natural speech into the appropriate CLI command
3. If the speech is unclear, silence, or not command-related, output an empty string

EXAMPLES:
- "git status" → git status
- "show me the git status" → git status
- "list all files" → ls -la
- "list files in the current directory" → dir
- "make a new folder called test" → mkdir test
- "run the dev server" → npm run dev
- "install lodash" → npm install lodash
- "show running processes" → ps aux
- "what's my current directory" → pwd
- "go to the desktop folder" → cd ~/Desktop
- "run python script called main" → python main.py
- "build the project" → npm run build
- "start docker compose" → docker-compose up
- "check disk space" → df -h
- "hello there" → (empty - not a command)
- (silence) → (empty)

Convert the following transcription to a CLI command:`;

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

  public async transcribeAudio(
    audioBlob: Blob,
    mode: TranscriptionMode = 'raw',
    modelId: ModelId = 'gemini-2.0-flash',
    durationMs: number = 0
  ): Promise<TranscribeResult> {
    const modelInfo = this.getModelInfo(modelId);
    if (!modelInfo) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    // Force raw mode if model doesn't support agent
    if (!modelInfo.supportsAgent && mode === 'agent') {
      mode = 'raw';
    }

    switch (modelInfo.provider) {
      case 'gemini':
        return this.transcribeWithGemini(audioBlob, mode, modelId, durationMs);
      case 'openai':
        return this.transcribeWithOpenAI(audioBlob, mode, modelId, durationMs);
      case 'anthropic':
        return this.transcribeWithClaude(audioBlob, mode, modelId, durationMs);
      case 'elevenlabs':
        return this.transcribeWithElevenLabs(audioBlob, durationMs);
      case 'local':
        return this.transcribeLocal(audioBlob);
      default:
        throw new Error(`Unsupported provider: ${modelInfo.provider}`);
    }
  }

  private async transcribeWithGemini(
    audioBlob: Blob,
    mode: TranscriptionMode,
    modelId: string,
    durationMs: number
  ): Promise<TranscribeResult> {
    if (!this.genAI) {
      throw new Error("No Gemini API key configured.");
    }

    const base64Audio = await blobToBase64(audioBlob);
    const prompt = mode === 'agent'
      ? `${AGENT_PROMPT}`
      : `Transcribe this audio exactly as spoken. If the audio contains only silence or background noise, return an empty string.`;

    // Map model ID to actual Gemini model name (stable versions only)
    const geminiModel = modelId === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
    const model = this.genAI.getGenerativeModel({ model: geminiModel });

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

    // If agent mode and using GPT-4, process the transcription
    if (mode === 'agent' && modelId === 'openai-gpt4' && text) {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: AGENT_PROMPT },
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

    // Use Claude for agent mode conversion
    if (mode === 'agent' && text) {
      const claudeModel = modelId === 'claude-haiku'
        ? 'claude-3-haiku-20240307'
        : 'claude-sonnet-4-20250514';

      const message = await this.anthropic.messages.create({
        model: claudeModel,
        max_tokens: 200,
        messages: [
          { role: 'user', content: `${AGENT_PROMPT}\n\n${text}` }
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
    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');

      const res = await fetch('http://localhost:8003/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Local server returned ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return { text: data.text || "", cost: "$0.00 (Local)" };
    } catch (e: any) {
      throw new Error("Local Parakeet error: " + e.message);
    }
  }
}

// Singleton instance
export const transcriptionService = new TranscriptionService();
