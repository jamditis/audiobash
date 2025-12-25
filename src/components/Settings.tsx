import React, { useState, useEffect, useCallback } from 'react';
import { transcriptionService, MODELS, ModelId, CustomInstructions, VocabularyEntry } from '../services/transcriptionService';
import { useTheme } from '../themes';
import { Shortcuts } from '../types';
import TunnelStatus from './TunnelStatus';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayOnboarding?: () => void;
}

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, onReplayOnboarding }) => {
  // API keys for each provider
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [elevenlabsKeyInput, setElevenlabsKeyInput] = useState('');

  const [shell, setShell] = useState<'powershell' | 'cmd' | 'bash'>('powershell');
  const [model, setModel] = useState<ModelId>('gemini-2.0-flash');
  const [autoSend, setAutoSend] = useState(true);
  const [scanlines, setScanlines] = useState(false);
  const [saved, setSaved] = useState(false);
  const { theme, setTheme, themes } = useTheme();

  // Keyboard shortcuts
  const [shortcuts, setShortcuts] = useState<Shortcuts>({
    toggleRecording: 'Alt+S',
    cancelRecording: 'Alt+A',
    toggleWindow: 'Alt+H',
    toggleMode: 'Alt+M',
    clearTerminal: 'Alt+C',
    cycleLayout: 'Alt+L',
    focusNextTerminal: 'Alt+Right',
    focusPrevTerminal: 'Alt+Left',
    bookmarkDirectory: 'Alt+B',
    resendLast: 'Alt+R',
    switchTab1: 'Alt+1',
    switchTab2: 'Alt+2',
    switchTab3: 'Alt+3',
    switchTab4: 'Alt+4',
    togglePreview: 'Alt+P',
    captureScreenshot: 'Alt+Shift+P',
  });
  const [shortcutsInput, setShortcutsInput] = useState<Shortcuts>({
    toggleRecording: 'Alt+S',
    cancelRecording: 'Alt+A',
    toggleWindow: 'Alt+H',
    toggleMode: 'Alt+M',
    clearTerminal: 'Alt+C',
    cycleLayout: 'Alt+L',
    focusNextTerminal: 'Alt+Right',
    focusPrevTerminal: 'Alt+Left',
    bookmarkDirectory: 'Alt+B',
    resendLast: 'Alt+R',
    switchTab1: 'Alt+1',
    switchTab2: 'Alt+2',
    switchTab3: 'Alt+3',
    switchTab4: 'Alt+4',
    togglePreview: 'Alt+P',
    captureScreenshot: 'Alt+Shift+P',
  });
  const [recordingShortcut, setRecordingShortcut] = useState<keyof Shortcuts | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  // Custom instructions state
  const [rawModeInstructions, setRawModeInstructions] = useState('');
  const [agentModeInstructions, setAgentModeInstructions] = useState('');
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [newVocabSpoken, setNewVocabSpoken] = useState('');
  const [newVocabWritten, setNewVocabWritten] = useState('');

  // CLI notification settings
  const [cliNotificationsEnabled, setCliNotificationsEnabled] = useState(true);

  // Remote control status
  const [remoteStatus, setRemoteStatus] = useState<{
    running: boolean;
    port: number;
    pairingCode: string | null;
    staticPassword: string | null;
    hasStaticPassword: boolean;
    addresses: string[];
    connected: boolean;
    deviceName: string | null;
  }>({
    running: false,
    port: 8765,
    pairingCode: null,
    staticPassword: null,
    hasStaticPassword: false,
    addresses: [],
    connected: false,
    deviceName: null,
  });

  // Remote access settings
  const [remotePassword, setRemotePassword] = useState('');
  const [remotePasswordInput, setRemotePasswordInput] = useState('');
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(false);

  useEffect(() => {
    // Load all API keys
    window.electron?.getApiKey('gemini').then((key: string) => {
      if (key) {
        setGeminiKey(key);
        setGeminiKeyInput(key);
        transcriptionService.setApiKey(key, 'gemini');
      }
    });
    window.electron?.getApiKey('openai').then((key: string) => {
      if (key) {
        setOpenaiKey(key);
        setOpenaiKeyInput(key);
        transcriptionService.setApiKey(key, 'openai');
      }
    });
    window.electron?.getApiKey('anthropic').then((key: string) => {
      if (key) {
        setAnthropicKey(key);
        setAnthropicKeyInput(key);
        transcriptionService.setApiKey(key, 'anthropic');
      }
    });
    window.electron?.getApiKey('elevenlabs').then((key: string) => {
      if (key) {
        setElevenlabsKey(key);
        setElevenlabsKeyInput(key);
        transcriptionService.setApiKey(key, 'elevenlabs');
      }
    });

    // Load other settings from localStorage
    const savedShell = localStorage.getItem('audiobash-shell');
    const savedModel = localStorage.getItem('audiobash-model');
    const savedAutoSend = localStorage.getItem('audiobash-autosend');
    const savedScanlines = localStorage.getItem('audiobash-scanlines');

    if (savedShell) setShell(savedShell as any);
    if (savedModel) setModel(savedModel as ModelId);
    if (savedAutoSend !== null) setAutoSend(savedAutoSend === 'true');
    if (savedScanlines !== null) setScanlines(savedScanlines === 'true');

    // Load custom instructions
    const savedRawInstructions = localStorage.getItem('audiobash-raw-instructions');
    const savedAgentInstructions = localStorage.getItem('audiobash-agent-instructions');
    const savedVocabulary = localStorage.getItem('audiobash-vocabulary');
    const savedCliNotifications = localStorage.getItem('audiobash-cli-notifications');

    if (savedRawInstructions) setRawModeInstructions(savedRawInstructions);
    if (savedAgentInstructions) setAgentModeInstructions(savedAgentInstructions);
    if (savedVocabulary) {
      try {
        setVocabulary(JSON.parse(savedVocabulary));
      } catch (e) {
        console.warn('Failed to parse vocabulary:', e);
      }
    }
    if (savedCliNotifications !== null) setCliNotificationsEnabled(savedCliNotifications === 'true');

    // Load keyboard shortcuts
    window.electron?.getShortcuts().then((savedShortcuts) => {
      if (savedShortcuts) {
        setShortcuts(savedShortcuts);
        setShortcutsInput(savedShortcuts);
      }
    });

    // Load remote control status
    window.electron?.getRemoteStatus().then((status) => {
      if (status) setRemoteStatus(status);
    });

    // Load remote password
    window.electron?.getRemotePassword().then((password) => {
      setRemotePassword(password || '');
      setRemotePasswordInput(password || '');
    });

    // Load keep-awake setting
    window.electron?.getKeepAwake().then((enabled) => {
      setKeepAwakeEnabled(enabled);
    });

    // Listen for remote status changes
    const cleanup = window.electron?.onRemoteStatusChanged((status) => {
      setRemoteStatus(status);
    });

    return () => cleanup?.();
  }, [isOpen]);

  // Handle keyboard shortcut recording
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recordingShortcut) return;

    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    // Only record if a modifier is pressed
    if (parts.length === 0) return;

    // Map e.key to Electron accelerator format
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'ARROWUP': 'Up',
      'ARROWDOWN': 'Down',
      'ARROWLEFT': 'Left',
      'ARROWRIGHT': 'Right',
      'ESCAPE': 'Escape',
      'ENTER': 'Return',
      'BACKSPACE': 'Backspace',
      'DELETE': 'Delete',
      'TAB': 'Tab',
      'HOME': 'Home',
      'END': 'End',
      'PAGEUP': 'PageUp',
      'PAGEDOWN': 'PageDown',
      'INSERT': 'Insert',
    };

    // Add the main key (if it's not just a modifier)
    const rawKey = e.key.toUpperCase();
    if (!['CONTROL', 'ALT', 'SHIFT', 'META'].includes(rawKey)) {
      // Convert to Electron accelerator format
      const key = keyMap[rawKey] || rawKey;
      parts.push(key);

      const shortcut = parts.join('+');
      console.log('[AudioBash] Captured shortcut:', shortcut);
      setShortcutsInput(prev => ({ ...prev, [recordingShortcut]: shortcut }));
      setRecordingShortcut(null);
      setShortcutError(null);
    }
  }, [recordingShortcut]);

  useEffect(() => {
    if (recordingShortcut) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [recordingShortcut, handleKeyDown]);

  const saveSettings = async () => {
    // Save API keys
    if (geminiKeyInput !== geminiKey) {
      await window.electron?.setApiKey(geminiKeyInput, 'gemini');
      setGeminiKey(geminiKeyInput);
      transcriptionService.setApiKey(geminiKeyInput, 'gemini');
    }
    if (openaiKeyInput !== openaiKey) {
      await window.electron?.setApiKey(openaiKeyInput, 'openai');
      setOpenaiKey(openaiKeyInput);
      transcriptionService.setApiKey(openaiKeyInput, 'openai');
    }
    if (anthropicKeyInput !== anthropicKey) {
      await window.electron?.setApiKey(anthropicKeyInput, 'anthropic');
      setAnthropicKey(anthropicKeyInput);
      transcriptionService.setApiKey(anthropicKeyInput, 'anthropic');
    }
    if (elevenlabsKeyInput !== elevenlabsKey) {
      await window.electron?.setApiKey(elevenlabsKeyInput, 'elevenlabs');
      setElevenlabsKey(elevenlabsKeyInput);
      transcriptionService.setApiKey(elevenlabsKeyInput, 'elevenlabs');
    }

    // Save other settings
    localStorage.setItem('audiobash-shell', shell);
    localStorage.setItem('audiobash-model', model);
    localStorage.setItem('audiobash-autosend', String(autoSend));
    localStorage.setItem('audiobash-scanlines', String(scanlines));

    // Save custom instructions
    localStorage.setItem('audiobash-raw-instructions', rawModeInstructions);
    localStorage.setItem('audiobash-agent-instructions', agentModeInstructions);
    localStorage.setItem('audiobash-vocabulary', JSON.stringify(vocabulary));
    localStorage.setItem('audiobash-cli-notifications', String(cliNotificationsEnabled));

    // Update transcription service with custom instructions
    transcriptionService.setCustomInstructions({
      rawModeInstructions,
      agentModeInstructions,
      vocabulary,
    });

    // Dispatch storage event for scanlines
    window.dispatchEvent(new Event('storage'));

    // Save keyboard shortcuts if changed
    const shortcutsChanged = Object.keys(shortcutsInput).some(
      key => shortcutsInput[key as keyof Shortcuts] !== shortcuts[key as keyof Shortcuts]
    );
    if (shortcutsChanged) {
      const result = await window.electron?.setShortcuts(shortcutsInput);
      if (result?.success) {
        setShortcuts(shortcutsInput);
        setShortcutError(null);
      } else {
        setShortcutError(result?.error || 'Failed to save shortcuts');
        return;
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Get the provider for the selected model
  const selectedModelInfo = MODELS.find(m => m.id === model);
  const selectedProvider = selectedModelInfo?.provider || 'gemini';

  // Check if selected model has required API key
  const hasRequiredKey = () => {
    switch (selectedProvider) {
      case 'gemini': return !!geminiKeyInput;
      case 'openai': return !!openaiKeyInput;
      case 'anthropic': return !!openaiKeyInput && !!anthropicKeyInput; // Claude needs both
      case 'elevenlabs': return !!elevenlabsKeyInput;
      case 'local': return true;
      default: return false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-void-100 border border-void-300 rounded-lg w-[520px] max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-void-300">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest">Settings</h2>
          <button
            onClick={onClose}
            className="text-crt-white/50 hover:text-crt-white transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 overflow-y-auto max-h-[65vh]">
          {/* API Keys Section */}
          <div className="space-y-3">
            <h3 className="text-[10px] text-crt-white/50 font-mono uppercase tracking-wider border-b border-void-300 pb-1">
              API Keys
            </h3>

            {/* Gemini */}
            <div>
              <label className="flex items-center justify-between text-[10px] text-crt-white/50 font-mono uppercase mb-1">
                <span>Gemini API key</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/70 hover:text-accent"
                >
                  Get key →
                </a>
              </label>
              <input
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-void-200 border border-void-300 rounded px-3 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none"
              />
            </div>

            {/* OpenAI */}
            <div>
              <label className="flex items-center justify-between text-[10px] text-crt-white/50 font-mono uppercase mb-1">
                <span>OpenAI API key</span>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/70 hover:text-accent"
                >
                  Get key →
                </a>
              </label>
              <input
                type="password"
                value={openaiKeyInput}
                onChange={(e) => setOpenaiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-void-200 border border-void-300 rounded px-3 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none"
              />
            </div>

            {/* Anthropic */}
            <div>
              <label className="flex items-center justify-between text-[10px] text-crt-white/50 font-mono uppercase mb-1">
                <span>Anthropic API key</span>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/70 hover:text-accent"
                >
                  Get key →
                </a>
              </label>
              <input
                type="password"
                value={anthropicKeyInput}
                onChange={(e) => setAnthropicKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-void-200 border border-void-300 rounded px-3 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none"
              />
              <div className="text-[9px] text-crt-white/30 mt-0.5">
                Claude models require both OpenAI (for Whisper) and Anthropic keys
              </div>
            </div>

            {/* ElevenLabs */}
            <div>
              <label className="flex items-center justify-between text-[10px] text-crt-white/50 font-mono uppercase mb-1">
                <span>ElevenLabs API key</span>
                <a
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/70 hover:text-accent"
                >
                  Get key →
                </a>
              </label>
              <input
                type="password"
                value={elevenlabsKeyInput}
                onChange={(e) => setElevenlabsKeyInput(e.target.value)}
                placeholder="xi_..."
                className="w-full bg-void-200 border border-void-300 rounded px-3 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Theme Selection */}
          <div>
            <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-2">
              Visual theme
            </label>
            <div className="grid grid-cols-5 gap-2">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`
                    p-2 rounded border transition-all
                    ${theme.id === t.id
                      ? 'border-accent ring-1 ring-accent'
                      : 'border-void-300 hover:border-void-200'
                    }
                  `}
                  title={t.name}
                >
                  <div
                    className="w-full h-6 rounded mb-1"
                    style={{ backgroundColor: t.colors.void }}
                  >
                    <div className="flex h-full items-center justify-center gap-0.5 px-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: t.colors.accent }}
                      />
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: t.colors.crtGreen }}
                      />
                    </div>
                  </div>
                  <div className="text-[9px] text-center text-crt-white/60 truncate">
                    {t.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Scanline Toggle */}
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-xs font-mono">Retro scanlines</div>
                <div className="text-[10px] text-crt-white/30">
                  Add subtle CRT scanline effect to terminal
                </div>
              </div>
              <button
                onClick={() => setScanlines(!scanlines)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  scanlines ? 'bg-accent' : 'bg-void-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    scanlines ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-2">
              Transcription model
            </label>
            <div className="space-y-1.5">
              {MODELS.map((m) => {
                const needsKey = m.provider === 'gemini' ? !geminiKeyInput :
                  m.provider === 'openai' ? !openaiKeyInput :
                  m.provider === 'anthropic' ? (!openaiKeyInput || !anthropicKeyInput) :
                  m.provider === 'elevenlabs' ? !elevenlabsKeyInput :
                  false;

                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                      model === m.id
                        ? 'border-accent/50 bg-accent/5'
                        : needsKey
                          ? 'border-void-300 opacity-50 cursor-not-allowed'
                          : 'border-void-300 hover:border-void-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.id}
                      checked={model === m.id}
                      onChange={(e) => !needsKey && setModel(e.target.value as ModelId)}
                      disabled={needsKey}
                      className="sr-only"
                    />
                    <div className={`w-3 h-3 rounded-full border-2 ${
                      model === m.id ? 'border-accent bg-accent' : 'border-void-300'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{m.name}</span>
                        {m.supportsAgent && (
                          <span className="text-[8px] px-1 py-0.5 bg-accent/20 text-accent rounded uppercase">
                            Agent
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-crt-white/30">{m.description}</div>
                    </div>
                    {needsKey && (
                      <span className="text-[9px] text-accent/70 uppercase">No key</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Shell Selection */}
          <div>
            <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-2">
              Default shell
            </label>
            <div className="flex gap-2">
              {['powershell', 'cmd', 'bash'].map((s) => (
                <button
                  key={s}
                  onClick={() => setShell(s as any)}
                  className={`flex-1 py-1.5 text-xs font-mono uppercase border rounded transition-colors ${
                    shell === s
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-void-300 text-crt-white/50 hover:border-void-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-crt-white/30 mt-1">
              Restart app to change shell
            </div>
          </div>

          {/* Auto-send toggle */}
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-xs font-mono">Auto-send to terminal</div>
                <div className="text-[10px] text-crt-white/30">
                  Automatically execute transcribed commands
                </div>
              </div>
              <button
                onClick={() => setAutoSend(!autoSend)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  autoSend ? 'bg-accent' : 'bg-void-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    autoSend ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* CLI Notifications toggle */}
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-xs font-mono">CLI input notifications</div>
                <div className="text-[10px] text-crt-white/30">
                  Play sound when CLI tools request approval
                </div>
              </div>
              <button
                onClick={() => setCliNotificationsEnabled(!cliNotificationsEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  cliNotificationsEnabled ? 'bg-accent' : 'bg-void-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    cliNotificationsEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* Remote Control Section */}
          <div className="space-y-3">
            <h3 className="text-[10px] text-crt-white/50 font-mono uppercase tracking-wider border-b border-void-300 pb-1">
              Mobile remote control
            </h3>

            {/* Connection status */}
            <div className="bg-void-200 rounded p-3 space-y-3">
              {/* Status indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${remoteStatus.connected ? 'bg-crt-green animate-pulse' : 'bg-crt-amber'}`} />
                  <span className="text-xs font-mono">
                    {remoteStatus.connected
                      ? `Connected: ${remoteStatus.deviceName}`
                      : 'Waiting for connection'}
                  </span>
                </div>
                {remoteStatus.running && (
                  <span className="text-[9px] text-crt-white/30 font-mono">
                    Port {remoteStatus.port}
                  </span>
                )}
              </div>

              {/* Pairing code */}
              {remoteStatus.pairingCode && !remoteStatus.connected && (
                <div className="space-y-2">
                  <div className="text-[10px] text-crt-white/50">Pairing code:</div>
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-2xl tracking-[0.3em] text-accent font-bold">
                      {remoteStatus.pairingCode}
                    </div>
                    <button
                      onClick={async () => {
                        const newCode = await window.electron?.regeneratePairingCode();
                        if (newCode) {
                          setRemoteStatus(prev => ({ ...prev, pairingCode: newCode }));
                        }
                      }}
                      className="text-[10px] text-crt-white/50 hover:text-accent transition-colors px-2 py-1 border border-void-300 rounded"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              {/* IP addresses */}
              {remoteStatus.addresses.length > 0 && !remoteStatus.connected && (
                <div className="space-y-1">
                  <div className="text-[10px] text-crt-white/50">Connect from your phone to:</div>
                  {remoteStatus.addresses.map((ip) => (
                    <div key={ip} className="font-mono text-xs text-crt-white/80">
                      ws://{ip}:{remoteStatus.port}
                    </div>
                  ))}
                </div>
              )}

              {/* Static password for remote access */}
              <div className="space-y-2 pt-2 border-t border-void-300">
                <div className="text-[10px] text-crt-white/50">
                  Static password (for remote access outside your network):
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={remotePasswordInput}
                    onChange={(e) => setRemotePasswordInput(e.target.value.toUpperCase())}
                    placeholder="Set a password..."
                    className="flex-1 bg-void-100 border border-void-300 rounded px-2 py-1.5 text-xs font-mono text-crt-white focus:border-accent focus:outline-none uppercase tracking-wider"
                    maxLength={20}
                  />
                  <button
                    onClick={async () => {
                      await window.electron?.setRemotePassword(remotePasswordInput);
                      setRemotePassword(remotePasswordInput);
                    }}
                    disabled={remotePasswordInput === remotePassword}
                    className="text-[10px] px-3 py-1.5 bg-accent text-void rounded font-mono disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  {remotePassword && (
                    <button
                      onClick={async () => {
                        await window.electron?.setRemotePassword('');
                        setRemotePassword('');
                        setRemotePasswordInput('');
                      }}
                      className="text-[10px] px-2 py-1.5 text-accent border border-accent rounded font-mono hover:bg-accent/10"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {remotePassword && (
                  <div className="text-[9px] text-crt-green/70">
                    Password set. Use this instead of pairing code for persistent access.
                  </div>
                )}
              </div>

              {/* Keep-awake toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-void-300">
                <div>
                  <div className="text-[10px] text-crt-white/70 font-mono">Keep computer awake</div>
                  <div className="text-[9px] text-crt-white/30">Prevent sleep while remote access is enabled</div>
                </div>
                <button
                  onClick={async () => {
                    const newState = await window.electron?.setKeepAwake(!keepAwakeEnabled);
                    setKeepAwakeEnabled(newState);
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${keepAwakeEnabled ? 'bg-crt-green' : 'bg-void-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-crt-white rounded-full transition-transform ${keepAwakeEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Instructions */}
              <div className="text-[10px] text-crt-white/30 leading-relaxed pt-2">
                {remoteStatus.connected
                  ? 'Voice commands from your phone will execute in the terminal above.'
                  : 'Open https://jamditis.github.io/audiobash/remote/ on your phone and enter the pairing code (or static password) to connect.'}
              </div>
            </div>
          </div>

          {/* Tunnel Service (Public Access) */}
          <TunnelStatus />

          {/* Custom Instructions Section */}
          <div className="space-y-3">
            <h3 className="text-[10px] text-crt-white/50 font-mono uppercase tracking-wider border-b border-void-300 pb-1">
              Custom Instructions
            </h3>

            {/* Raw Mode Instructions */}
            <div>
              <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-1">
                Raw transcription instructions
              </label>
              <textarea
                value={rawModeInstructions}
                onChange={(e) => setRawModeInstructions(e.target.value)}
                placeholder="Extra context for transcription (e.g., 'I speak with a Boston accent', 'Technical terms I use often: kubectl, nginx')"
                rows={3}
                className="w-full bg-void-200 border border-void-300 rounded px-3 py-2 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none resize-none"
              />
            </div>

            {/* Agent Mode Instructions */}
            <div>
              <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-1">
                Agent mode instructions
              </label>
              <textarea
                value={agentModeInstructions}
                onChange={(e) => setAgentModeInstructions(e.target.value)}
                placeholder="Instructions for AI command generation (e.g., 'Always use PowerShell syntax', 'Prefer npm over yarn')"
                rows={3}
                className="w-full bg-void-200 border border-void-300 rounded px-3 py-2 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Vocabulary / Pronunciations Section */}
          <div className="space-y-3">
            <h3 className="text-[10px] text-crt-white/50 font-mono uppercase tracking-wider border-b border-void-300 pb-1">
              Custom Vocabulary
            </h3>
            <div className="text-[10px] text-crt-white/30 -mt-1">
              Map spoken words to correct spellings (e.g., "claude code" → "Claude Code")
            </div>

            {/* Add new vocabulary entry */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newVocabSpoken}
                onChange={(e) => setNewVocabSpoken(e.target.value)}
                placeholder="Spoken (e.g., next js)"
                className="flex-1 bg-void-200 border border-void-300 rounded px-2 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none"
              />
              <span className="text-crt-white/30 self-center">→</span>
              <input
                type="text"
                value={newVocabWritten}
                onChange={(e) => setNewVocabWritten(e.target.value)}
                placeholder="Written (e.g., Next.js)"
                className="flex-1 bg-void-200 border border-void-300 rounded px-2 py-1.5 text-xs font-mono text-crt-white placeholder:text-crt-white/20 focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => {
                  if (newVocabSpoken.trim() && newVocabWritten.trim()) {
                    setVocabulary([...vocabulary, { spoken: newVocabSpoken.trim(), written: newVocabWritten.trim() }]);
                    setNewVocabSpoken('');
                    setNewVocabWritten('');
                  }
                }}
                disabled={!newVocabSpoken.trim() || !newVocabWritten.trim()}
                className="px-3 py-1.5 text-xs font-mono uppercase bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>

            {/* Vocabulary list */}
            {vocabulary.length > 0 && (
              <div className="bg-void-200 rounded border border-void-300 divide-y divide-void-300 max-h-32 overflow-y-auto">
                {vocabulary.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-crt-white/50">{entry.spoken}</span>
                      <span className="text-crt-white/30">→</span>
                      <span className="text-crt-green">{entry.written}</span>
                    </div>
                    <button
                      onClick={() => setVocabulary(vocabulary.filter((_, i) => i !== idx))}
                      className="text-accent/50 hover:text-accent text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Keyboard Shortcuts */}
          <div>
            <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-2">
              Keyboard shortcuts
            </label>

            {/* Voice shortcuts */}
            <div className="text-[9px] text-crt-white/40 uppercase tracking-wider mb-1 mt-2">Voice</div>
            <div className="bg-void-200 rounded p-2 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Start/stop recording</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+S</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Cancel recording</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-accent">Alt+A</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Toggle raw/agent mode</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+M</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Resend last command</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+R</span>
              </div>
            </div>

            {/* Window shortcuts */}
            <div className="text-[9px] text-crt-white/40 uppercase tracking-wider mb-1 mt-3">Window</div>
            <div className="bg-void-200 rounded p-2 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Show/hide window</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+H</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Cycle layout</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+L</span>
              </div>
            </div>

            {/* Terminal shortcuts */}
            <div className="text-[9px] text-crt-white/40 uppercase tracking-wider mb-1 mt-3">Terminal</div>
            <div className="bg-void-200 rounded p-2 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Clear terminal</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+C</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Focus next pane</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+→</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Focus prev pane</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+←</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Bookmark directory</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+B</span>
              </div>
            </div>

            {/* Tab shortcuts */}
            <div className="text-[9px] text-crt-white/40 uppercase tracking-wider mb-1 mt-3">Tabs</div>
            <div className="bg-void-200 rounded p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Switch to tab 1-4</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+1-4</span>
              </div>
            </div>

            {/* Preview shortcuts */}
            <div className="text-[9px] text-crt-white/40 uppercase tracking-wider mb-1 mt-3">Preview</div>
            <div className="bg-void-200 rounded p-2 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Toggle preview pane</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+P</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-crt-white/50">Screenshot preview</span>
                <span className="px-2 py-1 rounded font-mono bg-void-300 text-crt-amber">Alt+Shift+P</span>
              </div>
            </div>
          </div>

          {/* Help & Onboarding */}
          <div>
            <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-2">
              Help
            </label>
            <button
              onClick={onReplayOnboarding}
              className="w-full py-2 text-xs font-mono border border-void-300 rounded hover:border-accent/50 hover:text-accent transition-colors text-crt-white/70"
            >
              Replay welcome walkthrough
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-void-300 flex justify-between items-center">
          <span className={`text-[10px] font-mono transition-opacity ${saved ? 'text-crt-green' : 'opacity-0'}`}>
            Settings saved
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono uppercase border border-void-300 rounded hover:border-crt-white/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveSettings}
              className="px-4 py-2 text-xs font-mono uppercase bg-accent text-void rounded hover:bg-accent/80 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
