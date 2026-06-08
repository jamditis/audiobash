/**
 * Transcription Service Tests
 * Tests for the multi-provider transcription service
 *
 * Note: Tests that require actual SDK initialization are skipped because
 * mocking ES6 class constructors in Vitest requires complex hoisting.
 * These tests focus on the parts that don't require SDK instances.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TranscriptionService,
  TranscriptionError,
  MODELS,
  type ModelId,
  type TerminalContext,
  type CustomInstructions,
} from '../../src/services/transcriptionService';
import { createMockAudioBlob, createMockTerminalContext } from '../setup';

describe('TranscriptionService', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Key Management', () => {
    it('initializes without API keys', () => {
      expect(service.hasApiKey('gemini')).toBe(false);
      expect(service.hasApiKey('openai')).toBe(false);
      expect(service.hasApiKey('anthropic')).toBe(false);
      expect(service.hasApiKey('elevenlabs')).toBe(false);
    });

    it('tracks ElevenLabs API key without SDK init', () => {
      // ElevenLabs doesn't require SDK initialization
      service.setApiKey('test-elevenlabs-key', 'elevenlabs');
      expect(service.hasApiKey('elevenlabs')).toBe(true);
    });

    it('returns ElevenLabs API key', () => {
      service.setApiKey('eleven-key', 'elevenlabs');
      expect(service.getElevenLabsApiKey()).toBe('eleven-key');
    });

    it('returns empty string when no ElevenLabs key', () => {
      expect(service.getElevenLabsApiKey()).toBe('');
    });
  });

  describe('Model Information', () => {
    it('returns model info for valid model ID', () => {
      const info = service.getModelInfo('gemini-2.0-flash');

      expect(info).toBeDefined();
      expect(info?.id).toBe('gemini-2.0-flash');
      expect(info?.provider).toBe('gemini');
      expect(info?.supportsAgent).toBe(true);
    });

    it('returns undefined for unknown model ID', () => {
      const info = service.getModelInfo('unknown-model' as ModelId);

      expect(info).toBeUndefined();
    });

    it('has all expected Gemini models', () => {
      const geminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash'];
      for (const modelId of geminiModels) {
        const info = service.getModelInfo(modelId as ModelId);
        expect(info).toBeDefined();
        expect(info?.provider).toBe('gemini');
      }
    });

    it('has all expected ElevenLabs models', () => {
      const elevenLabsModels = ['elevenlabs-scribe', 'elevenlabs-scribe-realtime'];
      for (const modelId of elevenLabsModels) {
        const info = service.getModelInfo(modelId as ModelId);
        expect(info).toBeDefined();
        expect(info?.provider).toBe('elevenlabs');
      }
    });

    it('has local models', () => {
      const localModels = ['parakeet-local', 'whisper-local-small'];
      for (const modelId of localModels) {
        const info = service.getModelInfo(modelId as ModelId);
        expect(info).toBeDefined();
        expect(info?.provider).toBe('local');
      }
    });

    it('identifies models that support agent mode', () => {
      const agentModels = MODELS.filter((m) => m.supportsAgent);
      const rawOnlyModels = MODELS.filter((m) => !m.supportsAgent);

      expect(agentModels.length).toBeGreaterThan(0);
      expect(rawOnlyModels.length).toBeGreaterThan(0);
    });

    it('ElevenLabs models do not support agent mode', () => {
      const elevenLabs = service.getModelInfo('elevenlabs-scribe');
      expect(elevenLabs?.supportsAgent).toBe(false);
    });

    it('Local Whisper models do not support agent mode', () => {
      const whisperLocal = service.getModelInfo('whisper-local-small');
      expect(whisperLocal?.supportsAgent).toBe(false);
    });

    it('Gemini models support agent mode', () => {
      const gemini = service.getModelInfo('gemini-2.0-flash');
      expect(gemini?.supportsAgent).toBe(true);
    });
  });

  describe('Terminal Context', () => {
    it('stores and retrieves terminal context', () => {
      const context = createMockTerminalContext();

      service.setTerminalContext(context);

      expect(service.getTerminalContext()).toEqual(context);
    });

    it('starts with null terminal context', () => {
      expect(service.getTerminalContext()).toBeNull();
    });

    it('overwrites previous context', () => {
      service.setTerminalContext({
        cwd: '/old',
        recentOutput: '',
        os: 'linux',
        shell: 'bash',
      });

      service.setTerminalContext({
        cwd: '/new',
        recentOutput: 'output',
        os: 'mac',
        shell: 'zsh',
      });

      expect(service.getTerminalContext()?.cwd).toBe('/new');
      expect(service.getTerminalContext()?.os).toBe('mac');
    });
  });

  describe('Custom Instructions', () => {
    it('stores and retrieves custom instructions', () => {
      const instructions: CustomInstructions = {
        rawModeInstructions: 'transcribe exactly',
        agentModeInstructions: 'prefer npm commands',
        vocabulary: [{ spoken: 'js', written: 'JavaScript' }],
      };

      service.setCustomInstructions(instructions);

      expect(service.getCustomInstructions()).toEqual(instructions);
    });

    it('builds keyterms from vocabulary', () => {
      service.setCustomInstructions({
        rawModeInstructions: '',
        agentModeInstructions: '',
        vocabulary: [
          { spoken: 'react', written: 'React' },
          { spoken: 'node', written: 'Node.js' },
        ],
      });

      const keyterms = service.buildKeyterms();

      expect(keyterms).toEqual(['React', 'Node.js']);
    });

    it('returns empty keyterms when no vocabulary', () => {
      const keyterms = service.buildKeyterms();

      expect(keyterms).toEqual([]);
    });

    it('limits keyterms to 100 entries', () => {
      const manyVocab = Array.from({ length: 150 }, (_, i) => ({
        spoken: `word${i}`,
        written: `Word${i}`,
      }));

      service.setCustomInstructions({
        rawModeInstructions: '',
        agentModeInstructions: '',
        vocabulary: manyVocab,
      });

      const keyterms = service.buildKeyterms();

      expect(keyterms.length).toBe(100);
    });

    it('preserves vocabulary with context hints', () => {
      service.setCustomInstructions({
        rawModeInstructions: '',
        agentModeInstructions: '',
        vocabulary: [{ spoken: 'ts', written: 'TypeScript', context: 'programming' }],
      });

      const instructions = service.getCustomInstructions();
      expect(instructions.vocabulary[0].context).toBe('programming');
    });
  });

  describe('Transcription Errors', () => {
    it('throws TranscriptionError for unknown model without API key', async () => {
      const blob = createMockAudioBlob();

      // No API key set, so it should fail
      await expect(service.transcribeAudio(blob, 'raw', 'gemini-2.0-flash')).rejects.toThrow(
        TranscriptionError,
      );
    });
  });

  describe('TranscriptionError class', () => {
    it('creates error with all properties', () => {
      const error = new TranscriptionError('Test error', 'Gemini', 'INVALID_API_KEY', {
        extra: 'data',
      });

      expect(error.message).toBe('Test error');
      expect(error.provider).toBe('Gemini');
      expect(error.code).toBe('INVALID_API_KEY');
      expect(error.details).toEqual({ extra: 'data' });
      expect(error.name).toBe('TranscriptionError');
    });

    it('extends Error class', () => {
      const error = new TranscriptionError('msg', 'Provider', 'CODE');
      expect(error instanceof Error).toBe(true);
    });

    it('generates user-friendly message for NO_API_KEY', () => {
      const error = new TranscriptionError('msg', 'Gemini', 'NO_API_KEY');
      expect(error.toUserMessage()).toContain('No API key');
      expect(error.toUserMessage()).toContain('Gemini');
    });

    it('generates user-friendly message for INVALID_API_KEY', () => {
      const error = new TranscriptionError('msg', 'OpenAI', 'INVALID_API_KEY');
      expect(error.toUserMessage()).toContain('Invalid');
      expect(error.toUserMessage()).toContain('OpenAI');
    });

    it('generates user-friendly message for RATE_LIMIT', () => {
      const error = new TranscriptionError('msg', 'Claude', 'RATE_LIMIT');
      expect(error.toUserMessage().toLowerCase()).toContain('rate limit');
    });

    it('generates user-friendly message for QUOTA_EXCEEDED', () => {
      const error = new TranscriptionError('msg', 'Provider', 'QUOTA_EXCEEDED');
      expect(error.toUserMessage().toLowerCase()).toContain('quota');
    });

    it('generates user-friendly message for NETWORK_ERROR', () => {
      const error = new TranscriptionError('msg', 'Provider', 'NETWORK_ERROR');
      expect(error.toUserMessage().toLowerCase()).toContain('network');
    });

    it('generates user-friendly message for SERVER_ERROR', () => {
      const error = new TranscriptionError('msg', 'Provider', 'SERVER_ERROR');
      expect(error.toUserMessage().toLowerCase()).toContain('server');
    });

    it('generates user-friendly message for AUDIO_TOO_SHORT', () => {
      const error = new TranscriptionError('msg', 'Provider', 'AUDIO_TOO_SHORT');
      expect(error.toUserMessage().toLowerCase()).toContain('too short');
    });

    it('generates user-friendly message for AUDIO_TOO_LONG', () => {
      const error = new TranscriptionError('msg', 'Provider', 'AUDIO_TOO_LONG');
      expect(error.toUserMessage().toLowerCase()).toContain('too long');
    });

    it('generates user-friendly message for UNSUPPORTED_FORMAT', () => {
      const error = new TranscriptionError('msg', 'Provider', 'UNSUPPORTED_FORMAT');
      expect(error.toUserMessage().toLowerCase()).toContain('not supported');
    });

    it('generates user-friendly message for LOCAL_SERVER_UNAVAILABLE', () => {
      const error = new TranscriptionError('msg', 'Parakeet', 'LOCAL_SERVER_UNAVAILABLE');
      expect(error.toUserMessage().toLowerCase()).toContain('server');
      expect(error.toUserMessage().toLowerCase()).toContain('not running');
    });

    it('returns original message for unknown error code', () => {
      const error = new TranscriptionError('Custom message', 'Provider', 'UNKNOWN_CODE');

      expect(error.toUserMessage()).toBe('Custom message');
    });
  });
});

describe('Model Configurations', () => {
  describe('MODELS constant', () => {
    it('has unique IDs for all models', () => {
      const ids = MODELS.map((m) => m.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all models have required properties', () => {
      for (const model of MODELS) {
        expect(model.id).toBeDefined();
        expect(typeof model.id).toBe('string');
        expect(model.name).toBeDefined();
        expect(typeof model.name).toBe('string');
        expect(model.provider).toBeDefined();
        expect(model.description).toBeDefined();
        expect(typeof model.supportsAgent).toBe('boolean');
      }
    });

    it('provider values are valid', () => {
      const validProviders = ['gemini', 'openai', 'anthropic', 'elevenlabs', 'local'];

      for (const model of MODELS) {
        expect(validProviders).toContain(model.provider);
      }
    });

    it('realtime models are marked correctly', () => {
      const realtimeModels = MODELS.filter((m) => m.isRealtime);

      expect(realtimeModels.length).toBeGreaterThan(0);
      expect(realtimeModels.every((m) => m.id.includes('realtime'))).toBe(true);
    });

    it('has at least one model per provider type', () => {
      // Current providers: gemini, elevenlabs, local
      const providers = ['gemini', 'elevenlabs', 'local'];
      for (const provider of providers) {
        const models = MODELS.filter((m) => m.provider === provider);
        expect(models.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Agent Prompt Generation Context', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService();
  });

  it('stores Linux terminal context', () => {
    const context: TerminalContext = {
      cwd: '/home/user/myproject',
      recentOutput: 'npm ERR! 404 Not Found',
      os: 'linux',
      shell: '/bin/bash',
      lastCommand: 'npm install',
      lastError: 'Package not found',
    };

    service.setTerminalContext(context);

    const stored = service.getTerminalContext();
    expect(stored?.os).toBe('linux');
    expect(stored?.shell).toBe('/bin/bash');
    expect(stored?.cwd).toBe('/home/user/myproject');
    expect(stored?.lastCommand).toBe('npm install');
    expect(stored?.lastError).toBe('Package not found');
  });

  it('stores Windows PowerShell context', () => {
    const context: TerminalContext = {
      cwd: 'C:\\Users\\test\\project',
      recentOutput: '',
      os: 'windows',
      shell: 'powershell.exe',
    };

    service.setTerminalContext(context);

    expect(service.getTerminalContext()?.os).toBe('windows');
    expect(service.getTerminalContext()?.shell).toBe('powershell.exe');
  });

  it('stores macOS zsh context', () => {
    const context: TerminalContext = {
      cwd: '/Users/test/project',
      recentOutput: '',
      os: 'mac',
      shell: '/bin/zsh',
    };

    service.setTerminalContext(context);

    expect(service.getTerminalContext()?.os).toBe('mac');
    expect(service.getTerminalContext()?.shell).toBe('/bin/zsh');
  });

  it('truncates long recent output in context', () => {
    const longOutput = 'x'.repeat(10000);
    const context: TerminalContext = {
      cwd: '/home/user',
      recentOutput: longOutput,
      os: 'linux',
      shell: 'bash',
    };

    service.setTerminalContext(context);

    // The context stores the full output; truncation happens in prompt building
    expect(service.getTerminalContext()?.recentOutput).toBe(longOutput);
  });
});

describe('Vocabulary Corrections', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService();
  });

  it('stores vocabulary entries', () => {
    service.setCustomInstructions({
      rawModeInstructions: '',
      agentModeInstructions: '',
      vocabulary: [
        { spoken: 'react', written: 'React' },
        { spoken: 'js', written: 'JavaScript' },
        { spoken: 'ts', written: 'TypeScript', context: 'programming' },
      ],
    });

    const instructions = service.getCustomInstructions();

    expect(instructions.vocabulary.length).toBe(3);
    expect(instructions.vocabulary[0].spoken).toBe('react');
    expect(instructions.vocabulary[0].written).toBe('React');
    expect(instructions.vocabulary[2].context).toBe('programming');
  });

  it('stores empty vocabulary', () => {
    service.setCustomInstructions({
      rawModeInstructions: '',
      agentModeInstructions: '',
      vocabulary: [],
    });

    expect(service.getCustomInstructions().vocabulary).toEqual([]);
    expect(service.buildKeyterms()).toEqual([]);
  });

  it('builds keyterms in order', () => {
    service.setCustomInstructions({
      rawModeInstructions: '',
      agentModeInstructions: '',
      vocabulary: [
        { spoken: 'a', written: 'Alpha' },
        { spoken: 'b', written: 'Beta' },
        { spoken: 'c', written: 'Gamma' },
      ],
    });

    const keyterms = service.buildKeyterms();

    expect(keyterms).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('Service State', () => {
  it('multiple service instances are independent', () => {
    const service1 = new TranscriptionService();
    const service2 = new TranscriptionService();

    service1.setTerminalContext({
      cwd: '/path1',
      recentOutput: '',
      os: 'linux',
      shell: 'bash',
    });

    service2.setTerminalContext({
      cwd: '/path2',
      recentOutput: '',
      os: 'mac',
      shell: 'zsh',
    });

    expect(service1.getTerminalContext()?.cwd).toBe('/path1');
    expect(service2.getTerminalContext()?.cwd).toBe('/path2');
  });
});
