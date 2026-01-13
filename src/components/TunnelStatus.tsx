import React, { useState, useEffect } from 'react';
import type { TunnelProvider, TunnelStatus, TunnelBinaryCheck, ProviderBinaryCheck } from '../types';

interface TunnelStatusProps {
  onStatusChange?: (status: TunnelStatus) => void;
}

const TunnelStatusComponent: React.FC<TunnelStatusProps> = ({ onStatusChange }) => {
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>({
    status: 'disconnected',
    tunnelUrl: null,
    error: null,
  });
  const [enabled, setEnabled] = useState(false);
  const [binaryCheck, setBinaryCheck] = useState<TunnelBinaryCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [provider, setProvider] = useState<TunnelProvider>('cloudflare');

  // Load initial status and settings
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await window.electron?.tunnelGetStatus();
        if (status) {
          setTunnelStatus(status);
        }

        const isEnabled = await window.electron?.getTunnelEnabled();
        setEnabled(isEnabled || false);

        const binary = await window.electron?.tunnelCheckBinary();
        if (binary) {
          setBinaryCheck(binary);
        }
      } catch (err) {
        console.error('[TunnelStatus] Failed to load status:', err);
      }
    };

    loadStatus();

    // Listen for status changes from main process
    const cleanup = window.electron?.onTunnelStatusChanged?.((status: TunnelStatus) => {
      setTunnelStatus(status);
      onStatusChange?.(status);
    });

    return () => cleanup?.();
  }, [onStatusChange]);

  const handleToggle = async () => {
    if (tunnelStatus.status === 'connected' || tunnelStatus.status === 'connecting') {
      // Stop tunnel
      setChecking(true);
      try {
        await window.electron?.tunnelStop();
        await window.electron?.setTunnelEnabled(false);
        setEnabled(false);
      } catch (err) {
        console.error('[TunnelStatus] Failed to stop tunnel:', err);
      } finally {
        setChecking(false);
      }
    } else {
      // Start tunnel
      setChecking(true);
      try {
        const result = await window.electron?.tunnelStart(8765, provider);
        if (result?.success) {
          await window.electron?.setTunnelEnabled(true);
          setEnabled(true);
        } else {
          console.error('[TunnelStatus] Failed to start tunnel:', result?.error);
        }
      } catch (err) {
        console.error('[TunnelStatus] Failed to start tunnel:', err);
      } finally {
        setChecking(false);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('[TunnelStatus] Copied to clipboard:', text);
    });
  };

  const getStatusColor = () => {
    switch (tunnelStatus.status) {
      case 'connected':
        return 'bg-crt-green';
      case 'connecting':
        return 'bg-crt-amber animate-pulse';
      case 'error':
        return 'bg-accent';
      default:
        return 'bg-void-300';
    }
  };

  const getStatusText = () => {
    switch (tunnelStatus.status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return `Error: ${tunnelStatus.error}`;
      default:
        return 'Disconnected';
    }
  };

  // Check if selected provider is available
  const selectedProviderCheck = binaryCheck?.[provider];
  const hasAnyProvider = binaryCheck?.cloudflare?.available || binaryCheck?.ngrok?.available;

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] text-crt-white/50 font-mono uppercase tracking-wider border-b border-void-300 pb-1">
        Public Access Tunnel
      </h3>

      {/* Provider selector */}
      <div className="bg-void-200 rounded p-2 space-y-2">
        <div className="text-[10px] text-crt-white/50 font-mono uppercase">Provider</div>
        <div className="flex gap-2">
          <button
            onClick={() => setProvider('cloudflare')}
            disabled={tunnelStatus.status === 'connected' || tunnelStatus.status === 'connecting'}
            className={`flex-1 px-2 py-1.5 text-[10px] font-mono uppercase rounded border transition-colors ${
              provider === 'cloudflare'
                ? 'bg-accent/20 text-accent border-accent'
                : 'bg-void-100 text-crt-white/50 border-void-300 hover:border-crt-white/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span>Cloudflare</span>
              {binaryCheck?.cloudflare?.available && (
                <span className="w-1.5 h-1.5 rounded-full bg-crt-green" title="Available" />
              )}
              {binaryCheck && !binaryCheck.cloudflare?.available && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Not installed" />
              )}
            </div>
          </button>
          <button
            onClick={() => setProvider('ngrok')}
            disabled={tunnelStatus.status === 'connected' || tunnelStatus.status === 'connecting'}
            className={`flex-1 px-2 py-1.5 text-[10px] font-mono uppercase rounded border transition-colors ${
              provider === 'ngrok'
                ? 'bg-accent/20 text-accent border-accent'
                : 'bg-void-100 text-crt-white/50 border-void-300 hover:border-crt-white/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span>ngrok</span>
              {binaryCheck?.ngrok?.available && (
                <span className="w-1.5 h-1.5 rounded-full bg-crt-green" title="Available" />
              )}
              {binaryCheck && !binaryCheck.ngrok?.available && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Not installed" />
              )}
            </div>
          </button>
        </div>
        <div className="text-[9px] text-crt-white/30">
          {provider === 'cloudflare' && 'No auth required. Uses trycloudflare.com'}
          {provider === 'ngrok' && 'May require auth token for longer sessions'}
        </div>
      </div>

      {/* Binary check status - show if selected provider not available */}
      {binaryCheck && !selectedProviderCheck?.available && (
        <div className="bg-void-200 rounded p-2 text-[10px] text-crt-white/70 space-y-1">
          <div className="text-accent font-mono">
            {provider === 'cloudflare' ? 'cloudflared' : 'ngrok'} not installed
          </div>
          {provider === 'cloudflare' && (
            <>
              <div className="text-crt-white/50">
                Download from: <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">cloudflare.com/products/tunnel</a>
              </div>
              <div className="text-crt-white/30 text-[9px]">
                Or install via package manager (brew, winget, apt)
              </div>
            </>
          )}
          {provider === 'ngrok' && (
            <>
              <div className="text-crt-white/50">
                Install from: <a href="https://ngrok.com/download" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">ngrok.com</a>
              </div>
              <div className="text-crt-white/30 text-[9px]">
                Or run: <code className="text-crt-amber">npm install -g ngrok</code>
              </div>
            </>
          )}
        </div>
      )}

      {/* Status and toggle */}
      {selectedProviderCheck?.available && (
        <div className="bg-void-200 rounded p-3 space-y-3">
          {/* Status indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="text-xs font-mono">{getStatusText()}</span>
            </div>
            <button
              onClick={handleToggle}
              disabled={checking || tunnelStatus.status === 'connecting'}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                enabled && tunnelStatus.status === 'connected' ? 'bg-crt-green' : 'bg-void-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  enabled && tunnelStatus.status === 'connected' ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Tunnel URL (when connected) */}
          {tunnelStatus.status === 'connected' && tunnelStatus.tunnelUrl && (
            <div className="space-y-2 pt-2 border-t border-void-300">
              <div className="text-[10px] text-crt-white/50">Public URL:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-void-100 rounded font-mono text-xs text-crt-green border border-void-300 overflow-x-auto">
                  {tunnelStatus.tunnelUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(tunnelStatus.tunnelUrl!)}
                  className="px-2 py-1.5 text-[10px] font-mono uppercase bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
              <div className="text-[9px] text-crt-white/30 leading-relaxed">
                Your WebSocket server is now accessible from anywhere. Use this URL in the mobile remote control app.
              </div>
            </div>
          )}

          {/* Error message */}
          {tunnelStatus.status === 'error' && tunnelStatus.error && (
            <div className="pt-2 border-t border-void-300">
              <div className="text-[10px] text-accent font-mono">{tunnelStatus.error}</div>
            </div>
          )}

          {/* Instructions */}
          {tunnelStatus.status === 'disconnected' && (
            <div className="text-[10px] text-crt-white/30 leading-relaxed pt-2 border-t border-void-300">
              Enable to create a secure tunnel and access your AudioBash instance from anywhere on the internet.
              {provider === 'cloudflare' && ' Cloudflare tunnels are free and require no authentication.'}
              {provider === 'ngrok' && ' ngrok may require a free account for sessions longer than 2 hours.'}
            </div>
          )}
        </div>
      )}

      {/* Provider availability summary */}
      {binaryCheck && (
        <div className="text-[9px] text-crt-white/30 leading-relaxed space-y-1">
          <div className="font-mono uppercase text-crt-white/40">Installed providers:</div>
          <div className="flex gap-3">
            <span className={binaryCheck.cloudflare?.available ? 'text-crt-green' : 'text-crt-white/20'}>
              cloudflared: {binaryCheck.cloudflare?.available ? 'yes' : 'no'}
            </span>
            <span className={binaryCheck.ngrok?.available ? 'text-crt-green' : 'text-crt-white/20'}>
              ngrok: {binaryCheck.ngrok?.available ? 'yes' : 'no'}
            </span>
          </div>
        </div>
      )}

      {/* What are tunnels? */}
      <div className="text-[9px] text-crt-white/30 leading-relaxed">
        Tunnels expose your local WebSocket server via a public HTTPS URL, enabling remote access from anywhere (not just your local WiFi).
      </div>
    </div>
  );
};

export default TunnelStatusComponent;
