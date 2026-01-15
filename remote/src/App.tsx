import React, { useState, useCallback, useEffect } from 'react';
import {
  useAudioBashConnection,
  usePushToTalk,
  detectBestMode,
} from './hooks';
import {
  StatusBar,
  ConnectionModal,
  Terminal,
  TerminalTabs,
  VoiceButton,
  VoicePreview,
} from './components';

/**
 * AudioBash Remote - Mobile PWA companion
 *
 * Voice-controlled terminal access from your mobile device.
 * Connects to AudioBash desktop via WebSocket for real-time
 * terminal interaction and voice command execution.
 */
function App() {
  // Connection state
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [savedConnection, setSavedConnection] = useState<{
    url: string;
    code: string;
  } | null>(null);

  // Terminal output buffer per tab
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});

  // Voice preview state
  const [voicePreviewText, setVoicePreviewText] = useState('');
  const [showVoicePreview, setShowVoicePreview] = useState(false);

  // Detect best transcription mode for this browser
  const [transcriptionMode] = useState(() => detectBestMode());

  // AudioBash WebSocket connection
  const connection = useAudioBashConnection({
    onTerminalData: useCallback((tabId: string, data: string) => {
      setTerminalOutputs((prev) => ({
        ...prev,
        [tabId]: (prev[tabId] || '') + data,
      }));
    }, []),
    onTranscription: useCallback((result) => {
      // Show preview for user to confirm/edit before sending
      setVoicePreviewText(result.text);
      setShowVoicePreview(true);
    }, []),
    onDisconnect: useCallback(() => {
      // Clear outputs on disconnect
      setTerminalOutputs({});
    }, []),
  });

  // Push-to-talk voice input
  const pushToTalk = usePushToTalk({
    mode: transcriptionMode,
    onTranscript: useCallback((text: string) => {
      // For local (Web Speech API) mode, show preview immediately
      if (transcriptionMode === 'local') {
        setVoicePreviewText(text);
        setShowVoicePreview(true);
      }
    }, [transcriptionMode]),
    onRecordingComplete: useCallback(
      async (blob: Blob, duration: number) => {
        // For server mode, send audio to AudioBash for transcription
        if (transcriptionMode === 'server' && connection.authenticated) {
          connection.startAudioSession(connection.activeTab, 'agent');

          // Send in chunks
          const chunkSize = 64 * 1024; // 64KB chunks
          const arrayBuffer = await blob.arrayBuffer();
          for (let i = 0; i < arrayBuffer.byteLength; i += chunkSize) {
            const chunk = arrayBuffer.slice(i, i + chunkSize);
            connection.sendAudioChunk(new Blob([chunk], { type: blob.type }));
          }

          connection.endAudioSession(connection.activeTab);
        }
      },
      [connection, transcriptionMode]
    ),
  });

  // Load saved connection on mount
  useEffect(() => {
    const saved = localStorage.getItem('audiobash-remote-connection');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedConnection(parsed);
      } catch {
        // Invalid saved data, ignore
      }
    }
  }, []);

  // Auto-connect to saved connection
  useEffect(() => {
    if (savedConnection && !connection.connected && !connection.connecting) {
      // Small delay to let UI render first
      const timeout = setTimeout(() => {
        connection.connect(savedConnection.url, savedConnection.code);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [savedConnection, connection]);

  // Handle connection from modal
  const handleConnect = useCallback(
    (url: string, code: string) => {
      connection.connect(url, code);
      setShowConnectionModal(false);
    },
    [connection]
  );

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    connection.disconnect();
    setSavedConnection(null);
    localStorage.removeItem('audiobash-remote-connection');
  }, [connection]);

  // Send voice command to terminal
  const handleSendVoiceCommand = useCallback(() => {
    if (voicePreviewText.trim() && connection.authenticated) {
      connection.sendCommand(voicePreviewText.trim());
      setVoicePreviewText('');
      setShowVoicePreview(false);
      pushToTalk.reset();
    }
  }, [voicePreviewText, connection, pushToTalk]);

  // Cancel voice command
  const handleCancelVoice = useCallback(() => {
    setVoicePreviewText('');
    setShowVoicePreview(false);
    pushToTalk.reset();
  }, [pushToTalk]);

  // Get current tab's output
  const currentOutput = terminalOutputs[connection.activeTab] || '';

  // Show connection screen if not connected
  if (!connection.connected && !connection.connecting) {
    return (
      <div className="min-h-screen bg-void flex flex-col">
        {/* Header */}
        <header className="bg-void-100 border-b border-void-300 px-4 py-3 safe-area-top">
          <div className="flex items-center justify-between">
            <h1 className="font-display font-bold text-lg text-chrome tracking-wide">
              AUDIOBASH<span className="text-acid">_</span>REMOTE
            </h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-xs text-chrome/60">DISCONNECTED</span>
            </div>
          </div>
        </header>

        {/* Main Content - Connection Screen */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center space-y-6">
            {/* Connection Icon */}
            <div className="w-24 h-24 mx-auto border-2 border-void-300 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-chrome/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <h2 className="font-display font-semibold text-xl text-chrome">
                Connect to AudioBash
              </h2>
              <p className="font-mono text-sm text-chrome/60 max-w-xs mx-auto">
                Open AudioBash on your desktop, go to Settings → Remote, and scan
                the QR code.
              </p>
            </div>

            {/* Error Display */}
            {connection.error && (
              <div className="px-4 py-2 bg-accent/10 border border-accent/30 text-accent font-mono text-sm">
                {connection.error}
              </div>
            )}

            {/* Connect Button */}
            <button
              className="px-6 py-3 bg-void-200 border border-acid text-acid font-display font-semibold uppercase tracking-wider hover:bg-acid hover:text-void transition-colors"
              onClick={() => setShowConnectionModal(true)}
            >
              Connect
            </button>

            {/* Saved Connection */}
            {savedConnection && (
              <p className="font-mono text-xs text-chrome/40">
                Saved: {savedConnection.url}
              </p>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-void-100 border-t border-void-300 px-4 py-2 safe-area-bottom">
          <p className="font-mono text-xs text-chrome/40 text-center">
            AudioBash Remote v1.0.0
          </p>
        </footer>

        {/* Connection Modal */}
        <ConnectionModal
          isOpen={showConnectionModal}
          onClose={() => setShowConnectionModal(false)}
          onConnect={handleConnect}
          connecting={connection.connecting}
          error={connection.error}
        />
      </div>
    );
  }

  // Connected state - show terminal and voice controls
  return (
    <div className="h-screen bg-void flex flex-col overflow-hidden">
      {/* Status Bar */}
      <StatusBar
        connected={connection.authenticated}
        desktopName={connection.desktopInfo?.hostname || 'AudioBash Desktop'}
        tunnelUrl={
          connection.desktopInfo?.hostname?.includes('tunnel')
            ? connection.desktopInfo.hostname
            : undefined
        }
        onSettingsClick={() => setShowConnectionModal(true)}
        onDisconnect={handleDisconnect}
      />

      {/* Terminal Tabs */}
      {connection.tabs.length > 1 && (
        <TerminalTabs
          tabs={connection.tabs}
          activeTab={connection.activeTab}
          onTabSelect={connection.switchTab}
        />
      )}

      {/* Terminal Output */}
      <div className="flex-1 min-h-0">
        <Terminal
          output={currentOutput}
          onInput={(input) => connection.sendInput(input)}
          fontSize={14}
          className="h-full"
        />
      </div>

      {/* Voice Controls */}
      <div className="bg-void-100 border-t border-void-300 p-4 safe-area-bottom">
        {showVoicePreview ? (
          <VoicePreview
            text={voicePreviewText}
            onSend={handleSendVoiceCommand}
            onCancel={handleCancelVoice}
            onEdit={setVoicePreviewText}
          />
        ) : (
          <div className="flex items-center justify-center gap-4">
            <VoiceButton
              onPressStart={pushToTalk.startTalking}
              onPressEnd={pushToTalk.stopTalking}
              isRecording={pushToTalk.isActive}
              isProcessing={
                pushToTalk.isProcessing ||
                connection.transcriptionStatus === 'processing'
              }
              disabled={!connection.authenticated}
            />

            {/* Recording Duration */}
            {pushToTalk.isActive && (
              <div className="font-mono text-sm text-accent">
                {(pushToTalk.duration / 1000).toFixed(1)}s
              </div>
            )}

            {/* Interim Transcript */}
            {pushToTalk.interimTranscript && (
              <div className="font-mono text-sm text-chrome/60 max-w-[200px] truncate">
                {pushToTalk.interimTranscript}
              </div>
            )}
          </div>
        )}

        {/* Mode Indicator */}
        <div className="mt-2 text-center">
          <span className="font-mono text-[10px] text-chrome/30 uppercase">
            {transcriptionMode === 'local' ? 'Web Speech' : 'Server'} Mode
          </span>
        </div>
      </div>

      {/* Connection Modal (for settings/reconnect) */}
      <ConnectionModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        onConnect={handleConnect}
        connecting={connection.connecting}
        error={connection.error}
      />
    </div>
  );
}

export default App;
