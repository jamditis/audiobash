import { describe, expect, it } from 'vitest';
import {
  assertExactPackageBytes,
  assertMaximumMacOsDeploymentTarget,
  parseMacOsDeploymentTargets,
} from '../helpers/macosPackagePolicy';

describe('macOS package source freshness policy', () => {
  it('rejects packaged source that differs by one byte', () => {
    const currentSource = Buffer.from('module.exports = true;\n');
    const staleSource = Buffer.from('module.exports = false;\n');

    expect(() => assertExactPackageBytes('electron/main.cjs', staleSource, currentSource)).toThrow(
      'electron/main.cjs does not match the current source bytes',
    );
  });

  it('accepts packaged source that matches the current bytes', () => {
    const currentSource = Buffer.from('module.exports = true;\n');

    expect(() =>
      assertExactPackageBytes('electron/main.cjs', currentSource, currentSource),
    ).not.toThrow();
  });
});

describe('macOS package deployment target policy', () => {
  it('reads current and legacy Mach-O deployment target commands', () => {
    const vtoolOutput = `
Load command 10
      cmd LC_VERSION_MIN_MACOSX
  cmdsize 16
  version 10.7
      sdk 10.8
Load command 11
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform MACOS
    minos 12.0
      sdk 26.5
`;

    expect(parseMacOsDeploymentTargets(vtoolOutput)).toEqual(['10.7', '12.0']);
  });

  it('rejects a packaged Mach-O deployment target later than macOS 12', () => {
    const records = [
      { path: 'AudioBash.app/Contents/MacOS/AudioBash', targets: ['12.0'] },
      { path: 'AudioBash.app/Contents/Frameworks/Helper', targets: ['13.0'] },
    ];

    expect(() => assertMaximumMacOsDeploymentTarget(records, '12.0')).toThrow(
      'AudioBash.app/Contents/Frameworks/Helper requires macOS 13.0, later than 12.0',
    );
  });

  it('rejects a packaged Mach-O file without deployment target metadata', () => {
    const records = [{ path: 'AudioBash.app/Contents/MacOS/AudioBash', targets: [] }];

    expect(() => assertMaximumMacOsDeploymentTarget(records, '12.0')).toThrow(
      'AudioBash.app/Contents/MacOS/AudioBash has no macOS deployment target',
    );
  });

  it('accepts exact and earlier packaged deployment targets', () => {
    const records = [
      { path: 'AudioBash.app/Contents/MacOS/AudioBash', targets: ['12.0'] },
      { path: 'AudioBash.app/Contents/Frameworks/Helper', targets: ['11.0', '10.7'] },
    ];

    expect(() => assertMaximumMacOsDeploymentTarget(records, '12.0')).not.toThrow();
  });
});
