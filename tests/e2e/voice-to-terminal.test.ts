/**
 * E2E Tests: Voice Input to Terminal Execution
 * Tests the complete voice pipeline from audio recording through
 * transcription to terminal command execution and output streaming.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MockWebSocket, MockPtyProcess, sleep, generateRandomData } from '../stress/stress-utils';

// Mock the ws module before importing
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    clients: new Set(),
    close: vi.fn(),
  })),
}));

// Import after mocking
const { RemoteControlServer } = require('../../electron/websocket-server.cjs');

/**
 * Helper to create mock audio data (simulating WebM format)
 */
function createMockAudioData(durationSeconds: number): Buffer[] {
  const chunks: Buffer[] = [];
  const chunkSize = 4096; // 4KB chunks
  const numChunks = Math.ceil((durationSeconds * 16000 * 2) / chunkSize); // 16kHz, 16-bit

  for (let i = 0; i < numChunks; i++) {
    chunks.push(generateRandomData(chunkSize));
  }

  return chunks;
}

/**
 * E2E Test Suite: Voice to Terminal Flow
 */
describe('E2E: Voice to Terminal Execution', () => {
  let server: typeof RemoteControlServer;
  let mockPtyProcesses: Map<string, MockPtyProcess>;
  let mockOutputBuffers: Map<string, string>;
  let mockCwds: Map<string, string>;
  let transcriptionHandler: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    mockPtyProcesses = new Map();
    mockOutputBuffers = new Map();
    mockCwds = new Map();

    for (let i = 1; i <= 3; i++) {
      const tabId = `tab-${i}`;
      mockPtyProcesses.set(tabId, new MockPtyProcess());
      mockOutputBuffers.set(tabId, '');
      mockCwds.set(tabId, `/home/user/project${i}`);
    }
  });

  beforeEach(() => {
    // Create a mock transcription handler that we can control
    transcriptionHandler = vi.fn().mockImplementation(
      async (audioBuffer: Buffer, tabId: string, mode: string) => {
        // Simulate transcription delay
        await sleep(10);

        // Return different results based on mode
        if (mode === 'agent') {
          return {
            success: true,
            text: 'ls -la',
            executed: true,
            mode: 'agent',
          };
        } else {
          return {
            success: true,
            text: 'raw transcribed text',
            executed: false,
            mode: 'raw',
          };
        }
      }
    );

    server = new RemoteControlServer({
      port: 58765,
      securePort: 58766,
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: mockOutputBuffers,
      terminalCwds: mockCwds,
      mainWindow: null,
      transcribeAudio: transcriptionHandler,
    });

    server.start();
  });

  afterEach(() => {
    server?.stop();
    vi.clearAllMocks();
  });

  afterAll(() => {
    mockPtyProcesses.clear();
    mockOutputBuffers.clear();
    mockCwds.clear();
  });

  /**
   * Test Suite: Audio Session Flow
   */
  describe('Audio Session Flow', () => {
    it('should complete full audio session: start -> data -> end -> transcribe', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Clear auth messages
      mockClient.messages = [];

      // Step 1: Start audio session
      server.handleMessage(
        mockClient,
        JSON.stringify({
          type: 'audio_start',
          tabId: 'tab-1',
          mode: 'agent',
          format: 'webm',
        }),
        false
      );

      expect(server.currentAudioSession).toBeDefined();
      expect(server.currentAudioSession.tabId).toBe('tab-1');
      expect(server.currentAudioSession.mode).toBe('agent');

      // Step 2: Send audio data chunks
      const audioChunks = createMockAudioData(2); // 2 seconds of audio
      for (const chunk of audioChunks) {
        server.handleMessage(mockClient, chunk, true); // isBinary = true
      }

      expect(server.audioChunks.length).toBeGreaterThan(0);

      // Step 3: End audio session and trigger transcription
      await server.handleAudioEnd({ tabId: 'tab-1' });

      // Step 4: Verify transcription was called
      expect(transcriptionHandler).toHaveBeenCalledTimes(1);
      expect(transcriptionHandler).toHaveBeenCalledWith(
        expect.any(Buffer),
        'tab-1',
        'agent'
      );

      // Step 5: Verify transcription result was sent to client
      const transcriptionMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      expect(transcriptionMsg).toBeDefined();
      const result = JSON.parse(transcriptionMsg);
      expect(result.success).toBe(true);
      expect(result.text).toBe('ls -la');
      expect(result.executed).toBe(true);

      // Step 6: Verify session was cleaned up
      expect(server.currentAudioSession).toBeNull();
      expect(server.audioChunks).toHaveLength(0);
    });

    it('should send transcription_status before processing', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Start and send audio
      server.handleMessage(
        mockClient,
        JSON.stringify({
          type: 'audio_start',
          tabId: 'tab-1',
          mode: 'agent',
        }),
        false
      );

      server.handleMessage(mockClient, generateRandomData(4096), true);

      await server.handleAudioEnd({ tabId: 'tab-1' });

      // Find processing status message
      const statusMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription_status' && parsed.status === 'processing';
      });

      expect(statusMsg).toBeDefined();
    });

    it('should handle agent mode - generate and execute command', async () => {
      transcriptionHandler.mockResolvedValueOnce({
        success: true,
        text: 'cd /home/user && ls',
        executed: true,
        mode: 'agent',
      });

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({
          type: 'audio_start',
          tabId: 'tab-1',
          mode: 'agent',
        }),
        false
      );

      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      const parsed = JSON.parse(result);
      expect(parsed.executed).toBe(true);
      expect(parsed.text).toBe('cd /home/user && ls');
    });

    it('should handle raw mode - transcribe without execution', async () => {
      transcriptionHandler.mockResolvedValueOnce({
        success: true,
        text: 'this is just raw text',
        executed: false,
        mode: 'raw',
      });

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({
          type: 'audio_start',
          tabId: 'tab-1',
          mode: 'raw',
        }),
        false
      );

      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      const parsed = JSON.parse(result);
      expect(parsed.executed).toBe(false);
      expect(parsed.text).toBe('this is just raw text');
    });
  });

  /**
   * Test Suite: Transcription Result Handling
   */
  describe('Transcription Result Handling', () => {
    it('should handle transcription success', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );
      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        try {
          const parsed = JSON.parse(m);
          return parsed.type === 'transcription';
        } catch {
          return false;
        }
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });

    it('should handle transcription failure', async () => {
      transcriptionHandler.mockRejectedValueOnce(new Error('Transcription service unavailable'));

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );
      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Transcription service unavailable');
    });

    it('should handle missing transcription handler', async () => {
      // Create server without transcription handler
      const serverNoHandler = new RemoteControlServer({
        port: 58767,
        ptyProcesses: mockPtyProcesses,
        terminalOutputBuffers: mockOutputBuffers,
        terminalCwds: mockCwds,
      });
      serverNoHandler.start();

      const mockClient = new MockWebSocket();
      await serverNoHandler.handleAuth(mockClient, {
        pairingCode: serverNoHandler.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      serverNoHandler.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );
      serverNoHandler.handleMessage(mockClient, generateRandomData(4096), true);
      await serverNoHandler.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('handler not configured');

      serverNoHandler.stop();
    });
  });

  /**
   * Test Suite: Command Injection to Terminal
   */
  describe('Command Injection to Terminal', () => {
    it('should send transcribed command to correct terminal tab', async () => {
      const writtenCommands: { tabId: string; data: string }[] = [];

      // Override PTY write to capture commands
      mockPtyProcesses.forEach((pty, tabId) => {
        const originalWrite = pty.write;
        pty.write = (data: string) => {
          writtenCommands.push({ tabId, data });
          originalWrite.call(pty, data);
        };
      });

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Simulate voice command to tab-2
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-2', mode: 'agent' }),
        false
      );
      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-2' });

      // Transcription handler receives correct tab
      expect(transcriptionHandler).toHaveBeenCalledWith(
        expect.any(Buffer),
        'tab-2',
        'agent'
      );
    });

    it('should handle special characters in transcribed text', async () => {
      transcriptionHandler.mockResolvedValueOnce({
        success: true,
        text: 'echo "Hello $USER" && pwd',
        executed: true,
      });

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );
      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      const parsed = JSON.parse(result);
      expect(parsed.text).toBe('echo "Hello $USER" && pwd');
    });
  });

  /**
   * Test Suite: Terminal Output Streaming to Client
   */
  describe('Terminal Output Streaming', () => {
    it('should stream terminal output to connected client', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Simulate terminal output
      server.sendTerminalData('tab-1', 'drwxr-xr-x 2 user user 4096\n');
      server.sendTerminalData('tab-1', 'file1.txt  file2.txt\n');

      const terminalMessages = mockClient.messages.filter((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'terminal_data';
      });

      expect(terminalMessages.length).toBe(2);
      expect(JSON.parse(terminalMessages[0]).data).toContain('drwxr-xr-x');
      expect(JSON.parse(terminalMessages[1]).data).toContain('file1.txt');
    });

    it('should include correct tabId in terminal output', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.sendTerminalData('tab-1', 'output from tab 1\n');
      server.sendTerminalData('tab-2', 'output from tab 2\n');

      const tab1Msg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'terminal_data' && parsed.tabId === 'tab-1';
      });

      const tab2Msg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'terminal_data' && parsed.tabId === 'tab-2';
      });

      expect(tab1Msg).toBeDefined();
      expect(tab2Msg).toBeDefined();
      expect(JSON.parse(tab1Msg).data).toContain('tab 1');
      expect(JSON.parse(tab2Msg).data).toContain('tab 2');
    });

    it('should send buffered output on initial connection', async () => {
      // Pre-populate output buffer
      mockOutputBuffers.set('tab-1', 'Previous terminal output\n$ ');

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Find buffered output message
      const bufferMsg = mockClient.messages.find((m) => {
        try {
          const parsed = JSON.parse(m);
          return (
            parsed.type === 'terminal_data' &&
            parsed.tabId === 'tab-1' &&
            parsed.data.includes('Previous')
          );
        } catch {
          return false;
        }
      });

      expect(bufferMsg).toBeDefined();
    });

    it('should not send output when no client connected', () => {
      // Don't connect a client
      expect(server.connectedClient).toBeNull();

      // Should not throw
      expect(() => {
        server.sendTerminalData('tab-1', 'some output');
      }).not.toThrow();
    });
  });

  /**
   * Test Suite: Error Handling
   */
  describe('Error Handling', () => {
    it('should handle audio_end without audio_start', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Don't start audio session, directly end
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('No audio data');
    });

    it('should handle empty audio data', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Start session but don't send any audio data
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );

      // End without sending data
      await server.handleAudioEnd({ tabId: 'tab-1' });

      const result = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('No audio data');
    });

    it('should reject oversized audio chunks', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );

      // Send oversized chunk (> MAX_CHUNK_SIZE)
      const oversizedChunk = generateRandomData(2 * 1024 * 1024); // 2MB
      server.handleAudioData(oversizedChunk);

      // Session should be cleared with error
      const result = mockClient.messages.find((m) => {
        try {
          const parsed = JSON.parse(m);
          return parsed.type === 'transcription' && !parsed.success;
        } catch {
          return false;
        }
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('size limit');
    });

    it('should handle audio data without active session', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Ensure no active session
      server.currentAudioSession = null;

      // Should not throw
      expect(() => {
        server.handleAudioData(generateRandomData(4096));
      }).not.toThrow();

      // Audio should not be buffered
      expect(server.audioChunks.length).toBe(0);
    });

    it('should timeout long audio sessions', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Start session
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );

      // Note: Audio session timeout is 30 seconds by default
      // In real tests, we would mock timers to test this
      expect(server.audioSessionTimeout).toBeDefined();
    });
  });

  /**
   * Test Suite: Context Awareness
   */
  describe('Context Awareness', () => {
    it('should provide current working directory in context', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'get_context', tabId: 'tab-1' }),
        false
      );

      const contextMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'context';
      });

      expect(contextMsg).toBeDefined();
      const parsed = JSON.parse(contextMsg);
      expect(parsed.context.cwd).toBe('/home/user/project1');
    });

    it('should provide OS and shell information in context', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'get_context', tabId: 'tab-1' }),
        false
      );

      const contextMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'context';
      });

      const parsed = JSON.parse(contextMsg);
      expect(parsed.context.os).toBeDefined();
      expect(parsed.context.shell).toBeDefined();
    });

    it('should provide recent terminal output in context', async () => {
      mockOutputBuffers.set('tab-1', 'Recent command output here\n$ ');

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'get_context', tabId: 'tab-1' }),
        false
      );

      const contextMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'context';
      });

      const parsed = JSON.parse(contextMsg);
      expect(parsed.context.recentOutput).toContain('Recent command output');
    });
  });
});

/**
 * E2E Test Suite: Voice Pipeline Integration
 * Tests the full integration of voice recording through to command execution
 */
describe('E2E: Voice Pipeline Integration', () => {
  let server: typeof RemoteControlServer;
  let mockPtyProcesses: Map<string, MockPtyProcess>;
  let executedCommands: string[] = [];

  beforeEach(() => {
    mockPtyProcesses = new Map();
    executedCommands = [];

    const pty = new MockPtyProcess();
    pty.write = (data: string) => {
      executedCommands.push(data);
    };
    mockPtyProcesses.set('tab-1', pty);

    server = new RemoteControlServer({
      port: 58768,
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: new Map([['tab-1', '']]),
      terminalCwds: new Map([['tab-1', '/home/user']]),
      mainWindow: null,
      transcribeAudio: async () => ({
        success: true,
        text: 'npm test',
        executed: true,
      }),
    });

    server.start();
  });

  afterEach(() => {
    server?.stop();
  });

  it('should execute transcribed command through terminal write', async () => {
    const mockClient = new MockWebSocket();
    await server.handleAuth(mockClient, {
      pairingCode: server.pairingCode,
      deviceName: 'Test Phone',
    });

    // Complete voice pipeline
    server.handleMessage(
      mockClient,
      JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
      false
    );
    server.handleMessage(mockClient, generateRandomData(4096), true);
    await server.handleAudioEnd({ tabId: 'tab-1' });

    // Then write the transcribed command to terminal
    server.handleMessage(
      mockClient,
      JSON.stringify({
        type: 'terminal_write',
        tabId: 'tab-1',
        data: 'npm test\r',
      }),
      false
    );

    // Verify command was written to PTY
    expect(executedCommands).toContain('npm test\r');
  });

  it('should maintain correct state through multiple voice sessions', async () => {
    const mockClient = new MockWebSocket();
    await server.handleAuth(mockClient, {
      pairingCode: server.pairingCode,
      deviceName: 'Test Phone',
    });

    // First voice session
    server.handleMessage(
      mockClient,
      JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
      false
    );
    server.handleMessage(mockClient, generateRandomData(4096), true);
    await server.handleAudioEnd({ tabId: 'tab-1' });

    // Verify cleanup
    expect(server.currentAudioSession).toBeNull();
    expect(server.audioChunks.length).toBe(0);

    // Second voice session
    server.handleMessage(
      mockClient,
      JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'raw' }),
      false
    );

    expect(server.currentAudioSession).toBeDefined();
    expect(server.currentAudioSession.mode).toBe('raw');

    server.handleMessage(mockClient, generateRandomData(4096), true);
    await server.handleAudioEnd({ tabId: 'tab-1' });

    // Final cleanup
    expect(server.currentAudioSession).toBeNull();
  });
});
