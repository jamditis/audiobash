/**
 * E2E Tests: Multi-Tab Terminal Management
 * Tests remote control of multiple terminal tabs including creation,
 * switching, command routing, and output isolation.
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
 * Extended MockPtyProcess for multi-tab testing
 */
class ExtendedMockPtyProcess extends MockPtyProcess {
  tabId: string;
  outputHistory: string[] = [];

  constructor(tabId: string) {
    super();
    this.tabId = tabId;
  }

  write(data: string): void {
    super.write(data);
    this.outputHistory.push(data);
  }

  getLastCommand(): string | undefined {
    return this.outputHistory[this.outputHistory.length - 1];
  }

  clearHistory(): void {
    this.outputHistory = [];
  }
}

/**
 * E2E Test Suite: Multi-Tab Terminal Management
 */
describe('E2E: Multi-Tab Terminal Management', () => {
  let server: typeof RemoteControlServer;
  let mockPtyProcesses: Map<string, ExtendedMockPtyProcess>;
  let mockOutputBuffers: Map<string, string>;
  let mockCwds: Map<string, string>;
  let mockMainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };

  const createTab = (tabId: string, cwd: string = '/home/user') => {
    const pty = new ExtendedMockPtyProcess(tabId);
    mockPtyProcesses.set(tabId, pty);
    mockOutputBuffers.set(tabId, `Welcome to ${tabId}\n$ `);
    mockCwds.set(tabId, cwd);
    return pty;
  };

  beforeAll(() => {
    mockPtyProcesses = new Map();
    mockOutputBuffers = new Map();
    mockCwds = new Map();
  });

  beforeEach(async () => {
    // Clear all existing tabs
    mockPtyProcesses.clear();
    mockOutputBuffers.clear();
    mockCwds.clear();

    // Create default tabs
    createTab('tab-1', '/home/user/project-alpha');
    createTab('tab-2', '/home/user/project-beta');
    createTab('tab-3', '/var/log');

    // Mock main window for tab switch notifications
    mockMainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
      },
    };

    server = new RemoteControlServer({
      port: 48765,
      securePort: 48766,
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: mockOutputBuffers,
      terminalCwds: mockCwds,
      mainWindow: mockMainWindow as unknown as Electron.BrowserWindow,
      transcribeAudio: async (buffer: Buffer, tabId: string) => ({
        success: true,
        text: `command for ${tabId}`,
        executed: true,
      }),
    });

    await server.start();
  });

  afterEach(() => {
    server?.stop();
    mockPtyProcesses.forEach((pty) => pty.clearHistory());
  });

  afterAll(() => {
    mockPtyProcesses.clear();
    mockOutputBuffers.clear();
    mockCwds.clear();
  });

  /**
   * Test Suite: Tab Listing
   */
  describe('Tab Listing', () => {
    it('should return all active tabs on connection', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      const authResponse = JSON.parse(mockClient.messages[0]);
      expect(authResponse.desktopInfo.tabs).toHaveLength(3);
      expect(authResponse.desktopInfo.tabs.map((t: { id: string }) => t.id)).toEqual([
        'tab-1',
        'tab-2',
        'tab-3',
      ]);
    });

    it('should return tabs with titles', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      const authResponse = JSON.parse(mockClient.messages[0]);
      for (const tab of authResponse.desktopInfo.tabs) {
        expect(tab.title).toBeDefined();
        expect(tab.title.length).toBeGreaterThan(0);
      }
    });

    it('should handle get_tabs request', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'get_tabs' }),
        false
      );

      const tabsMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'tabs';
      });

      expect(tabsMsg).toBeDefined();
      const parsed = JSON.parse(tabsMsg);
      expect(parsed.tabs).toHaveLength(3);
    });

    it('should return empty tabs list when no terminals exist', async () => {
      mockPtyProcesses.clear();

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      const authResponse = JSON.parse(mockClient.messages[0]);
      expect(authResponse.desktopInfo.tabs).toHaveLength(0);
    });
  });

  /**
   * Test Suite: Tab Switching
   */
  describe('Tab Switching', () => {
    it('should notify main window on tab switch request', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'switch_tab', tabId: 'tab-2' }),
        false
      );

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'remote-switch-tab',
        'tab-2'
      );
    });

    it('should handle switching to all available tabs', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Clear the mock to ignore calls from auth/status updates
      mockMainWindow.webContents.send.mockClear();

      for (const tabId of ['tab-1', 'tab-2', 'tab-3']) {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'switch_tab', tabId }),
          false
        );
      }

      // Verify only the tab switch calls (ignore status updates)
      const tabSwitchCalls = mockMainWindow.webContents.send.mock.calls.filter(
        (call: unknown[]) => call[0] === 'remote-switch-tab'
      );

      expect(tabSwitchCalls).toHaveLength(3);
      expect(tabSwitchCalls[0]).toEqual(['remote-switch-tab', 'tab-1']);
      expect(tabSwitchCalls[1]).toEqual(['remote-switch-tab', 'tab-2']);
      expect(tabSwitchCalls[2]).toEqual(['remote-switch-tab', 'tab-3']);
    });

    it('should handle switch to non-existent tab gracefully', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Should not throw
      expect(() => {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'switch_tab', tabId: 'non-existent-tab' }),
          false
        );
      }).not.toThrow();

      // Should still send the switch request to main window
      // (main window will handle the non-existent tab)
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'remote-switch-tab',
        'non-existent-tab'
      );
    });

    it('should handle switch without main window', async () => {
      // Create server without main window
      const serverNoWindow = new RemoteControlServer({
        port: 48767,
        ptyProcesses: mockPtyProcesses,
        terminalOutputBuffers: mockOutputBuffers,
        terminalCwds: mockCwds,
        mainWindow: null,
      });
      serverNoWindow.start();

      const mockClient = new MockWebSocket();
      await serverNoWindow.handleAuth(mockClient, {
        pairingCode: serverNoWindow.pairingCode,
        deviceName: 'Test Phone',
      });

      // Should not throw
      expect(() => {
        serverNoWindow.handleMessage(
          mockClient,
          JSON.stringify({ type: 'switch_tab', tabId: 'tab-1' }),
          false
        );
      }).not.toThrow();

      serverNoWindow.stop();
    });
  });

  /**
   * Test Suite: Sending Commands to Specific Tabs
   */
  describe('Sending Commands to Specific Tabs', () => {
    it('should route command to correct tab', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Send commands to different tabs
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'terminal_write', tabId: 'tab-1', data: 'cmd1\r' }),
        false
      );

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'terminal_write', tabId: 'tab-2', data: 'cmd2\r' }),
        false
      );

      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'terminal_write', tabId: 'tab-3', data: 'cmd3\r' }),
        false
      );

      // Verify each tab received its specific command
      expect(mockPtyProcesses.get('tab-1')?.getLastCommand()).toBe('cmd1\r');
      expect(mockPtyProcesses.get('tab-2')?.getLastCommand()).toBe('cmd2\r');
      expect(mockPtyProcesses.get('tab-3')?.getLastCommand()).toBe('cmd3\r');
    });

    it('should not route command to other tabs', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Clear all histories
      mockPtyProcesses.forEach((pty) => pty.clearHistory());

      // Send command only to tab-1
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'terminal_write', tabId: 'tab-1', data: 'only-for-tab-1\r' }),
        false
      );

      // tab-1 should have the command
      expect(mockPtyProcesses.get('tab-1')?.outputHistory.length).toBe(1);

      // Other tabs should have no commands
      expect(mockPtyProcesses.get('tab-2')?.outputHistory.length).toBe(0);
      expect(mockPtyProcesses.get('tab-3')?.outputHistory.length).toBe(0);
    });

    it('should handle command to non-existent tab', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Should not throw
      expect(() => {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'terminal_write', tabId: 'non-existent', data: 'cmd\r' }),
          false
        );
      }).not.toThrow();

      // Should send error to client
      const errorMsg = mockClient.messages.find((m) => {
        try {
          const parsed = JSON.parse(m);
          return parsed.type === 'error';
        } catch {
          return false;
        }
      });

      expect(errorMsg).toBeDefined();
    });

    it('should handle command with missing tabId', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Should not throw
      expect(() => {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'terminal_write', data: 'cmd\r' }),
          false
        );
      }).not.toThrow();
    });

    it('should handle command with null/undefined data', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      expect(() => {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'terminal_write', tabId: 'tab-1', data: null }),
          false
        );
      }).not.toThrow();

      expect(() => {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'terminal_write', tabId: 'tab-1' }),
          false
        );
      }).not.toThrow();
    });
  });

  /**
   * Test Suite: Output Isolation Between Tabs
   */
  describe('Output Isolation Between Tabs', () => {
    it('should send output with correct tabId', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Simulate output from each tab
      server.sendTerminalData('tab-1', 'output from alpha\n');
      server.sendTerminalData('tab-2', 'output from beta\n');
      server.sendTerminalData('tab-3', 'output from logs\n');

      const messages = mockClient.messages.map((m) => JSON.parse(m));

      const tab1Output = messages.find(
        (m) => m.type === 'terminal_data' && m.tabId === 'tab-1'
      );
      const tab2Output = messages.find(
        (m) => m.type === 'terminal_data' && m.tabId === 'tab-2'
      );
      const tab3Output = messages.find(
        (m) => m.type === 'terminal_data' && m.tabId === 'tab-3'
      );

      expect(tab1Output?.data).toContain('alpha');
      expect(tab2Output?.data).toContain('beta');
      expect(tab3Output?.data).toContain('logs');
    });

    it('should maintain separate output streams per tab', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Interleave output from multiple tabs
      server.sendTerminalData('tab-1', 'A1');
      server.sendTerminalData('tab-2', 'B1');
      server.sendTerminalData('tab-1', 'A2');
      server.sendTerminalData('tab-3', 'C1');
      server.sendTerminalData('tab-2', 'B2');
      server.sendTerminalData('tab-1', 'A3');

      const messages = mockClient.messages.map((m) => JSON.parse(m));

      // Group by tabId
      const tab1Messages = messages.filter(
        (m) => m.type === 'terminal_data' && m.tabId === 'tab-1'
      );
      const tab2Messages = messages.filter(
        (m) => m.type === 'terminal_data' && m.tabId === 'tab-2'
      );
      const tab3Messages = messages.filter(
        (m) => m.type === 'terminal_data' && m.tabId === 'tab-3'
      );

      expect(tab1Messages).toHaveLength(3);
      expect(tab2Messages).toHaveLength(2);
      expect(tab3Messages).toHaveLength(1);

      expect(tab1Messages.map((m) => m.data)).toEqual(['A1', 'A2', 'A3']);
      expect(tab2Messages.map((m) => m.data)).toEqual(['B1', 'B2']);
      expect(tab3Messages.map((m) => m.data)).toEqual(['C1']);
    });

    it('should include buffered output per tab on connect', async () => {
      // Set distinct buffers per tab
      mockOutputBuffers.set('tab-1', 'Buffer content for tab 1\n$ ');
      mockOutputBuffers.set('tab-2', 'Buffer content for tab 2\n$ ');
      mockOutputBuffers.set('tab-3', 'Buffer content for tab 3\n$ ');

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Check that each tab's buffer was sent
      const messages = mockClient.messages.map((m) => JSON.parse(m));
      const terminalDataMsgs = messages.filter((m) => m.type === 'terminal_data');

      expect(terminalDataMsgs.length).toBeGreaterThanOrEqual(3);

      // Verify each tab's buffer
      for (const tabId of ['tab-1', 'tab-2', 'tab-3']) {
        const tabBuffer = terminalDataMsgs.find(
          (m) => m.tabId === tabId && m.data.includes(`for ${tabId.replace('-', ' ')}`)
        );
        expect(tabBuffer).toBeDefined();
      }
    });
  });

  /**
   * Test Suite: Context Per Tab
   */
  describe('Context Per Tab', () => {
    it('should return correct CWD for each tab', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      for (const [tabId, expectedCwd] of [
        ['tab-1', '/home/user/project-alpha'],
        ['tab-2', '/home/user/project-beta'],
        ['tab-3', '/var/log'],
      ]) {
        mockClient.messages = [];

        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'get_context', tabId }),
          false
        );

        const contextMsg = mockClient.messages.find((m) => {
          const parsed = JSON.parse(m);
          return parsed.type === 'context';
        });

        const context = JSON.parse(contextMsg);
        expect(context.context.cwd).toBe(expectedCwd);
      }
    });

    it('should return recent output specific to each tab', async () => {
      mockOutputBuffers.set('tab-1', 'alpha specific output\n');
      mockOutputBuffers.set('tab-2', 'beta specific output\n');
      mockOutputBuffers.set('tab-3', 'logs specific output\n');

      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      for (const [tabId, expectedContent] of [
        ['tab-1', 'alpha'],
        ['tab-2', 'beta'],
        ['tab-3', 'logs'],
      ]) {
        mockClient.messages = [];

        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'get_context', tabId }),
          false
        );

        const contextMsg = mockClient.messages.find((m) => {
          const parsed = JSON.parse(m);
          return parsed.type === 'context';
        });

        const context = JSON.parse(contextMsg);
        expect(context.context.recentOutput).toContain(expectedContent);
      }
    });
  });

  /**
   * Test Suite: Dynamic Tab Updates
   */
  describe('Dynamic Tab Updates', () => {
    it('should notify client when tabs are updated', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Add a new tab
      createTab('tab-4', '/tmp');

      // Notify about tab update
      server.sendTabsUpdate();

      const tabsUpdateMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'tabs_update';
      });

      expect(tabsUpdateMsg).toBeDefined();
      const update = JSON.parse(tabsUpdateMsg);
      expect(update.tabs).toHaveLength(4);
      expect(update.tabs.map((t: { id: string }) => t.id)).toContain('tab-4');
    });

    it('should handle tab removal correctly', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Remove a tab
      mockPtyProcesses.delete('tab-2');
      mockOutputBuffers.delete('tab-2');
      mockCwds.delete('tab-2');

      mockClient.messages = [];

      // Notify about tab update
      server.sendTabsUpdate();

      const tabsUpdateMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'tabs_update';
      });

      const update = JSON.parse(tabsUpdateMsg);
      expect(update.tabs).toHaveLength(2);
      expect(update.tabs.map((t: { id: string }) => t.id)).not.toContain('tab-2');
    });

    it('should reflect tabs accurately in get_tabs after changes', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Initial state
      mockClient.messages = [];
      server.handleMessage(mockClient, JSON.stringify({ type: 'get_tabs' }), false);
      let tabsMsg = JSON.parse(
        mockClient.messages.find((m) => JSON.parse(m).type === 'tabs')!
      );
      expect(tabsMsg.tabs).toHaveLength(3);

      // Add tabs
      createTab('tab-4', '/tmp');
      createTab('tab-5', '/opt');

      mockClient.messages = [];
      server.handleMessage(mockClient, JSON.stringify({ type: 'get_tabs' }), false);
      tabsMsg = JSON.parse(
        mockClient.messages.find((m) => JSON.parse(m).type === 'tabs')!
      );
      expect(tabsMsg.tabs).toHaveLength(5);

      // Remove a tab
      mockPtyProcesses.delete('tab-3');

      mockClient.messages = [];
      server.handleMessage(mockClient, JSON.stringify({ type: 'get_tabs' }), false);
      tabsMsg = JSON.parse(
        mockClient.messages.find((m) => JSON.parse(m).type === 'tabs')!
      );
      expect(tabsMsg.tabs).toHaveLength(4);
      expect(tabsMsg.tabs.map((t: { id: string }) => t.id)).not.toContain('tab-3');
    });
  });

  /**
   * Test Suite: Voice Commands Per Tab
   */
  describe('Voice Commands Per Tab', () => {
    it('should route voice transcription to correct tab', async () => {
      const transcribedTabs: string[] = [];

      const serverWithTracking = new RemoteControlServer({
        port: 48768,
        ptyProcesses: mockPtyProcesses,
        terminalOutputBuffers: mockOutputBuffers,
        terminalCwds: mockCwds,
        mainWindow: null,
        transcribeAudio: async (buffer: Buffer, tabId: string) => {
          transcribedTabs.push(tabId);
          return { success: true, text: `cmd for ${tabId}`, executed: true };
        },
      });
      serverWithTracking.start();

      const mockClient = new MockWebSocket();
      await serverWithTracking.handleAuth(mockClient, {
        pairingCode: serverWithTracking.pairingCode,
        deviceName: 'Test Phone',
      });

      // Voice command to tab-1
      serverWithTracking.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
        false
      );
      serverWithTracking.handleMessage(mockClient, generateRandomData(4096), true);
      await serverWithTracking.handleAudioEnd({ tabId: 'tab-1' });

      // Voice command to tab-2
      serverWithTracking.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-2', mode: 'agent' }),
        false
      );
      serverWithTracking.handleMessage(mockClient, generateRandomData(4096), true);
      await serverWithTracking.handleAudioEnd({ tabId: 'tab-2' });

      // Voice command to tab-3
      serverWithTracking.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-3', mode: 'agent' }),
        false
      );
      serverWithTracking.handleMessage(mockClient, generateRandomData(4096), true);
      await serverWithTracking.handleAudioEnd({ tabId: 'tab-3' });

      expect(transcribedTabs).toEqual(['tab-1', 'tab-2', 'tab-3']);

      serverWithTracking.stop();
    });

    it('should return transcription result with correct tabId', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Voice command to tab-2
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'audio_start', tabId: 'tab-2', mode: 'agent' }),
        false
      );
      server.handleMessage(mockClient, generateRandomData(4096), true);
      await server.handleAudioEnd({ tabId: 'tab-2' });

      const transcriptionMsg = mockClient.messages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'transcription';
      });

      expect(transcriptionMsg).toBeDefined();
      const result = JSON.parse(transcriptionMsg);
      expect(result.tabId).toBe('tab-2');
    });
  });

  /**
   * Test Suite: Concurrent Operations Across Tabs
   */
  describe('Concurrent Operations Across Tabs', () => {
    it('should handle simultaneous commands to multiple tabs', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      // Clear histories
      mockPtyProcesses.forEach((pty) => pty.clearHistory());

      // Send commands rapidly to all tabs
      const commands = [
        { tabId: 'tab-1', data: 'pwd\r' },
        { tabId: 'tab-2', data: 'ls\r' },
        { tabId: 'tab-3', data: 'cat /var/log/syslog\r' },
        { tabId: 'tab-1', data: 'cd ..\r' },
        { tabId: 'tab-2', data: 'mkdir test\r' },
        { tabId: 'tab-3', data: 'tail -f\r' },
      ];

      for (const cmd of commands) {
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'terminal_write', ...cmd }),
          false
        );
      }

      // Verify each tab received its commands in order
      expect(mockPtyProcesses.get('tab-1')?.outputHistory).toEqual(['pwd\r', 'cd ..\r']);
      expect(mockPtyProcesses.get('tab-2')?.outputHistory).toEqual(['ls\r', 'mkdir test\r']);
      expect(mockPtyProcesses.get('tab-3')?.outputHistory).toEqual([
        'cat /var/log/syslog\r',
        'tail -f\r',
      ]);
    });

    it('should handle interleaved output from multiple tabs', async () => {
      const mockClient = new MockWebSocket();
      await server.handleAuth(mockClient, {
        pairingCode: server.pairingCode,
        deviceName: 'Test Phone',
      });

      mockClient.messages = [];

      // Simulate rapid interleaved output
      const outputs = [
        { tabId: 'tab-1', data: 'alpha-1\n' },
        { tabId: 'tab-2', data: 'beta-1\n' },
        { tabId: 'tab-3', data: 'gamma-1\n' },
        { tabId: 'tab-1', data: 'alpha-2\n' },
        { tabId: 'tab-2', data: 'beta-2\n' },
        { tabId: 'tab-1', data: 'alpha-3\n' },
      ];

      for (const output of outputs) {
        server.sendTerminalData(output.tabId, output.data);
      }

      // Verify all messages arrived with correct tabIds
      const messages = mockClient.messages.map((m) => JSON.parse(m));
      expect(messages).toHaveLength(6);

      // Check ordering per tab
      const tab1Outputs = messages
        .filter((m) => m.tabId === 'tab-1')
        .map((m) => m.data);
      expect(tab1Outputs).toEqual(['alpha-1\n', 'alpha-2\n', 'alpha-3\n']);
    });
  });
});
