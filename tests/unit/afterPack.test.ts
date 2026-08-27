import { join } from 'path';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { Arch: electronArch } = require('electron-builder') as {
  Arch: Record<number, string> & { arm64: number; x64: number };
};
const { createAfterPack, default: defaultAfterPack } = require('../../scripts/afterPack.cjs') as {
  default: (context: unknown) => Promise<void>;
  createAfterPack: (dependencies: {
    Arch?: Record<number, string>;
    repairNodePtyBinaries?: (options: {
      nodePtyRoot: string;
      targetArchitecture: 'arm64' | 'x64';
      releaseMode: boolean;
    }) => boolean;
  }) => (context: {
    electronPlatformName: string;
    arch: number;
    appOutDir: string;
    packager: { appInfo: { productFilename: string } };
  }) => Promise<void>;
};

const Arch = { 1: 'x64', 3: 'arm64' } as const;

function createContext(arch: number) {
  return {
    electronPlatformName: 'darwin',
    arch,
    appOutDir: `/tmp/audiobash-package-${arch}`,
    packager: { appInfo: { productFilename: 'AudioBash test' } },
  };
}

describe('afterPack node-pty repair', () => {
  it('exports the configured electron-builder hook as a function', () => {
    expect(defaultAfterPack).toBeTypeOf('function');
  });

  it.each([
    [electronArch.x64, 'x64'],
    [electronArch.arm64, 'arm64'],
  ] as const)('maps the real electron-builder Arch value %s to %s', async (arch, expectedArch) => {
    const repairNodePtyBinaries = vi.fn(() => true);
    const afterPack = createAfterPack({ repairNodePtyBinaries });

    await afterPack(createContext(arch));

    expect(repairNodePtyBinaries).toHaveBeenCalledOnce();
    expect(repairNodePtyBinaries).toHaveBeenCalledWith(
      expect.objectContaining({ targetArchitecture: expectedArch, releaseMode: true }),
    );
  });

  it('returns early for non-macOS packages without reading macOS fields', async () => {
    const repairNodePtyBinaries = vi.fn(() => true);
    const afterPack = createAfterPack({ Arch, repairNodePtyBinaries });

    await expect(afterPack({ electronPlatformName: 'win32' } as never)).resolves.toBeUndefined();
    expect(repairNodePtyBinaries).not.toHaveBeenCalled();
  });

  it('rejects an unmapped macOS architecture before repair', async () => {
    const repairNodePtyBinaries = vi.fn(() => true);
    const afterPack = createAfterPack({ Arch, repairNodePtyBinaries });

    await expect(afterPack({ ...createContext(3), arch: 99 })).rejects.toThrow(
      'Unsupported macOS package architecture: 99',
    );
    expect(repairNodePtyBinaries).not.toHaveBeenCalled();
  });

  it.each([
    [1, 'x64'],
    [3, 'arm64'],
  ] as const)('repairs only the packaged Electron Arch %s target', async (arch, expectedArch) => {
    const repairNodePtyBinaries = vi.fn(() => true);
    const afterPack = createAfterPack({ Arch, repairNodePtyBinaries });
    const context = createContext(arch);

    await afterPack(context);

    expect(repairNodePtyBinaries).toHaveBeenCalledOnce();
    expect(repairNodePtyBinaries).toHaveBeenCalledWith({
      nodePtyRoot: join(
        context.appOutDir,
        'AudioBash test.app',
        'Contents',
        'Resources',
        'app.asar.unpacked',
        'node_modules',
        'node-pty',
      ),
      targetArchitecture: expectedArch,
      releaseMode: true,
    });
  });

  it.each(['repair', 'signing', 'verification'])(
    'does not swallow an injected %s failure',
    async (stage) => {
      const repairNodePtyBinaries = vi.fn(() => {
        throw new Error(`injected ${stage} failure`);
      });
      const afterPack = createAfterPack({ Arch, repairNodePtyBinaries });

      await expect(afterPack(createContext(3))).rejects.toThrow(`injected ${stage} failure`);
    },
  );
});
