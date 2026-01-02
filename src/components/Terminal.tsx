import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme, themeToXtermTheme } from '../themes';
import FocusIndicator from './FocusIndicator';
import { playNotificationSound, checkForCliInputPrompt, resetOutputBuffer } from '../utils/notificationSound';
import { terminalLog as log } from '../utils/logger';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  tabId: string;
  isActive: boolean;
  isVisible?: boolean;   // For split view - show terminal
  isFocused?: boolean;   // For voice commands target
  isRecording?: boolean; // For focus indicator animation
  onFocus?: () => void;  // Click callback for split view
  cliNotificationsEnabled?: boolean; // Play sound when CLI requests input
}

const Terminal: React.FC<TerminalProps> = ({
  tabId,
  isActive,
  isVisible,
  isFocused = false,
  isRecording = false,
  onFocus,
  cliNotificationsEnabled = true,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cliNotificationsRef = useRef(cliNotificationsEnabled);
  const { theme } = useTheme();
  const [scanlines, setScanlines] = useState(() => {
    return localStorage.getItem('audiobash-scanlines') === 'true';
  });

  // Keep ref in sync with prop
  useEffect(() => {
    cliNotificationsRef.current = cliNotificationsEnabled;
  }, [cliNotificationsEnabled]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const container = terminalRef.current;
    let xterm: XTerm | null = null;
    let fitAddon: FitAddon | null = null;
    let dataCleanup: (() => void) | undefined;
    let resizeHandler: (() => void) | null = null;
    let disposed = false;

    // Wait for container to have dimensions before initializing xterm
    const initTerminal = () => {
      if (disposed) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Container not ready, retry
        log.debug('Container not ready, retrying initialization', { tabId });
        requestAnimationFrame(initTerminal);
        return;
      }

      log.info('Initializing terminal', { tabId, width: rect.width, height: rect.height });

      try {
        // Create xterm instance with theme
        xterm = new XTerm({
          theme: themeToXtermTheme(theme),
          fontFamily: '"JetBrains Mono", "Berkeley Mono", Consolas, monospace',
          fontSize: 14,
          lineHeight: 1.2,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 10000,
          allowProposedApi: true,
        });

        fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);

        xterm.open(container);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        log.debug('Terminal xterm instance created', { tabId });

        // Handle resize
        resizeHandler = () => {
          if (!fitAddon || !xterm) return;
          try {
            fitAddon.fit();
            window.electron?.resizeTerminal(tabId, xterm.cols, xterm.rows);
          } catch (err) {
            log.warn('Terminal resize error', { tabId }, err);
          }
        };
        window.addEventListener('resize', resizeHandler);

        // Handle user input - send to PTY
        xterm.onData((data) => {
          window.electron?.writeToTerminal(tabId, data);
        });

        // Enable copy on selection
        xterm.onSelectionChange(() => {
          const selection = xterm?.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch((err) => {
              log.warn('Clipboard write failed', { tabId }, err);
            });
          }
        });

        // Listen for PTY output (filtered by tabId)
        dataCleanup = window.electron?.onTerminalData((incomingTabId: string, data: string) => {
          if (incomingTabId === tabId && xterm) {
            xterm.write(data);

            // Check for CLI input prompts and play notification
            if (cliNotificationsRef.current && checkForCliInputPrompt(data)) {
              playNotificationSound();
            }
          }
        });

        // Fit after a brief delay to ensure rendering is complete
        setTimeout(() => {
          if (!fitAddon || !xterm || disposed) return;
          try {
            fitAddon.fit();
            window.electron?.resizeTerminal(tabId, xterm.cols, xterm.rows);
            xterm.focus();
            log.info('Terminal initialized successfully', {
              tabId,
              cols: xterm.cols,
              rows: xterm.rows,
            });
          } catch (err) {
            log.error('Terminal initial fit failed', err, { tabId });
          }
        }, 100);
      } catch (err) {
        log.error('Terminal initialization failed', err, { tabId });
      }
    };

    // Start initialization
    requestAnimationFrame(initTerminal);

    return () => {
      disposed = true;
      log.debug('Cleaning up terminal', { tabId });
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
      dataCleanup?.();
      resetOutputBuffer(); // Clear CLI prompt detection buffer
      if (xterm) {
        xterm.dispose();
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
      log.debug('Terminal cleanup complete', { tabId });
    };
  }, [tabId]);

  // Re-fit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && xtermRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          if (xtermRef.current) {
            window.electron?.resizeTerminal(tabId, xtermRef.current.cols, xtermRef.current.rows);
          }
          xtermRef.current?.focus();
        } catch (err) {
          // Ignore fit errors
        }
      }, 50);
    }
  }, [isActive, tabId]);

  // Update terminal theme when theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = themeToXtermTheme(theme);
    }
  }, [theme]);

  // Listen for scanlines setting changes
  useEffect(() => {
    const handleStorage = () => {
      setScanlines(localStorage.getItem('audiobash-scanlines') === 'true');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // ResizeObserver for split view pane resizing
  useEffect(() => {
    if (!terminalRef.current) return;

    let resizeTimeout: NodeJS.Timeout | null = null;
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events to prevent excessive calls
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          try {
            const container = terminalRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            // Only fit if container has valid dimensions
            if (rect.width > 0 && rect.height > 0) {
              fitAddonRef.current.fit();
              window.electron?.resizeTerminal(tabId, xtermRef.current.cols, xtermRef.current.rows);
            }
          } catch (err) {
            log.warn('Terminal fit failed during resize', { tabId }, err);
          }
        }
      }, 100); // Increased debounce for stability
    });

    resizeObserver.observe(terminalRef.current);
    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [tabId]);

  // Focus terminal when clicked (also notify parent in split view)
  const handleClick = () => {
    xtermRef.current?.focus();
    onFocus?.();
  };

  // Determine visibility: use isVisible if provided (split view), otherwise use isActive (single view)
  const shouldShow = isVisible !== undefined ? isVisible : isActive;

  return (
    <div
      className={`h-full w-full bg-void relative ${isFocused ? 'ring-1 ring-accent/50' : ''}`}
      style={{ display: shouldShow ? 'block' : 'none' }}
      onClick={handleClick}
    >
      {/* Focus indicator badge for voice command target */}
      {isFocused && <FocusIndicator isRecording={isRecording} />}
      <div ref={terminalRef} className="h-full w-full" />
      {/* Subtle CRT scanline effect overlay (toggleable) */}
      {scanlines && (
        <div className="absolute inset-0 pointer-events-none crt-effect" style={{ opacity: 0.15 }} />
      )}
    </div>
  );
};

export default Terminal;
