import React, { useEffect, useRef, useMemo } from 'react';

/**
 * Color mapping for AudioBash void/brutalist theme
 */
const COLOR_MAP: Record<string, string> = {
  red: '#ff3333',
  green: '#33ff33',
  yellow: '#ccff00',
  blue: '#3333ff',
  magenta: '#ff33ff',
  cyan: '#33ffff',
  white: '#e5e5e5',
  brightRed: '#ff6666',
  brightGreen: '#66ff66',
  brightYellow: '#ffff66',
  brightBlue: '#6666ff',
  brightMagenta: '#ff66ff',
  brightCyan: '#66ffff',
  brightWhite: '#ffffff',
};

interface TextSegment {
  text: string;
  color?: string;
  bold?: boolean;
}

/**
 * Parse ANSI escape codes and return styled segments
 */
function parseAnsiToSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let currentColor: string | undefined = undefined;
  let currentBold = false;
  let lastIndex = 0;

  // Pattern to match any ANSI escape sequence
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let match;

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const segmentText = text.slice(lastIndex, match.index);
      if (segmentText) {
        segments.push({
          text: segmentText,
          color: currentColor,
          bold: currentBold,
        });
      }
    }

    // Parse the escape sequence codes
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      switch (code) {
        case 0: // Reset
          currentColor = undefined;
          currentBold = false;
          break;
        case 1: // Bold
          currentBold = true;
          break;
        case 31: // Red
          currentColor = COLOR_MAP.red;
          break;
        case 32: // Green
          currentColor = COLOR_MAP.green;
          break;
        case 33: // Yellow
          currentColor = COLOR_MAP.yellow;
          break;
        case 34: // Blue
          currentColor = COLOR_MAP.blue;
          break;
        case 35: // Magenta
          currentColor = COLOR_MAP.magenta;
          break;
        case 36: // Cyan
          currentColor = COLOR_MAP.cyan;
          break;
        case 37: // White
          currentColor = COLOR_MAP.white;
          break;
        case 91: // Bright Red
          currentColor = COLOR_MAP.brightRed;
          break;
        case 92: // Bright Green
          currentColor = COLOR_MAP.brightGreen;
          break;
        case 93: // Bright Yellow
          currentColor = COLOR_MAP.brightYellow;
          break;
        case 94: // Bright Blue
          currentColor = COLOR_MAP.brightBlue;
          break;
        case 95: // Bright Magenta
          currentColor = COLOR_MAP.brightMagenta;
          break;
        case 96: // Bright Cyan
          currentColor = COLOR_MAP.brightCyan;
          break;
        case 97: // Bright White
          currentColor = COLOR_MAP.brightWhite;
          break;
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last escape sequence
  if (lastIndex < text.length) {
    const segmentText = text.slice(lastIndex);
    if (segmentText) {
      segments.push({
        text: segmentText,
        color: currentColor,
        bold: currentBold,
      });
    }
  }

  return segments;
}

/**
 * Render segments as styled spans
 */
function renderSegments(segments: TextSegment[]): React.ReactNode[] {
  return segments.map((segment, index) => {
    const style: React.CSSProperties = {};
    if (segment.color) {
      style.color = segment.color;
    }
    if (segment.bold) {
      style.fontWeight = 'bold';
    }

    return segment.color || segment.bold ? (
      <span key={index} style={style}>
        {segment.text}
      </span>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    );
  });
}

interface TerminalOutputProps {
  /** Terminal output text to display */
  output: string;
  /** Maximum number of lines to display (default: unlimited) */
  maxLines?: number;
  /** Auto-scroll to bottom on new output (default: true) */
  autoScroll?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Simplified read-only terminal output display for voice-only mode.
 *
 * A lighter alternative to xterm.js that doesn't require the full terminal
 * emulator. Ideal for displaying command output without keyboard input.
 *
 * Features:
 * - Basic ANSI color parsing (red, green, yellow, blue, bold)
 * - Auto-scroll to bottom on new output
 * - Touch-friendly scrolling
 * - AudioBash void/brutalist aesthetic
 * - Line limiting for performance
 */
const TerminalOutput: React.FC<TerminalOutputProps> = ({
  output,
  maxLines,
  autoScroll = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastOutputLengthRef = useRef<number>(0);

  /**
   * Process output: limit lines and parse ANSI codes
   */
  const processedContent = useMemo(() => {
    let lines = output.split('\n');

    // Limit lines if maxLines is specified
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(-maxLines);
    }

    // Parse each line for ANSI codes
    return lines.map((line, lineIndex) => {
      const segments = parseAnsiToSegments(line);
      return (
        <div key={lineIndex} className="whitespace-pre-wrap break-all">
          {segments.length > 0 ? renderSegments(segments) : '\u00A0'}
        </div>
      );
    });
  }, [output, maxLines]);

  /**
   * Auto-scroll to bottom when new output is added
   */
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;

    // Only scroll if output has actually increased
    if (output.length > lastOutputLengthRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    lastOutputLengthRef.current = output.length;
  }, [output, autoScroll]);

  return (
    <div
      ref={containerRef}
      className={`
        h-full w-full
        bg-black
        overflow-auto
        p-3
        font-mono text-sm
        text-crt-green
        leading-relaxed
        ${className}
      `}
      style={{
        // Touch-friendly scrolling
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        // CRT green default color
        color: '#00ff00',
        // Terminal font stack
        fontFamily: "'Share Tech Mono', 'Fira Code', monospace",
      }}
    >
      <code className="block">
        {processedContent}
      </code>
    </div>
  );
};

export default TerminalOutput;
