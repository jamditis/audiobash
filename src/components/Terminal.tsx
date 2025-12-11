import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme, themeToXtermTheme } from '../themes';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  tabId: string;
  isActive: boolean;
}

const Terminal: React.FC<TerminalProps> = ({ tabId, isActive }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useTheme();
  const [scanlines, setScanlines] = useState(() => {
    return localStorage.getItem('audiobash-scanlines') === 'true';
  });

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create xterm instance with theme
    const xterm = new XTerm({
      theme: themeToXtermTheme(theme),
      fontFamily: '"JetBrains Mono", "Berkeley Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      window.electron?.resizeTerminal(tabId, xterm.cols, xterm.rows);
    };

    window.addEventListener('resize', handleResize);

    // Handle user input - send to PTY
    xterm.onData((data) => {
      window.electron?.writeToTerminal(tabId, data);
    });

    // Listen for PTY output (filtered by tabId)
    const cleanup = window.electron?.onTerminalData((incomingTabId: string, data: string) => {
      if (incomingTabId === tabId) {
        xterm.write(data);
      }
    });

    // Initial fit after a short delay
    setTimeout(() => {
      fitAddon.fit();
      window.electron?.resizeTerminal(tabId, xterm.cols, xterm.rows);
    }, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup?.();
      xterm.dispose();
    };
  }, [tabId]);

  // Re-fit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && xtermRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (xtermRef.current) {
          window.electron?.resizeTerminal(tabId, xtermRef.current.cols, xtermRef.current.rows);
        }
        xtermRef.current?.focus();
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

  return (
    <div
      className="h-full w-full bg-void relative"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      <div ref={terminalRef} className="h-full w-full" />
      {/* Subtle CRT scanline effect overlay (toggleable) */}
      {scanlines && (
        <div className="absolute inset-0 pointer-events-none crt-effect" style={{ opacity: 0.15 }} />
      )}
    </div>
  );
};

export default Terminal;
