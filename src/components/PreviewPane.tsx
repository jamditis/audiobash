import React, { useState, useCallback, useEffect } from 'react';
import PreviewControls from './PreviewControls';
import PreviewRenderer from './PreviewRenderer';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { PreviewPosition, ScreenshotResult } from '../types';

interface PreviewPaneProps {
  isVisible: boolean;
  position: PreviewPosition;
  onPositionChange: (position: PreviewPosition) => void;
  onClose: () => void;
  autoRefresh?: boolean;
  activeTabId: string;
  onScreenshotTaken?: (result: ScreenshotResult) => void;
}

const PreviewPane: React.FC<PreviewPaneProps> = ({
  isVisible,
  position,
  onPositionChange,
  onClose,
  autoRefresh = true,
  activeTabId,
  onScreenshotTaken,
}) => {
  // Load saved URL from localStorage
  const [url, setUrl] = useState(() => {
    return localStorage.getItem('audiobash-preview-url') || 'http://localhost:3000';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);

  // Save URL to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('audiobash-preview-url', url);
  }, [url]);

  // File watcher for auto-refresh
  const { refresh } = useFileWatcher(url, {
    enabled: autoRefresh && isVisible,
    onFileChange: useCallback(() => {
      console.log('[Preview] Auto-refreshing due to file change');
      setRefreshKey(k => k + 1);
    }, []),
  });

  // Handle URL change
  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl);
    setRefreshKey(k => k + 1);
  }, []);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Handle screenshot capture
  const handleScreenshot = useCallback(async () => {
    if (!url) return;

    setIsLoading(true);

    try {
      // Get current working directory for the active terminal
      const context = await window.electron?.getTerminalContext(activeTabId);
      const cwd = context?.cwd || '';

      const result = await window.electron?.capturePreview(url, cwd);

      if (result?.success) {
        // Show flash effect
        setScreenshotFlash(true);
        setTimeout(() => setScreenshotFlash(false), 200);

        console.log('[Preview] Screenshot saved:', result.path);
        onScreenshotTaken?.(result);
      } else {
        console.error('[Preview] Screenshot failed:', result?.error);
      }
    } catch (err) {
      console.error('[Preview] Screenshot error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [url, activeTabId, onScreenshotTaken]);

  // Listen for global screenshot shortcut
  useEffect(() => {
    if (!isVisible) return;

    const cleanup = window.electron?.onCaptureScreenshot(() => {
      handleScreenshot();
    });

    return () => cleanup?.();
  }, [isVisible, handleScreenshot]);

  // Handle load/error callbacks
  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback((error: string) => {
    setIsLoading(false);
    console.error('[Preview] Load error:', error);
  }, []);

  if (!isVisible) return null;

  // Determine container styles based on position
  const containerClasses = {
    right: 'h-full border-l border-void-300',
    bottom: 'w-full border-t border-void-300',
    pane: 'h-full border-l border-void-300',
  };

  return (
    <div
      className={`flex flex-col bg-void ${containerClasses[position]} relative`}
      style={{
        // Default sizes - can be resized via parent
        minWidth: position === 'right' || position === 'pane' ? '300px' : undefined,
        minHeight: position === 'bottom' ? '200px' : undefined,
      }}
    >
      {/* Screenshot flash effect */}
      {screenshotFlash && (
        <div className="absolute inset-0 bg-white/30 z-50 pointer-events-none animate-pulse" />
      )}

      {/* Controls bar */}
      <PreviewControls
        url={url}
        onUrlChange={handleUrlChange}
        onRefresh={handleRefresh}
        onScreenshot={handleScreenshot}
        onClose={onClose}
        position={position}
        onPositionChange={onPositionChange}
        isLoading={isLoading}
      />

      {/* Content renderer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PreviewRenderer
          url={url}
          refreshKey={refreshKey}
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>

      {/* Status bar */}
      <div className="px-3 py-1 bg-void-100 border-t border-void-300 flex items-center justify-between">
        <span className="text-[10px] font-mono text-crt-white/30 truncate max-w-[60%]">
          {url || 'No URL'}
        </span>
        <span className="text-[10px] font-mono text-crt-white/30">
          {autoRefresh ? '↻ Auto-refresh on' : '↻ Manual refresh'}
        </span>
      </div>
    </div>
  );
};

export default PreviewPane;
