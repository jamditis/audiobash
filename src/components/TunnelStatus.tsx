import React, { useState, useEffect } from 'react';

interface TunnelStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tunnelUrl: string | null;
  subdomain: string | null;
  error: string | null;
}

interface BinaryCheck {
  available: boolean;
  path: string | null;
  message: string;
}

interface TunnelStatusProps {
  onStatusChange?: (status: TunnelStatus) => void;
}

const TunnelStatusComponent: React.FC<TunnelStatusProps> = ({ onStatusChange }) => {
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>({
    status: 'disconnected',
    tunnelUrl: null,
    subdomain: null,
    error: null,
  });
  const [enabled, setEnabled] = useState(false);
  const [binaryCheck, setBinaryCheck] = useState<BinaryCheck | null>(null);
  const [checking, setChecking] = useState(false);

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
        const result = await window.electron?.tunnelStart(8765);
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

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] text-crt-white/50 font-mono uppercase tracking-wider border-b border-void-300 pb-1">
        Public Access (tunnelto)
      </h3>

      {/* Binary check status */}
      {binaryCheck && !binaryCheck.available && (
        <div className="bg-void-200 rounded p-2 text-[10px] text-crt-white/70 space-y-1">
          <div className="text-accent font-mono">tunnelto not installed</div>
          <div className="text-crt-white/50">
            Install with: <code className="text-crt-amber">cargo install tunnelto</code>
          </div>
          <div className="text-crt-white/30 text-[9px]">
            Or download from: <a href="https://github.com/agrinman/tunnelto" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">github.com/agrinman/tunnelto</a>
          </div>
        </div>
      )}

      {/* Status and toggle */}
      {binaryCheck?.available && (
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
              Requires <code className="text-crt-white/50">tunnelto</code> CLI to be installed.
            </div>
          )}
        </div>
      )}

      {/* What is tunnelto? */}
      <div className="text-[9px] text-crt-white/30 leading-relaxed">
        tunnelto exposes your local WebSocket server via a public HTTPS URL, enabling remote access from anywhere (not just your local WiFi).
      </div>
    </div>
  );
};

export default TunnelStatusComponent;
