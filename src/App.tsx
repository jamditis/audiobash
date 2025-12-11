import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Terminal from './components/Terminal';
import TabBar from './components/TabBar';
import VoiceOverlay from './components/VoiceOverlay';
import StatusIndicator from './components/StatusIndicator';
import DirectoryPicker from './components/DirectoryPicker';
import TitleBar from './components/TitleBar';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
import SplitContainer, { SplitLayoutState, PaneConfig } from './components/SplitContainer';
import { LayoutMode } from './components/LayoutSelector';
import { TerminalTab } from './types';
import { transcriptionService } from './services/transcriptionService';

const MAX_TABS = 4;

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [autoSend, setAutoSend] = useState(true);

  // Tab management state
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'tab-1', title: 'PowerShell', isActive: true }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [tabCounter, setTabCounter] = useState(1);

  // New state for overlay behavior
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [apiKey, setApiKey] = useState('');

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // CLI notifications state
  const [cliNotificationsEnabled, setCliNotificationsEnabled] = useState(true);

  // Directory picker state
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);

  // Split view layout state
  const [layoutState, setLayoutState] = useState<SplitLayoutState>({
    mode: 'single',
    panes: [{ terminalId: 'tab-1', size: 100 }],
    focusedTerminalId: 'tab-1',
  });

  // Voice mode state (shared with VoiceOverlay)
  const [voiceMode, setVoiceMode] = useState<'agent' | 'raw'>('agent');

  // Last transcript for resend feature
  const [lastTranscript, setLastTranscript] = useState<{ text: string; mode: 'agent' | 'raw' } | null>(null);

  // Load settings and check onboarding
  useEffect(() => {
    const savedAutoSend = localStorage.getItem('audiobash-autosend');
    if (savedAutoSend !== null) {
      setAutoSend(savedAutoSend === 'true');
    }

    const savedModel = localStorage.getItem('audiobash-model');
    if (savedModel) setModel(savedModel);

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
      const savedModel = localStorage.getItem('audiobash-model');
      if (savedModel) setModel(savedModel);

      const savedCliNotifications = localStorage.getItem('audiobash-cli-notifications');
      if (savedCliNotifications !== null) {
        setCliNotificationsEnabled(savedCliNotifications === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
          return [{ id: newTabId, title: 'PowerShell', isActive: true }];
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
    const handleClearTerminal = () => {
      const targetId = layoutState.mode !== 'single' ? layoutState.focusedTerminalId : activeTabId;
      // Send clear command based on OS
      const clearCmd = process.platform === 'win32' ? 'cls' : 'clear';
      window.electron?.sendToTerminal(targetId, clearCmd);
    };
    const cleanup = window.electron?.onClearTerminal(handleClearTerminal);
    return () => cleanup?.();
  }, [activeTabId, layoutState.mode, layoutState.focusedTerminalId]);


  const handleTranscript = useCallback((text: string, mode: 'agent' | 'raw') => {
    setTranscript(text);
    setStatus('idle');

    if (!text.trim()) return;

    // Save for resend feature
    setLastTranscript({ text, mode });

    // Both modes: send text to terminal with Enter when autoSend is enabled
    // Agent mode: text is a converted CLI command
    // Raw mode: text is verbatim transcription (for talking to Claude Code, etc.)
    // Send to focused terminal in split view, or active tab in single view
    if (autoSend) {
      const targetTerminalId = layoutState.mode !== 'single'
        ? layoutState.focusedTerminalId
        : activeTabId;
      window.electron?.sendToTerminal(targetTerminalId, text);
    }
  }, [autoSend, activeTabId, layoutState.mode, layoutState.focusedTerminalId]);

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
        { id: newTabId, title: 'PowerShell', isActive: true }
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

  // Layout management functions
  const handleSelectLayout = useCallback((mode: LayoutMode) => {
    // Build panes array based on available tabs and layout mode
    const requiredPanes = mode === 'single' ? 1
      : mode === 'split-horizontal' || mode === 'split-vertical' ? 2
      : mode === 'grid-2x2' ? 4
      : 3; // grid-3

    const panes: PaneConfig[] = tabs.slice(0, requiredPanes).map((tab, index) => ({
      terminalId: tab.id,
      size: mode === 'grid-3' && index === 0 ? 60 : 100 / requiredPanes,
    }));

    // Ensure focused terminal is in the visible panes
    const focusedId = panes.some(p => p.terminalId === layoutState.focusedTerminalId)
      ? layoutState.focusedTerminalId
      : panes[0]?.terminalId || tabs[0]?.id;

    setLayoutState({
      mode,
      panes,
      focusedTerminalId: focusedId,
    });
  }, [tabs, layoutState.focusedTerminalId]);

  const handleFocusTerminal = useCallback((terminalId: string) => {
    setLayoutState(prev => ({
      ...prev,
      focusedTerminalId: terminalId,
    }));
  }, []);

  const handlePaneResize = useCallback((paneIndex: number, delta: number) => {
    setLayoutState(prev => {
      const newPanes = [...prev.panes];
      const containerSize = prev.mode === 'split-horizontal' || prev.mode === 'grid-3'
        ? window.innerWidth
        : window.innerHeight;

      const deltaPercent = (delta / containerSize) * 100;
      const minSize = 15; // Minimum 15%

      if (paneIndex < newPanes.length - 1) {
        const newSize0 = newPanes[paneIndex].size + deltaPercent;
        const newSize1 = newPanes[paneIndex + 1].size - deltaPercent;

        if (newSize0 >= minSize && newSize1 >= minSize) {
          newPanes[paneIndex] = { ...newPanes[paneIndex], size: newSize0 };
          newPanes[paneIndex + 1] = { ...newPanes[paneIndex + 1], size: newSize1 };
        }
      }

      return { ...prev, panes: newPanes };
    });
  }, []);

  // Listen for Alt+L to cycle layout
  useEffect(() => {
    const layouts: LayoutMode[] = ['single', 'split-horizontal', 'split-vertical', 'grid-2x2', 'grid-3'];
    const handleCycleLayout = () => {
      const currentIndex = layouts.indexOf(layoutState.mode);
      const nextIndex = (currentIndex + 1) % layouts.length;
      const nextMode = layouts[nextIndex];

      // Only switch if we have enough tabs
      const requiredTabs = nextMode === 'single' ? 1
        : nextMode === 'split-horizontal' || nextMode === 'split-vertical' ? 2
        : nextMode === 'grid-2x2' ? 4 : 3;

      if (tabs.length >= requiredTabs) {
        handleSelectLayout(nextMode);
      } else {
        // Skip to next valid layout
        for (let i = 1; i < layouts.length; i++) {
          const tryIndex = (nextIndex + i) % layouts.length;
          const tryMode = layouts[tryIndex];
          const tryRequired = tryMode === 'single' ? 1
            : tryMode === 'split-horizontal' || tryMode === 'split-vertical' ? 2
            : tryMode === 'grid-2x2' ? 4 : 3;
          if (tabs.length >= tryRequired) {
            handleSelectLayout(tryMode);
            break;
          }
        }
      }
    };
    const cleanup = window.electron?.onCycleLayout(handleCycleLayout);
    return () => cleanup?.();
  }, [layoutState.mode, tabs.length, handleSelectLayout]);

  // Listen for Alt+Right/Left to focus next/prev terminal
  useEffect(() => {
    const handleFocusNext = () => {
      if (layoutState.mode === 'single') return;
      const paneIds = layoutState.panes.map(p => p.terminalId);
      const currentIndex = paneIds.indexOf(layoutState.focusedTerminalId);
      const nextIndex = (currentIndex + 1) % paneIds.length;
      handleFocusTerminal(paneIds[nextIndex]);
    };
    const cleanup = window.electron?.onFocusNextTerminal(handleFocusNext);
    return () => cleanup?.();
  }, [layoutState, handleFocusTerminal]);

  useEffect(() => {
    const handleFocusPrev = () => {
      if (layoutState.mode === 'single') return;
      const paneIds = layoutState.panes.map(p => p.terminalId);
      const currentIndex = paneIds.indexOf(layoutState.focusedTerminalId);
      const prevIndex = (currentIndex - 1 + paneIds.length) % paneIds.length;
      handleFocusTerminal(paneIds[prevIndex]);
    };
    const cleanup = window.electron?.onFocusPrevTerminal(handleFocusPrev);
    return () => cleanup?.();
  }, [layoutState, handleFocusTerminal]);

  // Listen for Alt+B to bookmark current directory
  useEffect(() => {
    const handleBookmark = async () => {
      const targetId = layoutState.mode !== 'single' ? layoutState.focusedTerminalId : activeTabId;
      const context = await window.electron?.getTerminalContext(targetId);
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
  }, [activeTabId, layoutState.mode, layoutState.focusedTerminalId]);

  // Listen for Alt+R to resend last transcription
  useEffect(() => {
    const handleResend = () => {
      if (lastTranscript) {
        const targetId = layoutState.mode !== 'single' ? layoutState.focusedTerminalId : activeTabId;
        window.electron?.sendToTerminal(targetId, lastTranscript.text);
      }
    };
    const cleanup = window.electron?.onResendLast(handleResend);
    return () => cleanup?.();
  }, [lastTranscript, activeTabId, layoutState.mode, layoutState.focusedTerminalId]);

  // Listen for Alt+1-4 to switch tabs
  useEffect(() => {
    const handleSwitchTab = (index: number) => {
      if (index < tabs.length) {
        const tab = tabs[index];
        handleSelectTab(tab.id);
      }
    };
    const cleanup = window.electron?.onSwitchTab(handleSwitchTab);
    return () => cleanup?.();
  }, [tabs, handleSelectTab]);

  // Compute visible terminals based on layout mode
  const visibleTerminalIds = useMemo(() => {
    if (layoutState.mode === 'single') {
      return new Set([activeTabId]);
    }
    return new Set(layoutState.panes.map(p => p.terminalId));
  }, [layoutState.mode, layoutState.panes, activeTabId]);

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
        layoutMode={layoutState.mode}
        onSelectLayout={handleSelectLayout}
      />

      {/* Main content - Terminal takes full width */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Terminals - use SplitContainer for multi-pane layouts */}
        <div className="flex-1 min-h-0">
          {layoutState.mode === 'single' ? (
            // Single mode: render all terminals but only show active
            tabs.map(tab => (
              <Terminal
                key={tab.id}
                tabId={tab.id}
                isActive={tab.id === activeTabId}
                cliNotificationsEnabled={cliNotificationsEnabled}
              />
            ))
          ) : (
            // Split/grid mode: use SplitContainer
            <SplitContainer
              layoutState={layoutState}
              onPaneResize={handlePaneResize}
            >
              {layoutState.panes.map(pane => (
                <Terminal
                  key={pane.terminalId}
                  tabId={pane.terminalId}
                  isActive={true}
                  isVisible={true}
                  isFocused={pane.terminalId === layoutState.focusedTerminalId}
                  isRecording={isRecording}
                  onFocus={() => handleFocusTerminal(pane.terminalId)}
                  cliNotificationsEnabled={cliNotificationsEnabled}
                />
              ))}
            </SplitContainer>
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
        />

        {/* Directory picker overlay */}
        <DirectoryPicker
          isOpen={directoryPickerOpen}
          onClose={() => setDirectoryPickerOpen(false)}
          activeTabId={activeTabId}
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
