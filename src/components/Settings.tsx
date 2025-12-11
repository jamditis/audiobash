import React, { useState, useEffect, useCallback } from 'react';
import { transcriptionService, MODELS, ModelId } from '../services/transcriptionService';
import { useTheme } from '../themes';
import { Shortcuts } from '../types';

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
    toggleWindow: 'Alt+H',
  });
  const [shortcutsInput, setShortcutsInput] = useState<Shortcuts>({
    toggleRecording: 'Alt+S',
    toggleWindow: 'Alt+H',
  });
  const [recordingShortcut, setRecordingShortcut] = useState<'toggleRecording' | 'toggleWindow' | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

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

    // Load keyboard shortcuts
    window.electron?.getShortcuts().then((savedShortcuts) => {
      if (savedShortcuts) {
        setShortcuts(savedShortcuts);
        setShortcutsInput(savedShortcuts);
      }
    });
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

    // Dispatch storage event for scanlines
    window.dispatchEvent(new Event('storage'));

    // Save keyboard shortcuts if changed
    if (shortcutsInput.toggleRecording !== shortcuts.toggleRecording ||
        shortcutsInput.toggleWindow !== shortcuts.toggleWindow) {
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

          {/* Keyboard Shortcuts (read-only for v1.0.1) */}
          <div>
            <label className="block text-[10px] text-crt-white/50 font-mono uppercase mb-2">
              Keyboard shortcuts
            </label>
            <div className="bg-void-200 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-crt-white/50">Toggle recording</span>
                <span className="px-3 py-1.5 rounded text-xs font-mono bg-void-300 text-crt-amber">
                  Alt+S
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-crt-white/50">Show/hide window</span>
                <span className="px-3 py-1.5 rounded text-xs font-mono bg-void-300 text-crt-amber">
                  Alt+H
                </span>
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
