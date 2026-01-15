/**
 * ConnectionModal - Modal for connecting to AudioBash desktop
 *
 * Provides QR code scanning and manual connection options
 */

import React, { useState, useCallback, useEffect } from 'react';
import QRScanner from './QRScanner';

export interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (url: string, code: string) => void;
  connecting?: boolean;
  error?: string | null;
}

type ConnectionTab = 'scan' | 'manual';

/**
 * Modal dialog for establishing connection to AudioBash desktop
 */
export function ConnectionModal({
  isOpen,
  onClose,
  onConnect,
  connecting = false,
  error = null,
}: ConnectionModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<ConnectionTab>('scan');
  const [showScanner, setShowScanner] = useState(false);
  const [url, setUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  // Clear errors when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
    }
  }, [isOpen]);

  // Handle QR scan result
  const handleScan = useCallback((data: { url: string; code: string; name?: string }) => {
    setShowScanner(false);
    setUrl(data.url);
    setPairingCode(data.code);
    setLocalError(null);

    // Auto-connect when QR is scanned
    if (data.url && data.code) {
      if (remember) {
        try {
          localStorage.setItem('audiobash_last_url', data.url);
          localStorage.setItem('audiobash_remember', 'true');
        } catch {
          // Ignore localStorage errors
        }
      }
      onConnect(data.url, data.code);
    }
  }, [onConnect, remember]);

  // Handle QR scan error
  const handleScanError = useCallback((errorMsg: string) => {
    setLocalError(errorMsg);
    setShowScanner(false);
  }, []);

  // Handle manual connection
  const handleManualConnect = useCallback(() => {
    if (!url.trim()) {
      setLocalError('Please enter a server URL');
      return;
    }
    if (!pairingCode.trim() || pairingCode.length !== 6) {
      setLocalError('Please enter a valid 6-character pairing code');
      return;
    }

    setLocalError(null);

    if (remember) {
      try {
        localStorage.setItem('audiobash_last_url', url.trim());
        localStorage.setItem('audiobash_remember', 'true');
      } catch {
        // Ignore localStorage errors
      }
    }

    onConnect(url.trim(), pairingCode.trim().toUpperCase());
  }, [url, pairingCode, remember, onConnect]);

  // Handle pairing code input - auto uppercase and limit to 6 chars
  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setPairingCode(value);
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && activeTab === 'manual' && !connecting) {
      handleManualConnect();
    }
  }, [onClose, activeTab, connecting, handleManualConnect]);

  // Load last URL from localStorage
  useEffect(() => {
    if (isOpen) {
      try {
        const lastUrl = localStorage.getItem('audiobash_last_url');
        const shouldRemember = localStorage.getItem('audiobash_remember') === 'true';
        if (lastUrl && shouldRemember) {
          setUrl(lastUrl);
        }
        setRemember(shouldRemember);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const displayError = error || localError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/90"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="connection-modal-title"
    >
      <div
        className="w-full max-w-md mx-4 bg-void-100 border border-void-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-void-300">
          <h2 id="connection-modal-title" className="font-display font-semibold text-crt-white">
            CONNECT TO DESKTOP
          </h2>
          <button
            onClick={onClose}
            className="text-chrome/60 hover:text-chrome transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="square" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-void-300">
          <button
            className={`flex-1 px-4 py-2 font-mono text-sm transition-colors ${
              activeTab === 'scan'
                ? 'bg-void-200 text-acid border-b-2 border-acid'
                : 'text-chrome/60 hover:text-chrome'
            }`}
            onClick={() => setActiveTab('scan')}
          >
            SCAN QR
          </button>
          <button
            className={`flex-1 px-4 py-2 font-mono text-sm transition-colors ${
              activeTab === 'manual'
                ? 'bg-void-200 text-acid border-b-2 border-acid'
                : 'text-chrome/60 hover:text-chrome'
            }`}
            onClick={() => setActiveTab('manual')}
          >
            MANUAL
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {showScanner ? (
            <QRScanner
              onScan={handleScan}
              onError={handleScanError}
              onClose={() => setShowScanner(false)}
            />
          ) : activeTab === 'scan' ? (
            <div className="space-y-4">
              <p className="font-mono text-sm text-chrome/80">
                Scan the QR code shown in AudioBash desktop to connect instantly.
              </p>

              <button
                onClick={() => setShowScanner(true)}
                className="w-full py-4 bg-void-200 border border-acid text-acid font-display font-semibold uppercase tracking-wider hover:bg-acid hover:text-void transition-colors flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="square"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h3a1 1 0 010 2H4v3a1 1 0 01-2 0V4zm18 0a1 1 0 00-1-1h-3a1 1 0 000 2h3v3a1 1 0 002 0V4zM3 20a1 1 0 001 1h3a1 1 0 000-2H4v-3a1 1 0 00-2 0v4zm18 0a1 1 0 01-1 1h-3a1 1 0 010-2h3v-3a1 1 0 012 0v4z"
                  />
                  <rect x="7" y="7" width="10" height="10" strokeWidth={2} />
                </svg>
                OPEN CAMERA
              </button>

              <p className="font-mono text-xs text-chrome/50 text-center">
                Camera permission required for scanning
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="url-input" className="block font-mono text-xs text-chrome/60 uppercase">
                  Server URL
                </label>
                <input
                  id="url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="ws://192.168.1.x:3457"
                  className="w-full px-3 py-2 bg-void-200 border border-void-300 text-crt-white font-mono text-sm placeholder:text-chrome/30 focus:border-acid focus:outline-none"
                  disabled={connecting}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="code-input" className="block font-mono text-xs text-chrome/60 uppercase">
                  Pairing Code
                </label>
                <input
                  id="code-input"
                  type="text"
                  value={pairingCode}
                  onChange={handleCodeChange}
                  placeholder="ABC123"
                  maxLength={6}
                  className="w-full px-3 py-2 bg-void-200 border border-void-300 text-crt-white font-mono text-lg tracking-[0.5em] text-center uppercase placeholder:text-chrome/30 placeholder:tracking-normal focus:border-acid focus:outline-none"
                  disabled={connecting}
                />
                <p className="font-mono text-xs text-chrome/50">
                  Enter the 6-character code shown on your desktop
                </p>
              </div>

              {/* Remember toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-5 h-5 border flex items-center justify-center transition-colors ${
                    remember ? 'bg-acid border-acid' : 'bg-void-200 border-void-300'
                  }`}
                  role="checkbox"
                  aria-checked={remember}
                >
                  {remember && (
                    <svg className="w-3 h-3 text-void" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="square" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="sr-only"
                />
                <span className="font-mono text-sm text-chrome/80">
                  Remember this connection
                </span>
              </label>

              <button
                onClick={handleManualConnect}
                disabled={connecting || !url.trim() || pairingCode.length !== 6}
                className="w-full py-3 bg-void-200 border border-acid text-acid font-display font-semibold uppercase tracking-wider hover:bg-acid hover:text-void transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-void-200 disabled:hover:text-acid"
              >
                {connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    CONNECTING...
                  </span>
                ) : (
                  'CONNECT'
                )}
              </button>
            </div>
          )}

          {/* Error Display */}
          {displayError && (
            <div className="mt-4 px-3 py-2 bg-accent/10 border border-accent text-accent font-mono text-sm">
              {displayError}
            </div>
          )}

          {/* Connection Status */}
          {connecting && (
            <div className="mt-4 text-center">
              <p className="font-mono text-sm text-chrome/60">
                Establishing secure connection...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConnectionModal;
