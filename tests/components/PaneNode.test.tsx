import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import PaneNodeComponent from '../../src/components/PaneNode';
import { createLeaf, splitPane } from '../../src/utils/paneTree';

vi.mock('../../src/components/Terminal', () => ({
  default: ({ tabId }: { tabId: string }) => <div data-testid="terminal" data-tab-id={tabId} />,
}));

vi.mock('../../src/components/PaneDivider', () => ({
  default: ({ direction }: { direction: string }) => <div data-testid="pane-divider" data-direction={direction} />,
}));

function renderPaneTree() {
  const root = createLeaf('tab-1');
  const split = splitPane(root, root.id, 'vertical', 'tab-2');

  return render(
    <PaneNodeComponent
      node={split}
      focusedId={root.id}
      zoomedId={null}
      isRecording={false}
      cliNotificationsEnabled={true}
      fontSize={14}
      activityStates={new Map()}
      paneColors={new Map()}
      onFocus={vi.fn()}
      onResize={vi.fn()}
      onEqualize={vi.fn()}
    />,
  );
}

describe('PaneNodeComponent split layout', () => {
  it('allows split children to shrink inside the flex layout', () => {
    const { getAllByTestId } = renderPaneTree();

    const terminals = getAllByTestId('terminal');
    expect(terminals).toHaveLength(2);

    const splitChildWrappers = terminals.map(terminal => terminal.parentElement?.parentElement);
    expect(splitChildWrappers[0]).toHaveClass('min-w-0');
    expect(splitChildWrappers[0]).toHaveClass('min-h-0');
    expect(splitChildWrappers[1]).toHaveClass('min-w-0');
    expect(splitChildWrappers[1]).toHaveClass('min-h-0');
  });
});
