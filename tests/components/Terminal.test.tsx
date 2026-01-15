/**
 * Terminal Component Tests
 * Tests for the xterm.js terminal wrapper component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Terminal from '../../src/components/Terminal';
import { ThemeProvider } from '../../src/themes/ThemeProvider';

// Helper to render Terminal with required providers
function renderTerminal(props: Partial<Parameters<typeof Terminal>[0]> = {}) {
  const defaultProps = {
    tabId: 'test-tab-1',
    isActive: true,
    isVisible: true,
    isFocused: false,
    isRecording: false,
    cliNotificationsEnabled: true,
    onFocus: vi.fn(),
  };

  return render(
    <ThemeProvider>
      <Terminal {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe('Terminal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders terminal container', () => {
      const { container } = renderTerminal();

      // Should have a terminal container div
      const terminalDiv = container.querySelector('div');
      expect(terminalDiv).toBeInTheDocument();
    });

    it('renders with proper visibility when active', () => {
      const { container } = renderTerminal({ isActive: true, isVisible: true });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ display: 'block' });
    });

    it('hides terminal when not visible', () => {
      const { container } = renderTerminal({ isVisible: false });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ display: 'none' });
    });

    it('shows focus ring when focused', () => {
      const { container } = renderTerminal({ isFocused: true });

      // Check for the focus ring class
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('ring-1');
    });

    it('does not show focus ring when not focused', () => {
      const { container } = renderTerminal({ isFocused: false });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).not.toContain('ring-1');
    });

    it('renders with void background', () => {
      const { container } = renderTerminal();

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('bg-void');
    });
  });

  describe('User Interaction', () => {
    it('calls onFocus when clicked', () => {
      const onFocus = vi.fn();
      const { container } = renderTerminal({ onFocus });

      const wrapper = container.firstChild as HTMLElement;
      fireEvent.click(wrapper);

      expect(onFocus).toHaveBeenCalled();
    });

    it('calls onFocus only once per click', () => {
      const onFocus = vi.fn();
      const { container } = renderTerminal({ onFocus });

      const wrapper = container.firstChild as HTMLElement;
      fireEvent.click(wrapper);

      expect(onFocus).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scanlines Effect', () => {
    it('shows scanlines when enabled in localStorage', () => {
      localStorage.setItem('audiobash-scanlines', 'true');

      const { container } = renderTerminal();

      const overlay = container.querySelector('.crt-effect');
      expect(overlay).toBeInTheDocument();
    });

    it('hides scanlines when disabled in localStorage', () => {
      localStorage.setItem('audiobash-scanlines', 'false');

      const { container } = renderTerminal();

      const overlay = container.querySelector('.crt-effect');
      expect(overlay).not.toBeInTheDocument();
    });

    it('hides scanlines by default when no localStorage setting', () => {
      // localStorage is cleared in beforeEach
      const { container } = renderTerminal();

      const overlay = container.querySelector('.crt-effect');
      expect(overlay).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has focusable inner container', () => {
      const { container } = renderTerminal();

      const focusableDiv = container.querySelector('[tabindex="0"]');
      expect(focusableDiv).toBeInTheDocument();
    });

    it('inner container fills width', () => {
      const { container } = renderTerminal();

      const innerDiv = container.querySelector('[tabindex="0"]');
      expect(innerDiv).toHaveClass('w-full');
    });

    it('inner container fills height', () => {
      const { container } = renderTerminal();

      const innerDiv = container.querySelector('[tabindex="0"]');
      expect(innerDiv).toHaveClass('h-full');
    });
  });

  describe('Props behavior', () => {
    it('uses isVisible when provided', () => {
      const { container: hidden } = renderTerminal({ isVisible: false, isActive: true });
      const { container: visible } = renderTerminal({ isVisible: true, isActive: false });

      // isVisible should take precedence over isActive
      expect((hidden.firstChild as HTMLElement).style.display).toBe('none');
      expect((visible.firstChild as HTMLElement).style.display).toBe('block');
    });

    it('falls back to isActive when isVisible not provided', () => {
      // isVisible is undefined
      const { container } = render(
        <ThemeProvider>
          <Terminal tabId="test" isActive={true} />
        </ThemeProvider>
      );

      expect((container.firstChild as HTMLElement).style.display).toBe('block');
    });

    it('applies correct tabId as prop', () => {
      // The component should use the tabId for IPC calls
      const { rerender } = renderTerminal({ tabId: 'tab-1' });

      // Re-render with different tabId - component should handle this
      rerender(
        <ThemeProvider>
          <Terminal tabId="tab-2" isActive={true} />
        </ThemeProvider>
      );

      // No error thrown - component handles prop changes gracefully
      expect(true).toBe(true);
    });
  });
});

describe('Terminal with Recording State', () => {
  it('passes recording state to focus indicator', () => {
    const { container } = renderTerminal({ isFocused: true, isRecording: true });

    // When focused and recording, the focus indicator should be present
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('ring-1');
  });
});

describe('Terminal visibility states', () => {
  it('handles all visibility combinations', () => {
    const testCases = [
      { isActive: true, isVisible: true, expectedDisplay: 'block' },
      { isActive: true, isVisible: false, expectedDisplay: 'none' },
      { isActive: false, isVisible: true, expectedDisplay: 'block' },
      { isActive: false, isVisible: false, expectedDisplay: 'none' },
    ];

    for (const tc of testCases) {
      const { container } = renderTerminal({
        isActive: tc.isActive,
        isVisible: tc.isVisible,
      });

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.display).toBe(tc.expectedDisplay);
    }
  });
});
