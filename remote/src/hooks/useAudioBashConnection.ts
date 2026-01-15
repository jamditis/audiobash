/**
 * High-level hook for AudioBash WebSocket protocol
 * Handles authentication, terminal data, tabs, and audio transcription
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

// Tab interface
export interface Tab {
  id: string;
  title: string;
}

// Desktop system info received on auth
export interface DesktopInfo {
  os: 'windows' | 'mac' | 'linux';
  shell: string;
  hostname: string;
  tabs: Tab[];
  activeTabId: string;
}

// Terminal context info
export interface TerminalContext {
  cwd: string;
  recentOutput: string;
  os: string;
  shell: string;
}

// Transcription result
export interface TranscriptionResult {
  tabId: string;
  text: string;
  success: boolean;
  executed?: boolean;
  error?: string;
}

// Transcription status
export type TranscriptionStatus = 'idle' | 'recording' | 'processing';

// Connection options
export interface UseAudioBashConnectionOptions {
  deviceName?: string;
  onTerminalData?: (tabId: string, data: string) => void;
  onTabsUpdate?: (tabs: Tab[]) => void;
  onTranscription?: (result: TranscriptionResult) => void;
  onTranscriptionStatus?: (tabId: string, status: TranscriptionStatus) => void;
  onDisconnect?: (reason?: string) => void;
  onSecurityEvent?: (event: SecurityEvent) => void;
}

// Security event from server
export interface SecurityEvent {
  type: string;
  message?: string;
  remainingSeconds?: number;
}

// Connection state
export interface UseAudioBashConnectionReturn {
  // Connection state
  connected: boolean;
  authenticated: boolean;
  connecting: boolean;
  error: string | null;

  // Desktop info (after auth)
  desktopInfo: DesktopInfo | null;
  sessionId: string | null;

  // Tab state
  tabs: Tab[];
  activeTab: string;

  // Connection actions
  connect: (url: string, pairingCode: string) => void;
  disconnect: () => void;

  // Terminal actions
  sendCommand: (command: string, tabId?: string) => void;
  sendInput: (input: string, tabId?: string) => void;
  switchTab: (tabId: string) => void;
  getContext: (tabId?: string) => void;

  // Audio actions
  startAudioSession: (tabId?: string, mode?: 'agent' | 'raw') => void;
  sendAudioChunk: (chunk: ArrayBuffer | Blob) => void;
  endAudioSession: (tabId?: string) => void;

  // Transcription state
  transcriptionStatus: TranscriptionStatus;
}

// Message types from server
interface AuthResponseMessage {
  type: 'auth_response';
  success: boolean;
  sessionId?: string;
  desktopInfo?: DesktopInfo;
  error?: string;
  message?: string;
}

interface TerminalDataMessage {
  type: 'terminal_data';
  tabId: string;
  data: string;
}

interface TabsMessage {
  type: 'tabs' | 'tabs_update';
  tabs: Tab[];
}

interface ContextMessage {
  type: 'context';
  tabId: string;
  context: TerminalContext;
}

interface TranscriptionMessage {
  type: 'transcription';
  tabId: string;
  text: string;
  success: boolean;
  executed?: boolean;
  error?: string;
}

interface TranscriptionStatusMessage {
  type: 'transcription_status';
  tabId: string;
  status: string;
}

interface DisconnectedMessage {
  type: 'disconnected';
  reason: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
  context?: string;
}

type ServerMessage =
  | AuthResponseMessage
  | TerminalDataMessage
  | TabsMessage
  | ContextMessage
  | TranscriptionMessage
  | TranscriptionStatusMessage
  | DisconnectedMessage
  | ErrorMessage;

/**
 * AudioBash-specific WebSocket connection hook
 * Implements the full AudioBash remote control protocol
 */
export function useAudioBashConnection(
  options: UseAudioBashConnectionOptions = {}
): UseAudioBashConnectionReturn {
  const {
    deviceName = 'AudioBash Remote',
    onTerminalData,
    onTabsUpdate,
    onTranscription,
    onTranscriptionStatus,
    onDisconnect,
    onSecurityEvent,
  } = options;

  // State
  const [authenticated, setAuthenticated] = useState(false);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>('idle');

  // Refs for pending auth
  const pendingAuthRef = useRef<{ pairingCode: string } | null>(null);
  const currentAudioTabRef = useRef<string>('');

  // Callback refs for stable references
  const onTerminalDataRef = useRef(onTerminalData);
  const onTabsUpdateRef = useRef(onTabsUpdate);
  const onTranscriptionRef = useRef(onTranscription);
  const onTranscriptionStatusRef = useRef(onTranscriptionStatus);
  const onDisconnectRef = useRef(onDisconnect);
  const onSecurityEventRef = useRef(onSecurityEvent);

  // Update callback refs
  useEffect(() => {
    onTerminalDataRef.current = onTerminalData;
    onTabsUpdateRef.current = onTabsUpdate;
    onTranscriptionRef.current = onTranscription;
    onTranscriptionStatusRef.current = onTranscriptionStatus;
    onDisconnectRef.current = onDisconnect;
    onSecurityEventRef.current = onSecurityEvent;
  }, [onTerminalData, onTabsUpdate, onTranscription, onTranscriptionStatus, onDisconnect, onSecurityEvent]);

  /**
   * Handle incoming messages from the WebSocket server
   */
  const handleMessage = useCallback((data: unknown) => {
    // Skip non-object messages (binary data, etc.)
    if (typeof data !== 'object' || data === null) {
      return;
    }

    const message = data as ServerMessage;

    switch (message.type) {
      case 'auth_response':
        handleAuthResponse(message);
        break;

      case 'terminal_data':
        onTerminalDataRef.current?.(message.tabId, message.data);
        break;

      case 'tabs':
      case 'tabs_update':
        setTabs(message.tabs);
        onTabsUpdateRef.current?.(message.tabs);
        break;

      case 'context':
        // Context responses can be handled by caller via events if needed
        break;

      case 'transcription':
        setTranscriptionStatus('idle');
        onTranscriptionRef.current?.({
          tabId: message.tabId,
          text: message.text,
          success: message.success,
          executed: message.executed,
          error: message.error,
        });
        break;

      case 'transcription_status':
        const status = message.status === 'processing' ? 'processing' : 'idle';
        setTranscriptionStatus(status);
        onTranscriptionStatusRef.current?.(message.tabId, status);
        break;

      case 'disconnected':
        setAuthenticated(false);
        setDesktopInfo(null);
        setSessionId(null);
        onDisconnectRef.current?.(message.reason);
        break;

      case 'error':
        console.error('[AudioBashConnection] Server error:', message.message, message.context);
        break;

      default:
        // Unknown message type - ignore
        break;
    }
  }, []);

  /**
   * Handle authentication response
   */
  const handleAuthResponse = useCallback((message: AuthResponseMessage) => {
    if (message.success) {
      setAuthenticated(true);
      setSessionId(message.sessionId || null);
      setAuthError(null);

      if (message.desktopInfo) {
        setDesktopInfo(message.desktopInfo);
        setTabs(message.desktopInfo.tabs);
        setActiveTab(message.desktopInfo.activeTabId);
        onTabsUpdateRef.current?.(message.desktopInfo.tabs);
      }
    } else {
      setAuthenticated(false);
      setAuthError(message.message || message.error || 'Authentication failed');

      // Handle rate limiting
      if (message.error === 'rate_limit_exceeded') {
        onSecurityEventRef.current?.({
          type: 'rate_limit',
          message: message.message,
        });
      }
    }
  }, []);

  /**
   * Handle WebSocket connection established
   */
  const handleConnect = useCallback(() => {
    // Send auth if we have pending credentials
    if (pendingAuthRef.current && wsSend) {
      wsSend({
        type: 'auth',
        pairingCode: pendingAuthRef.current.pairingCode,
        deviceName,
      });
    }
  }, [deviceName]);

  /**
   * Handle WebSocket disconnection
   */
  const handleDisconnect = useCallback(() => {
    setAuthenticated(false);
    setTranscriptionStatus('idle');
    onDisconnectRef.current?.();
  }, []);

  /**
   * Handle WebSocket error
   */
  const handleError = useCallback((error: Event) => {
    console.error('[AudioBashConnection] WebSocket error:', error);
  }, []);

  // Initialize WebSocket hook (but don't connect yet)
  const {
    connected,
    connecting,
    error: wsError,
    send: wsSend,
    sendBinary: wsSendBinary,
    disconnect: wsDisconnect,
    reconnect: wsReconnect,
  } = useWebSocket({
    url: wsUrl || 'ws://placeholder', // Placeholder URL, will be set on connect
    onMessage: handleMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    reconnect: authenticated, // Only auto-reconnect if previously authenticated
    reconnectInterval: 2000,
    maxReconnectAttempts: 5,
  });

  // Store wsSend in ref for use in handleConnect
  const wsSendRef = useRef(wsSend);
  useEffect(() => {
    wsSendRef.current = wsSend;
  }, [wsSend]);

  /**
   * Connect to AudioBash desktop with pairing code
   */
  const connect = useCallback((url: string, pairingCode: string) => {
    // Store pending auth credentials
    pendingAuthRef.current = { pairingCode };

    // Reset state
    setAuthenticated(false);
    setAuthError(null);
    setDesktopInfo(null);
    setSessionId(null);
    setTabs([]);
    setActiveTab('');

    // Set URL and trigger connection
    setWsUrl(url);
  }, []);

  // Effect to trigger connection when URL changes
  useEffect(() => {
    if (wsUrl && wsUrl !== 'ws://placeholder' && pendingAuthRef.current) {
      wsReconnect();
    }
  }, [wsUrl, wsReconnect]);

  // Send auth when connected
  useEffect(() => {
    if (connected && pendingAuthRef.current && !authenticated) {
      wsSend({
        type: 'auth',
        pairingCode: pendingAuthRef.current.pairingCode,
        deviceName,
      });
    }
  }, [connected, authenticated, wsSend, deviceName]);

  /**
   * Disconnect from AudioBash desktop
   */
  const disconnect = useCallback(() => {
    pendingAuthRef.current = null;
    setAuthenticated(false);
    setDesktopInfo(null);
    setSessionId(null);
    setTranscriptionStatus('idle');
    wsDisconnect();
  }, [wsDisconnect]);

  /**
   * Send a command to the terminal (with Enter key)
   */
  const sendCommand = useCallback((command: string, tabId?: string) => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot send command - not authenticated');
      return;
    }

    const targetTab = tabId || activeTab;
    if (!targetTab) {
      console.warn('[AudioBashConnection] No active tab to send command to');
      return;
    }

    wsSend({
      type: 'terminal_write',
      tabId: targetTab,
      data: command + '\r', // Add carriage return to execute
    });
  }, [authenticated, activeTab, wsSend]);

  /**
   * Send raw input to the terminal (no Enter key added)
   */
  const sendInput = useCallback((input: string, tabId?: string) => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot send input - not authenticated');
      return;
    }

    const targetTab = tabId || activeTab;
    if (!targetTab) {
      console.warn('[AudioBashConnection] No active tab to send input to');
      return;
    }

    wsSend({
      type: 'terminal_write',
      tabId: targetTab,
      data: input,
    });
  }, [authenticated, activeTab, wsSend]);

  /**
   * Request tab switch
   */
  const switchTab = useCallback((tabId: string) => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot switch tab - not authenticated');
      return;
    }

    setActiveTab(tabId);
    wsSend({
      type: 'switch_tab',
      tabId,
    });
  }, [authenticated, wsSend]);

  /**
   * Request terminal context (cwd, recent output, etc.)
   */
  const getContext = useCallback((tabId?: string) => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot get context - not authenticated');
      return;
    }

    wsSend({
      type: 'get_context',
      tabId: tabId || activeTab,
    });
  }, [authenticated, activeTab, wsSend]);

  /**
   * Start an audio recording session
   */
  const startAudioSession = useCallback((tabId?: string, mode: 'agent' | 'raw' = 'agent') => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot start audio - not authenticated');
      return;
    }

    const targetTab = tabId || activeTab;
    currentAudioTabRef.current = targetTab;
    setTranscriptionStatus('recording');

    wsSend({
      type: 'audio_start',
      tabId: targetTab,
      mode,
      format: 'webm',
    });
  }, [authenticated, activeTab, wsSend]);

  /**
   * Send audio data chunk (binary)
   */
  const sendAudioChunk = useCallback((chunk: ArrayBuffer | Blob) => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot send audio - not authenticated');
      return;
    }

    wsSendBinary(chunk);
  }, [authenticated, wsSendBinary]);

  /**
   * End audio recording session and trigger transcription
   */
  const endAudioSession = useCallback((tabId?: string) => {
    if (!authenticated) {
      console.warn('[AudioBashConnection] Cannot end audio - not authenticated');
      return;
    }

    const targetTab = tabId || currentAudioTabRef.current || activeTab;
    setTranscriptionStatus('processing');

    wsSend({
      type: 'audio_end',
      tabId: targetTab,
    });
  }, [authenticated, activeTab, wsSend]);

  // Combine errors
  const error = authError || wsError;

  return {
    // Connection state
    connected,
    authenticated,
    connecting,
    error,

    // Desktop info
    desktopInfo,
    sessionId,

    // Tab state
    tabs,
    activeTab,

    // Connection actions
    connect,
    disconnect,

    // Terminal actions
    sendCommand,
    sendInput,
    switchTab,
    getContext,

    // Audio actions
    startAudioSession,
    sendAudioChunk,
    endAudioSession,

    // Transcription state
    transcriptionStatus,
  };
}

export default useAudioBashConnection;
