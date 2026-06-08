import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaneManager from '../../src/components/PaneManager';

vi.mock('../../src/hooks/usePaneActivity', () => ({
  usePaneActivity: () => new Map(),
}));

vi.mock('../../src/components/Terminal', () => ({
  default: ({ tabId, isFocused }: { tabId: string; isFocused: boolean }) => (
    <div data-testid="terminal" data-tab-id={tabId} data-focused={String(isFocused)} />
  ),
}));

function renderPaneManager(onCreateTerminal = vi.fn<() => Promise<string>>()) {
  return render(
    <PaneManager
      initialTerminalId="tab-1"
      isRecording={false}
      cliNotificationsEnabled={true}
      fontSize={14}
      onCreateTerminal={onCreateTerminal}
      onCloseTerminal={vi.fn()}
    />,
  );
}

describe('PaneManager layout controls', () => {
  it('renders a four-pane grid from the grid preset button', async () => {
    const onCreateTerminal = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('tab-2')
      .mockResolvedValueOnce('tab-3')
      .mockResolvedValueOnce('tab-4');

    renderPaneManager(onCreateTerminal);

    fireEvent.click(screen.getByRole('button', { name: 'Grid 2x2' }));

    await waitFor(() => expect(screen.getAllByTestId('terminal')).toHaveLength(4));
  });

  it('clears zoom when splitting so the new pane is visible immediately', async () => {
    const onCreateTerminal = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('tab-2')
      .mockResolvedValueOnce('tab-3');

    renderPaneManager(onCreateTerminal);

    fireEvent.click(screen.getByRole('button', { name: 'Split vertical' }));
    await waitFor(() => expect(screen.getAllByTestId('terminal')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Toggle pane zoom' }));
    expect(screen.getByText('ZOOMED')).toBeInTheDocument();
    expect(screen.getAllByTestId('terminal')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Split horizontal' }));

    // The split runs an async onCreateTerminal alongside the zoom-clear state update, so the
    // ZOOMED label and the third pane can settle on different ticks. Wait for both conditions
    // together to avoid asserting the pane count before the new pane has rendered.
    await waitFor(() => {
      expect(screen.queryByText('ZOOMED')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('terminal')).toHaveLength(3);
    });
  });
});
