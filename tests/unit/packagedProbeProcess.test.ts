// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  terminateDetachedProbeGroup,
  terminatePackagedProbeTree,
  terminateReportedProbeGroups,
} from '../helpers/packagedProbeProcess';

describe('packaged probe process cleanup', () => {
  it('force-stops the proved detached process group', () => {
    const kill = vi.fn();

    terminateDetachedProbeGroup(4321, kill);

    expect(kill).toHaveBeenCalledWith(-4321, 'SIGKILL');
  });

  it.each([0, -1, Number.NaN])('rejects unsafe process group ID %s', (pid) => {
    expect(() => terminateDetachedProbeGroup(pid, vi.fn())).toThrow(
      'A positive packaged probe process-group ID is required',
    );
  });

  it('stops only proved groups in the packaged probe descendant tree', () => {
    const kill = vi.fn();
    const snapshot = `
      100 1 100
      200 100 200
      201 200 200
      300 1 300
    `;

    terminatePackagedProbeTree(100, snapshot, kill);

    expect(kill.mock.calls).toEqual([
      [-200, 'SIGKILL'],
      [-100, 'SIGKILL'],
    ]);
  });

  it('stops a reported launcher group when the root is absent from a later snapshot', () => {
    const kill = vi.fn();

    terminateReportedProbeGroups(100, new Set([200]), kill);

    expect(kill.mock.calls).toEqual([
      [-200, 'SIGKILL'],
      [-100, 'SIGKILL'],
    ]);
  });
});
