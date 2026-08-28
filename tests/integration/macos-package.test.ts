import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { extractFile } from '@electron/asar';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const rootDir = join(__dirname, '../..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const releaseDir = join(rootDir, 'release');
const asarBin = join(rootDir, 'node_modules/.bin/asar');
const inheritedProbeEnvironmentNames = ['LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'TMPDIR'];

const packages = [
  {
    architecture: 'arm64',
    appDirectory: 'mac-arm64',
  },
  {
    architecture: 'x64',
    appDirectory: 'mac',
  },
] as const;

function artifactPath(architecture: string, extension: 'dmg' | 'zip'): string {
  const artifactName = packageJson.build.mac.artifactName
    .replace('${productName}', packageJson.build.productName)
    .replace('${version}', packageJson.version)
    .replace('${arch}', architecture)
    .replace('${ext}', extension);

  return join(releaseDir, artifactName);
}

function listAsar(asarPath: string): string[] {
  return execFileSync(asarBin, ['list', asarPath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readAsarText(asarPath: string, entry: string): string {
  return extractFile(asarPath, entry.replace(/^\//, '')).toString('utf8');
}

function listFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${prefix}/${entry.name}`;
    return entry.isDirectory()
      ? listFiles(join(directory, entry.name), relativePath)
      : [relativePath];
  });
}

function listRequiredFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    throw new Error(`Required package directory is missing: ${directory}`);
  }

  return listFiles(directory);
}

function listPrebuildEntriesOutsideTarget(entries: string[], targetPrebuild: string): string[] {
  return entries.filter(
    (entry) =>
      entry.startsWith('/node_modules/node-pty/prebuilds/') &&
      entry !== targetPrebuild &&
      !entry.startsWith(`${targetPrebuild}/`),
  );
}

function listForbiddenNodePtyEntries(entries: string[]): string[] {
  return entries.filter(
    (entry) =>
      entry.startsWith('/node_modules/node-pty/deps/') ||
      entry.startsWith('/node_modules/node-pty/scripts/') ||
      entry.startsWith('/node_modules/node-pty/src/') ||
      /\/node_modules\/node-pty\/.*(?:\.map|\.pdb|\.test\.(?:[cm]?js|ts))$/.test(entry),
  );
}

function commonJsResolutionBoundaryScript(packagedNodeModules: string): string {
  return `
const Module = require('module');
const fs = require('fs');
const path = require('path');
const packagedNodeModules = ${JSON.stringify(packagedNodeModules)};
const packagedAsar = path.dirname(packagedNodeModules);
const packagedResources = path.dirname(packagedAsar);
const allowedResolutionRoots = [
  fs.realpathSync(packagedAsar),
  fs.realpathSync(path.join(packagedResources, 'app.asar.unpacked')),
];
const commonJsBoundaryViolations = [];
const originalResolveFilename = Module._resolveFilename;

// This guard covers CommonJS require() resolution. ESM imports and direct file reads are
// outside this package smoke probe.
Module._resolveFilename = function (request, parent, isMain, options) {
  const resolved = originalResolveFilename.call(this, request, parent, isMain, options);
  const isBuiltin =
    resolved.startsWith('node:') || Module.builtinModules.includes(resolved);
  const isPackaged = allowedResolutionRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );

  if (!isBuiltin && !isPackaged) {
    const violation = 'COMMONJS_BOUNDARY_VIOLATION:' + request + ' -> ' + resolved;
    commonJsBoundaryViolations.push(violation);
    throw new Error(violation);
  }

  return resolved;
};

process.on('exit', () => {
  if (commonJsBoundaryViolations.length > 0) {
    process.stderr.write(commonJsBoundaryViolations.join('\\n') + '\\n');
    process.exitCode = 1;
  }
});
`.trim();
}

function packagedDependencySmokeScript(
  packagedNodeModules: string,
  dependencies: string[],
): string {
  return `
{
const smokePath = require('path');
const smokeNodeModules = ${JSON.stringify(packagedNodeModules)};
const smokeDependencies = ${JSON.stringify(dependencies)};

for (const dependency of smokeDependencies) {
  require(smokePath.join(smokeNodeModules, dependency));
}

const anthropicHelper = require(
  smokePath.join(smokeNodeModules, '@anthropic-ai/sdk/helpers/beta/json-schema.js'),
);
const outputFormat = anthropicHelper.betaJSONSchemaOutputFormat(
  { type: 'object', properties: {} },
  { transform: false },
);
if (outputFormat.parse('{"ok":true}').ok !== true) {
  throw new Error('Anthropic JSON schema helper failed');
}

const whisper = require(smokePath.join(smokeNodeModules, '@remotion/install-whisper-cpp'));
const transcription = [
  {
    text: ' AudioBash',
    offsets: { from: 120, to: 420 },
    tokens: [{ t_dtw: 12, p: 0.9 }],
  },
];
const legacyCaptions = whisper.convertToCaptions({
  transcription,
  combineTokensWithinMilliseconds: 100,
});
const captions = whisper.toCaptions({ whisperCppOutput: { transcription } });
if (
  JSON.stringify(legacyCaptions.captions) !==
    JSON.stringify([{ text: 'AudioBash', startInSeconds: 0.12 }]) ||
  JSON.stringify(captions.captions) !==
    JSON.stringify([
      {
        text: 'AudioBash',
        startMs: 120,
        endMs: 420,
        timestampMs: 120,
        confidence: 0.9,
      },
    ])
) {
  throw new Error('Whisper caption conversion failed');
}

console.log('PACKAGED_DEPENDENCIES_OK');
}
`.trim();
}

function packagedDependencyProbeScript(
  packagedNodeModules: string,
  dependencies: string[],
): string {
  return [
    commonJsResolutionBoundaryScript(packagedNodeModules),
    packagedDependencySmokeScript(packagedNodeModules, dependencies),
  ].join('\n');
}

function packagedElevenLabsRequestProbeScript(
  packagedNodeModules: string,
  packagedHelper: string,
  expectedArchitecture: string,
): string {
  return [
    commonJsResolutionBoundaryScript(packagedNodeModules),
    `
const { sendElevenLabsRequest } = require(${JSON.stringify(packagedHelper)});

(async () => {
  if (process.arch !== ${JSON.stringify(expectedArchitecture)}) {
    throw new Error(
      'Package architecture mismatch: expected ${expectedArchitecture}, received ' + process.arch,
    );
  }

  const sourceBytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  const result = await sendElevenLabsRequest({
    audioBuffer: sourceBytes,
    apiKey: 'package-probe-key',
    fetchImpl: async (input, init) => {
      if (new Headers(init.headers).has('content-type')) {
        throw new Error('Package helper set an explicit multipart Content-Type');
      }

      const request = new Request(input, init);
      const body = await request.formData();
      const audio = body.get('file');
      if (!audio || typeof audio === 'string') {
        throw new Error('Package helper omitted the ElevenLabs file field');
      }

      const actualBytes = [...new Uint8Array(await audio.arrayBuffer())];
      if (
        request.method !== 'POST' ||
        request.headers.get('xi-api-key') !== 'package-probe-key' ||
        body.get('model_id') !== 'scribe_v1' ||
        audio.name !== 'audio.webm' ||
        audio.type !== 'audio/webm' ||
        JSON.stringify(actualBytes) !== JSON.stringify([...sourceBytes])
      ) {
        throw new Error('Package helper built an invalid ElevenLabs request');
      }

      return new Response(JSON.stringify({ text: 'package probe ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  if (result.text !== 'package probe ok') {
    throw new Error('Package helper did not parse its response');
  }

  console.log('PACKAGED_ELEVENLABS_REQUEST_OK_${expectedArchitecture}');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`.trim(),
  ].join('\n');
}

function createPackagedProbeEnvironment(isolatedRoot: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ELECTRON_RUN_AS_NODE: '1',
    AUDIOBASH_PACKAGE_PROBE_ROOT: isolatedRoot,
  };

  for (const name of inheritedProbeEnvironmentNames) {
    const value = process.env[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }

  return environment;
}

function runPackagedDependencyProbe(appExecutable: string, script: string): string {
  const isolatedWorkingDirectory = mkdtempSync(join(tmpdir(), 'audiobash-package-probe-'));

  try {
    return execFileSync(appExecutable, ['-e', script], {
      cwd: isolatedWorkingDirectory,
      encoding: 'utf8',
      env: createPackagedProbeEnvironment(isolatedWorkingDirectory),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  } finally {
    rmSync(isolatedWorkingDirectory, { recursive: true, force: true });
  }
}

function runFailingPackagedDependencyProbe(appExecutable: string, script: string): string {
  let failure: unknown;

  try {
    runPackagedDependencyProbe(appExecutable, script);
  } catch (error) {
    failure = error;
  }

  if (failure === undefined) {
    throw new Error('Expected the packaged dependency probe to fail');
  }

  if (
    typeof failure !== 'object' ||
    failure === null ||
    !('stderr' in failure) ||
    typeof failure.stderr !== 'string'
  ) {
    throw failure;
  }

  return failure.stderr;
}

function withEnvironmentVariable<T>(name: string, value: string, callback: () => T): T {
  const previousValue = process.env[name];
  process.env[name] = value;

  try {
    return callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previousValue;
    }
  }
}

describe('packaged CommonJS dependency probe isolation', () => {
  const arm64AppPath = join(releaseDir, 'mac-arm64', `${packageJson.build.productName}.app`);
  const arm64Executable = join(arm64AppPath, 'Contents/MacOS', packageJson.build.productName);
  const packagedNodeModules = join(arm64AppPath, 'Contents/Resources/app.asar/node_modules');

  it('rejects a dependency that resolves outside the packaged app', () => {
    const injectedDirectory = mkdtempSync(join(tmpdir(), 'audiobash-injected-module-'));
    const injectedPackage = join(injectedDirectory, 'source-only-package');
    mkdirSync(injectedPackage);
    const injectedEntry = join(injectedPackage, 'index.js');
    writeFileSync(injectedEntry, 'module.exports = true;\n');
    const script = [
      commonJsResolutionBoundaryScript(packagedNodeModules),
      `require(${JSON.stringify(injectedEntry)});`,
    ].join('\n');

    try {
      const expectedViolation = `COMMONJS_BOUNDARY_VIOLATION:${injectedEntry} -> ${realpathSync(injectedEntry)}`;
      const stderr = runFailingPackagedDependencyProbe(arm64Executable, script);

      expect(stderr.split(/\r?\n/)).toContain(expectedViolation);
    } finally {
      rmSync(injectedDirectory, { recursive: true, force: true });
    }
  }, 70_000);

  it('does not inherit unrelated parent environment variables', () => {
    const script = [
      'if (process.env.AUDIOBASH_PACKAGE_PROBE_INJECTED) {',
      "  throw new Error('Unrelated parent environment variable was inherited');",
      '}',
      "console.log('PARENT_ENVIRONMENT_CLEARED');",
    ].join('\n');

    const output = withEnvironmentVariable('AUDIOBASH_PACKAGE_PROBE_INJECTED', 'true', () =>
      runPackagedDependencyProbe(arm64Executable, script),
    );
    expect(output).toContain('PARENT_ENVIRONMENT_CLEARED');
  }, 70_000);

  it('fails when a dependency catches an external CommonJS resolution', () => {
    const injectedDirectory = mkdtempSync(join(tmpdir(), 'audiobash-caught-module-'));
    const injectedEntry = join(injectedDirectory, 'caught-source-module.js');
    writeFileSync(injectedEntry, 'module.exports = true;\n');
    const script = [
      commonJsResolutionBoundaryScript(packagedNodeModules),
      `try { require(${JSON.stringify(injectedEntry)}); } catch {}`,
    ].join('\n');

    try {
      const expectedViolation = `COMMONJS_BOUNDARY_VIOLATION:${injectedEntry} -> ${realpathSync(injectedEntry)}`;
      const stderr = runFailingPackagedDependencyProbe(arm64Executable, script);

      expect(stderr.split(/\r?\n/)).toContain(expectedViolation);
    } finally {
      rmSync(injectedDirectory, { recursive: true, force: true });
    }
  }, 70_000);
});

describe('node-pty prebuild inventory policy', () => {
  it('detects every entry outside the target architecture directory', () => {
    const targetPrebuild = '/node_modules/node-pty/prebuilds/darwin-arm64';
    const entries = [
      `${targetPrebuild}/pty.node`,
      '/node_modules/node-pty/prebuilds/win32-x64/winpty.dll',
      '/node_modules/node-pty/prebuilds/win32-x64/winpty-agent.exe',
    ];

    expect(listPrebuildEntriesOutsideTarget(entries, targetPrebuild)).toEqual(entries.slice(1));
  });

  it('detects TypeScript test files outside the source directory', () => {
    const testFile = '/node_modules/node-pty/lib/runtime.test.ts';

    expect(listForbiddenNodePtyEntries([testFile])).toEqual([testFile]);
  });

  it('reports a missing required package directory clearly', () => {
    const missingDirectory = join(rootDir, '.audit', 'missing-package-directory');

    expect(() => listRequiredFiles(missingDirectory)).toThrow(
      `Required package directory is missing: ${missingDirectory}`,
    );
  });
});

describe.each(packages)('macOS $architecture package', (packageTarget) => {
  const appPath = join(
    releaseDir,
    packageTarget.appDirectory,
    `${packageJson.build.productName}.app`,
  );
  const resourcesPath = join(appPath, 'Contents/Resources');
  const asarPath = join(resourcesPath, 'app.asar');
  let cachedPackageEntries: string[] | undefined;

  function packageEntries(): string[] {
    cachedPackageEntries ??= listAsar(asarPath);
    return cachedPackageEntries;
  }

  it('contains a runnable application bundle', () => {
    expect(existsSync(join(appPath, 'Contents/MacOS', packageJson.build.productName))).toBe(true);
    expect(existsSync(join(appPath, 'Contents/Resources/app.asar'))).toBe(true);
  });

  it('does not ship renderer libraries or their ONNX source trees twice', () => {
    const entries = packageEntries();
    const forbiddenPrefixes = [
      '/node_modules/@ricky0123',
      '/node_modules/@xterm',
      '/node_modules/onnxruntime-common',
      '/node_modules/onnxruntime-web',
      '/node_modules/react',
      '/node_modules/react-dom',
    ];

    for (const prefix of forbiddenPrefixes) {
      expect(entries.filter((entry) => entry === prefix || entry.startsWith(`${prefix}/`))).toEqual(
        [],
      );
    }
  });

  it('does not ship installed dependency trees that the mac runtime does not use', () => {
    const entries = packageEntries();
    const forbiddenPrefixes = [
      '/node_modules/node-addon-api',
      '/node_modules/json-schema-to-ts',
      '/node_modules/ts-algebra',
      '/node_modules/@babel/runtime',
      '/node_modules/@remotion/captions',
    ];

    for (const prefix of forbiddenPrefixes) {
      expect(entries.filter((entry) => entry === prefix || entry.startsWith(`${prefix}/`))).toEqual(
        [],
      );
    }
  });

  it('contains only target node-pty prebuild files and no build-only source', () => {
    const entries = packageEntries();
    const targetPrebuild = `/node_modules/node-pty/prebuilds/darwin-${packageTarget.architecture}`;
    const prebuildFiles = entries.filter((entry) => entry.startsWith(`${targetPrebuild}/`));
    const forbiddenNodePtyEntries = listForbiddenNodePtyEntries(entries);

    expect(prebuildFiles.sort()).toEqual(
      [`${targetPrebuild}/pty.node`, `${targetPrebuild}/spawn-helper`].sort(),
    );
    expect(listPrebuildEntriesOutsideTarget(entries, targetPrebuild)).toEqual([]);
    expect(forbiddenNodePtyEntries).toEqual([]);
  });

  it('physically unpacks only the target node-pty binaries', () => {
    const unpackedRoot = join(resourcesPath, 'app.asar.unpacked');
    const targetPrebuild = `/node_modules/node-pty/prebuilds/darwin-${packageTarget.architecture}`;

    expect(listRequiredFiles(unpackedRoot).sort()).toEqual(
      [`${targetPrebuild}/pty.node`, `${targetPrebuild}/spawn-helper`].sort(),
    );
  });

  it('keeps the renderer entry point, PTY runtime, and main-process SDKs', () => {
    const entries = packageEntries();
    const requiredEntries = [
      '/dist/index.html',
      '/electron/elevenLabsRequest.cjs',
      '/electron/main.cjs',
      '/electron/transcriptionHandlers.cjs',
      '/electron/transcriptionRequest.cjs',
      '/node_modules/@anthropic-ai/sdk',
      '/node_modules/@google/generative-ai',
      '/node_modules/@remotion/install-whisper-cpp',
      '/node_modules/node-pty/lib/index.js',
      '/node_modules/node-pty/package.json',
      '/node_modules/openai',
    ];

    for (const entry of requiredEntries) {
      expect(entries).toContain(entry);
    }

    expect(entries.some((entry) => /^\/dist\/assets\/index-.*\.js$/.test(entry))).toBe(true);
  });

  it('loads every unbundled main-process dependency from the packaged ASAR', () => {
    const appExecutable = join(appPath, 'Contents/MacOS', packageJson.build.productName);
    const packagedNodeModules = join(resourcesPath, 'app.asar', 'node_modules');
    const dependencies = [
      '@anthropic-ai/sdk',
      '@google/generative-ai',
      '@remotion/install-whisper-cpp',
      'node-pty',
      'openai',
    ];
    const script = packagedDependencyProbeScript(packagedNodeModules, dependencies);
    const output = runPackagedDependencyProbe(appExecutable, script);

    expect(output).toContain('PACKAGED_DEPENDENCIES_OK');
  }, 70_000);

  it('builds a native ElevenLabs request from the packaged ASAR', () => {
    const entries = packageEntries();
    expect(entries.some((entry) => entry === '/node_modules/form-data')).toBe(false);
    expect(entries.some((entry) => entry.startsWith('/node_modules/form-data/'))).toBe(false);
    expect(readAsarText(asarPath, '/electron/main.cjs')).not.toContain("require('form-data')");

    const appExecutable = join(appPath, 'Contents/MacOS', packageJson.build.productName);
    const packagedNodeModules = join(resourcesPath, 'app.asar', 'node_modules');
    const packagedHelper = join(resourcesPath, 'app.asar', 'electron', 'elevenLabsRequest.cjs');
    const script = packagedElevenLabsRequestProbeScript(
      packagedNodeModules,
      packagedHelper,
      packageTarget.architecture,
    );
    const output = runPackagedDependencyProbe(appExecutable, script);

    expect(output).toContain(`PACKAGED_ELEVENLABS_REQUEST_OK_${packageTarget.architecture}`);
  }, 70_000);

  it('does not ship retired remote-control files', () => {
    const entries = packageEntries();
    const retiredEntries = [
      '/dist/_headers',
      '/dist/css/styles.css',
      '/dist/js/app.js',
      '/dist/js/terminal.js',
      '/dist/js/voice.js',
      '/dist/js/websocket.js',
      '/dist/manifest.json',
      '/dist/service-worker.js',
    ];

    for (const entry of retiredEntries) {
      expect(entries).not.toContain(entry);
    }
  });

  it('keeps one renderer sound set and only the selected VAD runtime', () => {
    const entries = packageEntries();
    const resourceFiles = listRequiredFiles(resourcesPath);

    for (const sound of ['start.mp3', 'stop.mp3', 'success.mp3', 'error.mp3']) {
      expect(entries).toContain(`/dist/assets/${sound}`);
      expect(resourceFiles).not.toContain(`/assets/${sound}`);
    }

    expect(entries.filter((entry) => entry.startsWith('/dist/vad/')).sort()).toEqual(
      [
        '/dist/vad/ort-wasm-simd-threaded.mjs',
        '/dist/vad/ort-wasm-simd-threaded.wasm',
        '/dist/vad/silero_vad_legacy.onnx',
        '/dist/vad/vad.worklet.bundle.min.js',
      ].sort(),
    );

    const rendererChunkEntries = entries.filter((entry) => /^\/dist\/assets\/.*\.js$/.test(entry));
    const rendererHTML = readAsarText(asarPath, '/dist/index.html');
    const entryMatch = rendererHTML.match(/<script[^>]+src="\.\/(assets\/index-[^"]+\.js)"/);
    expect(entryMatch).not.toBeNull();

    const rendererEntry = `/dist/${entryMatch?.[1]}`;
    const entrySource = readAsarText(asarPath, rendererEntry);
    const vadMarker = /silero_vad|onnxruntime|vad\.worklet/;
    const deferredVADChunks = rendererChunkEntries.filter(
      (entry) => entry !== rendererEntry && vadMarker.test(readAsarText(asarPath, entry)),
    );

    expect(vadMarker.test(entrySource)).toBe(false);
    expect(deferredVADChunks.length).toBeGreaterThan(0);
    for (const deferredChunk of deferredVADChunks) {
      expect(entrySource).toContain(deferredChunk.split('/').at(-1));
    }

    expect(entries).toContain('/dist/favicon.svg');
    expect(resourceFiles).toContain('/audiobash-logo.png');
    expect(resourceFiles).not.toContain('/audiobash-logo.ico');
  });

  it('contains an executable node-pty helper for its architecture', () => {
    const spawnHelperPath = join(
      appPath,
      'Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds',
      `darwin-${packageTarget.architecture}`,
      'spawn-helper',
    );

    expect(existsSync(spawnHelperPath)).toBe(true);
    expect(statSync(spawnHelperPath).mode & 0o111).not.toBe(0);
  });

  it.each(['dmg', 'zip'] as const)(
    'contains a valid current-version %s artifact',
    (extension) => {
      const expectedArtifactPath = artifactPath(packageTarget.architecture, extension);

      expect(existsSync(expectedArtifactPath), expectedArtifactPath).toBe(true);
      expect(statSync(expectedArtifactPath).size).toBeGreaterThan(0);

      if (extension === 'dmg') {
        execFileSync('hdiutil', ['verify', expectedArtifactPath], {
          stdio: 'pipe',
          timeout: 15_000,
        });
      } else {
        execFileSync('unzip', ['-tq', expectedArtifactPath], {
          stdio: 'pipe',
          timeout: 15_000,
        });
      }
    },
    20_000,
  );
});
