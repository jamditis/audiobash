/**
 * StatusBar - Top status bar showing connection state
 *
 * Displays connection indicator, desktop name, and action buttons
 */

import React, { useCallback } from 'react';

export interface StatusBarProps {
  connected: boolean;
  desktopName?: string;
  tunnelUrl?: string;
  onSettingsClick?: () => void;
  onDisconnect?: () => void;
}

/**
 * Status bar component for displaying connection state
 */
export function StatusBar({
  connected,
  desktopName,
  tunnelUrl,
  onSettingsClick,
  onDisconnect,
}: StatusBarProps): React.ReactElement {
  // Handle disconnect with confirmation for tunnel connections
  const handleDisconnect = useCallback(() => {
    if (tunnelUrl) {
      // Tunneled connections may be harder to re-establish
      const confirmed = window.confirm(
        'Disconnect from AudioBash? You may need to scan a new QR code to reconnect.'
      );
      if (!confirmed) return;
    }
    onDisconnect?.();
  }, [tunnelUrl, onDisconnect]);

  return (
    <header className="bg-void-100 border-b border-void-300 px-4 py-3 safe-area-top">
      <div className="flex items-center justify-between">
        {/* Left: Logo and title */}
        <div className="flex items-center gap-3">
          <h1 className="font-display font-bold text-lg text-chrome tracking-wide">
            AUDIOBASH<span className="text-acid">_</span>REMOTE
          </h1>
        </div>

        {/* Right: Status and actions */}
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 ${
                connected
                  ? 'bg-crt-green shadow-[0_0_8px_rgba(51,255,51,0.6)]'
                  : 'bg-accent animate-pulse'
              }`}
              role="status"
              aria-label={connected ? 'Connected' : 'Disconnected'}
            />
            <span className="font-mono text-xs text-chrome/60 uppercase hidden sm:inline">
              {connected ? (desktopName || 'CONNECTED') : 'DISCONNECTED'}
            </span>
          </div>

          {/* Tunnel indicator */}
          {connected && tunnelUrl && (
            <div
              className="px-2 py-0.5 bg-void-200 border border-crt-blue text-crt-blue font-mono text-[10px] uppercase"
              title={`Connected via tunnel: ${tunnelUrl}`}
            >
              TUNNEL
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Settings button */}
            {onSettingsClick && (
              <button
                onClick={onSettingsClick}
                className="p-2 text-chrome/60 hover:text-chrome transition-colors"
                aria-label="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="square"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="square"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            )}

            {/* Disconnect button - only shown when connected */}
            {connected && onDisconnect && (
              <button
                onClick={handleDisconnect}
                className="p-2 text-chrome/60 hover:text-accent transition-colors"
                aria-label="Disconnect"
                title="Disconnect from desktop"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="square"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop name row (when connected and name is long) */}
      {connected && desktopName && desktopName.length > 15 && (
        <div className="mt-2 pt-2 border-t border-void-300">
          <p className="font-mono text-xs text-chrome/60 truncate">
            <span className="text-crt-green">&#9679;</span>{' '}
            Connected to: <span className="text-chrome">{desktopName}</span>
          </p>
        </div>
      )}
    </header>
  );
}

export default StatusBar;
