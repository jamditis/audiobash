import React, { useState, useEffect, useCallback } from 'react';
import Terminal from './components/Terminal';
import TabBar from './components/TabBar';
import VoiceOverlay from './components/VoiceOverlay';
import StatusIndicator from './components/StatusIndicator';
import TitleBar from './components/TitleBar';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
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

  const handleTranscript = useCallback((text: string) => {
    setTranscript(text);
    setStatus('idle');
    // Send to active terminal via IPC if autoSend is enabled
    if (autoSend && text.trim()) {
      window.electron?.sendToTerminal(activeTabId, text);
    }
  }, [autoSend, activeTabId]);

  const handleCloseOverlay = useCallback(() => {
    if (!isPinned) {
      setVoiceOverlayOpen(false);
    }
  }, [isPinned]);

  const handleOpenVoicePanel = useCallback(() => {
    setVoiceOverlayOpen(true);
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
        canAddTab={tabs.length < MAX_TABS}
      />

      {/* Main content - Terminal takes full width */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Terminals - render all but only show active */}
        <div className="flex-1 min-h-0">
          {tabs.map(tab => (
            <Terminal
              key={tab.id}
              tabId={tab.id}
              isActive={tab.id === activeTabId}
            />
          ))}
        </div>

        {/* Status indicator bar at bottom */}
        <StatusIndicator
          isRecording={isRecording}
          model={model}
          status={status}
          apiConnected={!!apiKey || model === 'parakeet-local'}
          onOpenVoicePanel={handleOpenVoicePanel}
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
