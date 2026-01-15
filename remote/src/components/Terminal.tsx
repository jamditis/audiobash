import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/**
 * AudioBash void/brutalist xterm.js theme
 * CRT green phosphor aesthetic with acid accents
 */
const terminalTheme = {
  background: '#000000',
  foreground: '#00ff00',
  cursor: '#ccff00',
  cursorAccent: '#050505',
  selectionBackground: 'rgba(204, 255, 0, 0.3)',
  selectionForeground: undefined,
  selectionInactiveBackground: 'rgba(204, 255, 0, 0.15)',
  black: '#000000',
  red: '#ff3333',
  green: '#33ff33',
  yellow: '#ccff00',
  blue: '#3333ff',
  magenta: '#ff33ff',
  cyan: '#33ffff',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#ff6666',
  brightGreen: '#66ff66',
  brightYellow: '#ffff66',
  brightBlue: '#6666ff',
  brightMagenta: '#ff66ff',
  brightCyan: '#66ffff',
  brightWhite: '#ffffff',
};

interface TerminalProps {
  /** Terminal output to display */
  output: string;
  /** Callback when user provides input (optional - for keyboard mode) */
  onInput?: (input: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Font size in pixels (default: 14 for mobile readability) */
  fontSize?: number;
}

/**
 * Mobile-optimized xterm.js terminal wrapper for AudioBash Remote PWA.
 *
 * Features:
 * - Responsive sizing with FitAddon
 * - AudioBash void/brutalist theme
 * - Touch-friendly scrolling
 * - Debounced resize handling
 * - Optional keyboard input support
 */
const Terminal: React.FC<TerminalProps> = ({
  output,
  onInput,
  className = '',
  fontSize = 14,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastOutputRef = useRef<string>('');
  const resizeTimeoutRef = useRef<number | null>(null);

  /**
   * Debounced resize handler to prevent excessive fit() calls
   */
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      window.clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = window.setTimeout(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          const container = containerRef.current;
          if (!container) return;

          const rect = container.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            fitAddonRef.current.fit();
          }
        } catch (err) {
          console.warn('[Terminal] Fit error during resize:', err);
        }
      }
    }, 100);
  }, []);

  /**
   * Initialize xterm.js instance
   */
  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    const initTerminal = () => {
      if (disposed) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Container not ready, retry on next frame
        requestAnimationFrame(initTerminal);
        return;
      }

      try {
        // Create xterm instance with mobile-optimized settings
        const xterm = new XTerm({
          theme: terminalTheme,
          fontFamily: "'Share Tech Mono', 'Fira Code', monospace",
          fontSize,
          lineHeight: 1.2,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 5000, // Reduced for mobile memory
          allowProposedApi: true,
          // Mobile-friendly options
          scrollOnUserInput: true,
          convertEol: true,
        });

        const fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);

        xterm.open(container);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        // Handle user keyboard input (optional)
        if (onInput) {
          xterm.onData((data) => {
            onInput(data);
          });
        }

        // Initial fit after rendering
        setTimeout(() => {
          if (!disposed && fitAddon && xterm) {
            try {
              fitAddon.fit();
            } catch (err) {
              console.warn('[Terminal] Initial fit error:', err);
            }
          }
        }, 50);
      } catch (err) {
        console.error('[Terminal] Initialization failed:', err);
      }
    };

    requestAnimationFrame(initTerminal);

    return () => {
      disposed = true;
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, [fontSize, onInput]);

  /**
   * Handle window resize events
   */
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  /**
   * Handle container resize via ResizeObserver
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  /**
   * Write new output to terminal when prop changes
   */
  useEffect(() => {
    if (!xtermRef.current || output === lastOutputRef.current) return;

    const xterm = xtermRef.current;
    const lastOutput = lastOutputRef.current;

    // Determine what's new since last output
    if (output.startsWith(lastOutput)) {
      // Append only the new content
      const newContent = output.slice(lastOutput.length);
      if (newContent) {
        xterm.write(newContent);
      }
    } else {
      // Output has changed entirely, clear and write all
      xterm.clear();
      xterm.write(output);
    }

    lastOutputRef.current = output;
  }, [output]);

  /**
   * Update font size when prop changes
   */
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      handleResize();
    }
  }, [fontSize, handleResize]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full bg-black overflow-hidden ${className}`}
      style={{
        // Touch-friendly scrolling
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
      }}
    />
  );
};

export default Terminal;
