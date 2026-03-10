import React, { useState, useEffect, useCallback, useRef } from 'react';
import TabBar from './components/TabBar';
import VoiceOverlay from './components/VoiceOverlay';
import StatusIndicator from './components/StatusIndicator';
import DirectoryPicker from './components/DirectoryPicker';
import ConsoleErrorViewer from './components/ConsoleErrorViewer';
import TitleBar from './components/TitleBar';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
import PreviewPane from './components/PreviewPane';
import PaneDivider from './components/PaneDivider';
import PaneManager, { PaneManagerHandle } from './components/PaneManager';
import { TerminalTab, PreviewPosition, ScreenshotResult } from './types';
import { transcriptionService, ModelId } from './services/transcriptionService';
import { appLog } from './utils/logger';
import { preWarmAudioContext } from './utils/notificationSound';

const MAX_TABS = 4;

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [autoSend, setAutoSend] = useState(true);
  const [previewBeforeExecute, setPreviewBeforeExecute] = useState(() => {
    return localStorage.getItem('audiobash-preview-before-execute') === 'true';
  });

  // Tab management state - default title adapts to platform
  const getDefaultShellName = () => {
    // Navigator.platform is deprecated but works for this purpose
    // On macOS it returns 'MacIntel' or 'MacARM', on Windows 'Win32'
    const platform = navigator.platform?.toLowerCase() || '';
    if (platform.includes('mac')) return 'Terminal';
    if (platform.includes('linux')) return 'Terminal';
    return 'PowerShell';
  };
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'tab-1', title: getDefaultShellName(), isActive: true }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [tabCounter, setTabCounter] = useState(1);

  // New state for overlay behavior
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [model, setModel] = useState<ModelId>('gemini-2.0-flash');
  const [apiKey, setApiKey] = useState('');

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // CLI notifications state
  const [cliNotificationsEnabled, setCliNotificationsEnabled] = useState(true);

  // Directory picker state
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);

  // Console error viewer state
  const [consoleErrorViewerOpen, setConsoleErrorViewerOpen] = useState(false);

  // PaneManager ref for imperative control
  const paneManagerRef = useRef<PaneManagerHandle>(null);

  // Voice mode state (shared with VoiceOverlay)
  const [voiceMode, setVoiceMode] = useState<'agent' | 'raw'>('agent');

  // Last transcript for resend feature
  const [lastTranscript, setLastTranscript] = useState<{ text: string; mode: 'agent' | 'raw' } | null>(null);

  // Preview pane state
  const [previewVisible, setPreviewVisible] = useState(() => {
    return localStorage.getItem('audiobash-preview-visible') === 'true';
  });
  const [previewPosition, setPreviewPosition] = useState<PreviewPosition>(() => {
    return (localStorage.getItem('audiobash-preview-position') as PreviewPosition) || 'right';
  });
  const [previewAutoRefresh, setPreviewAutoRefresh] = useState(() => {
    return localStorage.getItem('audiobash-preview-autorefresh') !== 'false';
  });
  const [previewWidth, setPreviewWidth] = useState(40); // percentage for right sidebar
  const [previewHeight, setPreviewHeight] = useState(35); // percentage for bottom panel

  // Font zoom state (persisted in localStorage)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('audiobash-font-size');
    return saved ? parseInt(saved, 10) : 14;
  });

  // Load settings and check onboarding
  useEffect(() => {
    const savedAutoSend = localStorage.getItem('audiobash-autosend');
    if (savedAutoSend !== null) {
      setAutoSend(savedAutoSend === 'true');
    }

    const savedPreviewBeforeExecute = localStorage.getItem('audiobash-preview-before-execute');
    if (savedPreviewBeforeExecute !== null) {
      setPreviewBeforeExecute(savedPreviewBeforeExecute === 'true');
    }

    const savedModel = localStorage.getItem('audiobash-model');
    if (savedModel) setModel(savedModel as ModelId);

    // Load ALL API keys and set them in the transcription service on startup
    const loadApiKeys = async () => {
      const geminiKey = await window.electron?.getApiKey('gemini');
      if (geminiKey) {
        setApiKey(geminiKey);
        transcriptionService.setApiKey(geminiKey, 'gemini');
      }

      const openaiKey = await window.electron?.getApiKey('openai');
      if (openaiKey) {
        transcriptionService.setApiKey(openaiKey, 'openai');
      }

      const anthropicKey = await window.electron?.getApiKey('anthropic');
      if (anthropicKey) {
        transcriptionService.setApiKey(anthropicKey, 'anthropic');
      }

      const elevenlabsKey = await window.electron?.getApiKey('elevenlabs');
      if (elevenlabsKey) {
        transcriptionService.setApiKey(elevenlabsKey, 'elevenlabs');
      }
    };
    loadApiKeys();

    // Load CLI notifications setting
    const savedCliNotifications = localStorage.getItem('audiobash-cli-notifications');
    if (savedCliNotifications !== null) {
      setCliNotificationsEnabled(savedCliNotifications === 'true');
    }

    // Check if onboarding should be shown
    const onboardingComplete = localStorage.getItem('audiobash-onboarding-complete');
    if (!onboardingComplete) {
      setShowOnboarding(true);
    }
  }, []);

  // Listen for settings changes
  useEffect(() => {
    const handleStorage = () => {
      const savedAutoSend = localStorage.getItem('audiobash-autosend');
      if (savedAutoSend !== null) {
        setAutoSend(savedAutoSend === 'true');
      }
      const savedPreviewBeforeExecute = localStorage.getItem('audiobash-preview-before-execute');
      if (savedPreviewBeforeExecute !== null) {
        setPreviewBeforeExecute(savedPreviewBeforeExecute === 'true');
      }
      const savedModel = localStorage.getItem('audiobash-model');
      if (savedModel) setModel(savedModel as ModelId);

      const savedCliNotifications = localStorage.getItem('audiobash-cli-notifications');
      if (savedCliNotifications !== null) {
        setCliNotificationsEnabled(savedCliNotifications === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Pre-warm AudioContext on first user gesture so notification chimes can fire
  useEffect(() => {
    const handler = () => {
      preWarmAudioContext();
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  // Font zoom IPC wiring (Ctrl+Plus / Ctrl+Minus / Ctrl+0)
  useEffect(() => {
    const cleanups = [
      window.electron?.onZoomIn(() => setFontSize(s => Math.min(s + 2, 32))),
      window.electron?.onZoomOut(() => setFontSize(s => Math.max(s - 2, 8))),
      window.electron?.onZoomReset(() => setFontSize(14)),
    ];
    return () => cleanups.forEach(c => c?.());
  }, []);

  // Persist font size to localStorage
  useEffect(() => {
    localStorage.setItem('audiobash-font-size', fontSize.toString());
  }, [fontSize]);

  // Listen for terminal closed events
  useEffect(() => {
    const cleanup = window.electron?.onTerminalClosed((tabId: string) => {
      // If a terminal is closed externally (e.g., exit command), handle it
      setTabs(prev => {
        const remaining = prev.filter(t => t.id !== tabId);
        if (remaining.length === 0) {
          // If all tabs are closed, create a new one
          const newTabId = `tab-${tabCounter + 1}`;
          setTabCounter(c => c + 1);
          window.electron?.createTerminal(newTabId);
          setActiveTabId(newTabId);
          return [{ id: newTabId, title: getDefaultShellName(), isActive: true }];
        }
        // If active tab was closed, switch to another
        if (activeTabId === tabId) {
          const newActive = remaining[remaining.length - 1];
          setActiveTabId(newActive.id);
          return remaining.map(t => ({ ...t, isActive: t.id === newActive.id }));
        }
        return remaining;
      });
    });
    return () => cleanup?.();
  }, [activeTabId, tabCounter]);

  // Open overlay when recording starts
  useEffect(() => {
    if (isRecording) {
      setVoiceOverlayOpen(true);
      setStatus('recording');
    } else {
      setStatus('idle');
    }
  }, [isRecording]);

  // Listen for Alt+S to open overlay
  useEffect(() => {
    const handleToggle = () => {
      setVoiceOverlayOpen(true);
    };
    const cleanup = window.electron?.onToggleRecording(handleToggle);
    return () => cleanup?.();
  }, []);

  // Listen for Alt+M to toggle voice mode
  useEffect(() => {
    const handleToggleMode = () => {
      setVoiceMode(prev => prev === 'agent' ? 'raw' : 'agent');
    };
    const cleanup = window.electron?.onToggleMode(handleToggleMode);
    return () => cleanup?.();
  }, []);

  // Listen for Alt+C to clear terminal
  useEffect(() => {
    const handleClearTerminal = async () => {
      const context = await window.electron?.getTerminalContext(activeTabId);
      const clearCmd = context?.os === 'windows' ? 'cls' : 'clear';
      window.electron?.sendToTerminal(activeTabId, clearCmd);
    };
    const cleanup = window.electron?.onClearTerminal(handleClearTerminal);
    return () => cleanup?.();
  }, [activeTabId]);

  // Pane management shortcut listeners
  useEffect(() => {
    const cleanups = [
      window.electron?.onSplitHorizontal(() => paneManagerRef.current?.splitHorizontal()),
      window.electron?.onSplitVertical(() => paneManagerRef.current?.splitVertical()),
      window.electron?.onClosePane(() => paneManagerRef.current?.closeCurrentPane()),
      window.electron?.onZoomPane(() => paneManagerRef.current?.toggleZoom()),
      window.electron?.onResizePane((direction) => paneManagerRef.current?.resizeByDirection(direction)),
    ];
    return () => cleanups.forEach(c => c?.());
  }, []);

  const handleTranscript = useCallback((text: string, mode: 'agent' | 'raw') => {
    setTranscript(text);
    setStatus('idle');

    if (!text.trim()) return;

    // Save for resend feature
    setLastTranscript({ text, mode });

    if (autoSend) {
      if (previewBeforeExecute) {
        window.electron?.insertToTerminal(activeTabId, text);
      } else {
        window.electron?.sendToTerminal(activeTabId, text);
      }
    }
  }, [autoSend, previewBeforeExecute, activeTabId]);

  const handleCloseOverlay = useCallback(() => {
    if (!isPinned) {
      setVoiceOverlayOpen(false);
    }
  }, [isPinned]);

  const handleOpenVoicePanel = useCallback(() => {
    setVoiceOverlayOpen(true);
  }, []);

  const handleOpenDirectoryPicker = useCallback(() => {
    setDirectoryPickerOpen(prev => !prev);
  }, []);

  // Tab management functions
  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setTabs(prev => prev.map(t => ({ ...t, isActive: t.id === tabId })));
  }, []);

  const handleNewTab = useCallback(async () => {
    if (tabs.length >= MAX_TABS) return;

    const newTabId = `tab-${tabCounter + 1}`;
    setTabCounter(c => c + 1);

    const result = await window.electron?.createTerminal(newTabId);
    if (result?.success) {
      setTabs(prev => [
        ...prev.map(t => ({ ...t, isActive: false })),
        { id: newTabId, title: getDefaultShellName(), isActive: true }
      ]);
      setActiveTabId(newTabId);
    }
  }, [tabs.length, tabCounter]);

  const handleCloseTab = useCallback(async (tabId: string) => {
    if (tabs.length <= 1) return; // Don't close last tab

    await window.electron?.closeTerminal(tabId);

    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId);
      // If we closed the active tab, switch to another
      if (activeTabId === tabId && remaining.length > 0) {
        const newActive = remaining[remaining.length - 1];
        setActiveTabId(newActive.id);
        return remaining.map(t => ({ ...t, isActive: t.id === newActive.id }));
      }
      return remaining;
    });
  }, [tabs.length, activeTabId]);

  const handleRenameTab = useCallback((tabId: string, newTitle: string) => {
    setTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, title: newTitle } : tab
    ));
  }, []);

  // PaneManager terminal lifecycle callbacks
  const handleCreateTerminal = useCallback(async (): Promise<string> => {
    const newTabId = `tab-${tabCounter + 1}`;
    setTabCounter(c => c + 1);

    const result = await window.electron?.createTerminal(newTabId);
    if (result?.success) {
      setTabs(prev => [
        ...prev.map(t => ({ ...t, isActive: false })),
        { id: newTabId, title: getDefaultShellName(), isActive: true }
      ]);
      setActiveTabId(newTabId);
    }
    return newTabId;
  }, [tabCounter]);

  const handleCloseTerminal = useCallback((tabId: string) => {
    window.electron?.closeTerminal(tabId);
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId);
      if (remaining.length === 0) return prev;
      if (activeTabId === tabId) {
        const newActive = remaining[remaining.length - 1];
        setActiveTabId(newActive.id);
        return remaining.map(t => ({ ...t, isActive: t.id === newActive.id }));
      }
      return remaining;
    });
  }, [activeTabId]);

  // Listen for Alt+L to cycle layout (delegates to PaneManager)
  useEffect(() => {
    const cleanup = window.electron?.onCycleLayout(() => paneManagerRef.current?.cyclePreset());
    return () => cleanup?.();
  }, []);

  // Listen for Alt+Right/Left to focus next/prev terminal (delegates to PaneManager)
  useEffect(() => {
    const cleanup = window.electron?.onFocusNextTerminal(() => paneManagerRef.current?.focusNext());
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const cleanup = window.electron?.onFocusPrevTerminal(() => paneManagerRef.current?.focusPrev());
    return () => cleanup?.();
  }, []);

  // Listen for Alt+B to bookmark current directory
  useEffect(() => {
    const handleBookmark = async () => {
      const context = await window.electron?.getTerminalContext(activeTabId);
      if (context?.cwd) {
        const result = await window.electron?.addFavoriteDirectory(context.cwd);
        if (result?.success) {
          // Could show a toast notification here
          console.log('[AudioBash] Bookmarked:', context.cwd);
        }
      }
    };
    const cleanup = window.electron?.onBookmarkDirectory(handleBookmark);
    return () => cleanup?.();
  }, [activeTabId]);

  // Listen for Alt+R to resend last transcription
  useEffect(() => {
    const handleResend = () => {
      if (lastTranscript) {
        window.electron?.sendToTerminal(activeTabId, lastTranscript.text);
      }
    };
    const cleanup = window.electron?.onResendLast(handleResend);
    return () => cleanup?.();
  }, [lastTranscript, activeTabId]);

  // Listen for Alt+1-4 to switch tabs
  useEffect(() => {
    const handleSwitchTab = (index: number) => {
      if (index < tabs.length) {
        handleSelectTab(tabs[index].id);
        paneManagerRef.current?.focusByIndex(index);
      }
    };
    const cleanup = window.electron?.onSwitchTab(handleSwitchTab);
    return () => cleanup?.();
  }, [tabs, handleSelectTab]);

  // Listen for Alt+P to toggle preview pane
  useEffect(() => {
    const handleTogglePreview = () => {
      setPreviewVisible(prev => {
        const newValue = !prev;
        localStorage.setItem('audiobash-preview-visible', String(newValue));
        return newValue;
      });
    };
    const cleanup = window.electron?.onTogglePreview(handleTogglePreview);
    return () => cleanup?.();
  }, []);

  // Save preview position to localStorage
  useEffect(() => {
    localStorage.setItem('audiobash-preview-position', previewPosition);
  }, [previewPosition]);

  // Handle preview position change
  const handlePreviewPositionChange = useCallback((position: PreviewPosition) => {
    setPreviewPosition(position);
  }, []);

  // Handle preview close
  const handlePreviewClose = useCallback(() => {
    setPreviewVisible(false);
    localStorage.setItem('audiobash-preview-visible', 'false');
  }, []);

  // Handle screenshot taken
  const handleScreenshotTaken = useCallback((result: ScreenshotResult) => {
    if (result.success && result.path) {
      // Log to console - user can paste path manually if needed
      console.log('[AudioBash] Screenshot saved:', result.path);
    }
  }, []);

  // Handle preview resize (right sidebar)
  const handlePreviewResizeHorizontal = useCallback((delta: number) => {
    const containerWidth = window.innerWidth;
    const deltaPercent = (delta / containerWidth) * 100;
    setPreviewWidth(prev => Math.max(20, Math.min(60, prev - deltaPercent)));
  }, []);

  // Handle preview resize (bottom panel)
  const handlePreviewResizeVertical = useCallback((delta: number) => {
    const containerHeight = window.innerHeight;
    const deltaPercent = (delta / containerHeight) * 100;
    setPreviewHeight(prev => Math.max(15, Math.min(50, prev - deltaPercent)));
  }, []);

  return (
    <div className="h-screen flex flex-col bg-void overflow-hidden">
      {/* Custom title bar */}
      <TitleBar onSettingsClick={() => setShowSettings(true)} />

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onNewTab={handleNewTab}
        onCloseTab={handleCloseTab}
        onRenameTab={handleRenameTab}
        canAddTab={tabs.length < MAX_TABS}
      />

      {/* Main content - Terminal + Preview layout */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Main area with optional preview pane */}
        <div className={`flex-1 min-h-0 flex ${previewVisible && previewPosition === 'bottom' ? 'flex-col' : 'flex-row'}`}>
          {/* Terminal area */}
          <div
            className="min-h-0 min-w-0 overflow-hidden"
            style={{
              flex: previewVisible && previewPosition === 'right'
                ? `0 0 ${100 - previewWidth}%`
                : previewVisible && previewPosition === 'bottom'
                ? `0 0 ${100 - previewHeight}%`
                : '1 1 auto',
            }}
          >
            <PaneManager
              ref={paneManagerRef}
              initialTerminalId={tabs[0]?.id || 'tab-1'}
              isRecording={isRecording}
              cliNotificationsEnabled={cliNotificationsEnabled}
              fontSize={fontSize}
              onCreateTerminal={handleCreateTerminal}
              onCloseTerminal={handleCloseTerminal}
            />
          </div>

          {/* Preview pane - right sidebar */}
          {previewVisible && previewPosition === 'right' && (
            <>
              <PaneDivider
                direction="vertical"
                onResize={handlePreviewResizeHorizontal}
                onEqualize={() => setPreviewWidth(40)}
              />
              <div style={{ flex: `0 0 ${previewWidth}%` }} className="min-w-0">
                <PreviewPane
                  isVisible={true}
                  position={previewPosition}
                  onPositionChange={handlePreviewPositionChange}
                  onClose={handlePreviewClose}
                  autoRefresh={previewAutoRefresh}
                  activeTabId={activeTabId}
                  onScreenshotTaken={handleScreenshotTaken}
                />
              </div>
            </>
          )}

          {/* Preview pane - bottom panel */}
          {previewVisible && previewPosition === 'bottom' && (
            <>
              <PaneDivider
                direction="horizontal"
                onResize={handlePreviewResizeVertical}
                onEqualize={() => setPreviewHeight(35)}
              />
              <div style={{ flex: `0 0 ${previewHeight}%` }} className="min-h-0">
                <PreviewPane
                  isVisible={true}
                  position={previewPosition}
                  onPositionChange={handlePreviewPositionChange}
                  onClose={handlePreviewClose}
                  autoRefresh={previewAutoRefresh}
                  activeTabId={activeTabId}
                  onScreenshotTaken={handleScreenshotTaken}
                />
              </div>
            </>
          )}

          {/* Preview pane - as a "pane" (right sidebar style for now) */}
          {previewVisible && previewPosition === 'pane' && (
            <>
              <PaneDivider
                direction="vertical"
                onResize={handlePreviewResizeHorizontal}
                onEqualize={() => setPreviewWidth(40)}
              />
              <div style={{ flex: `0 0 ${previewWidth}%` }} className="min-w-0">
                <PreviewPane
                  isVisible={true}
                  position={previewPosition}
                  onPositionChange={handlePreviewPositionChange}
                  onClose={handlePreviewClose}
                  autoRefresh={previewAutoRefresh}
                  activeTabId={activeTabId}
                  onScreenshotTaken={handleScreenshotTaken}
                />
              </div>
            </>
          )}
        </div>

        {/* Status indicator bar at bottom */}
        <StatusIndicator
          isRecording={isRecording}
          model={model}
          status={status}
          apiConnected={!!apiKey || model === 'parakeet-local'}
          onOpenVoicePanel={handleOpenVoicePanel}
          onOpenDirectoryPicker={handleOpenDirectoryPicker}
          onOpenConsoleErrors={() => setConsoleErrorViewerOpen(true)}
        />

        {/* Directory picker overlay */}
        <DirectoryPicker
          isOpen={directoryPickerOpen}
          onClose={() => setDirectoryPickerOpen(false)}
          activeTabId={activeTabId}
        />

        {/* Console error viewer */}
        <ConsoleErrorViewer
          isOpen={consoleErrorViewerOpen}
          onClose={() => setConsoleErrorViewerOpen(false)}
        />

        {/* Floating voice overlay */}
        <VoiceOverlay
          isOpen={voiceOverlayOpen}
          isRecording={isRecording}
          setIsRecording={setIsRecording}
          onTranscript={handleTranscript}
          transcript={transcript}
          onClose={handleCloseOverlay}
          isPinned={isPinned}
          setIsPinned={setIsPinned}
          activeTabId={activeTabId}
          mode={voiceMode}
          setMode={setVoiceMode}
        />
      </div>

      {/* Settings modal */}
      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onReplayOnboarding={() => {
          setShowSettings(false);
          setShowOnboarding(true);
        }}
      />

      {/* Onboarding modal */}
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  );
};

export default App;
