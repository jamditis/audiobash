import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ensureTray } = require('../../electron/trayLifecycle.cjs') as {
  ensureTray: (options: {
    currentTray?: TestTray;
    TrayClass?: typeof TestTray;
    icon?: object;
    contextMenu: object;
    tooltip?: string;
    onClick?: () => void;
  }) => TestTray;
};

class TestTray {
  static instances: TestTray[] = [];

  icon: object;
  contextMenus: object[] = [];
  tooltips: string[] = [];
  clickHandlers: Array<() => void> = [];

  constructor(icon: object) {
    this.icon = icon;
    TestTray.instances.push(this);
  }

  setContextMenu(menu: object): void {
    this.contextMenus.push(menu);
  }

  setToolTip(tooltip: string): void {
    this.tooltips.push(tooltip);
  }

  on(event: string, handler: () => void): void {
    if (event === 'click') this.clickHandlers.push(handler);
  }
}

describe('tray lifecycle', () => {
  it('creates and configures one tray', () => {
    TestTray.instances = [];
    const icon = {};
    const contextMenu = {};
    const onClick = () => {};

    const tray = ensureTray({
      TrayClass: TestTray,
      icon,
      contextMenu,
      tooltip: 'AudioBash',
      onClick,
    });

    expect(TestTray.instances).toEqual([tray]);
    expect(tray.icon).toBe(icon);
    expect(tray.contextMenus).toEqual([contextMenu]);
    expect(tray.tooltips).toEqual(['AudioBash']);
    expect(tray.clickHandlers).toEqual([onClick]);
  });

  it('updates the existing tray menu without allocating another tray', () => {
    TestTray.instances = [];
    const firstMenu = {};
    const secondMenu = {};
    const tray = ensureTray({
      TrayClass: TestTray,
      icon: {},
      contextMenu: firstMenu,
      tooltip: 'AudioBash',
      onClick: () => {},
    });

    const updatedTray = ensureTray({ currentTray: tray, contextMenu: secondMenu });

    expect(updatedTray).toBe(tray);
    expect(TestTray.instances).toHaveLength(1);
    expect(tray.contextMenus).toEqual([firstMenu, secondMenu]);
    expect(tray.tooltips).toEqual(['AudioBash']);
    expect(tray.clickHandlers).toHaveLength(1);
  });
});
