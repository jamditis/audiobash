// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';

interface ElevenLabsRequestOptions {
  audioBuffer: Buffer;
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

interface ElevenLabsRequestModule {
  sendElevenLabsRequest: (options: ElevenLabsRequestOptions) => Promise<unknown>;
}

const localRequire = createRequire(import.meta.url);
const rootDir = join(__dirname, '../..');
const helperPath = join(rootDir, 'electron', 'elevenLabsRequest.cjs');
const temporaryDirectories: string[] = [];
const inheritedEnvironmentNames = ['LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'TMPDIR'];

function loadRequestModule(): ElevenLabsRequestModule {
  return localRequire(helperPath) as ElevenLabsRequestModule;
}

function childEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...extra };

  for (const name of inheritedEnvironmentNames) {
    const value = process.env[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }

  return environment;
}

function listCommonJsSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listCommonJsSources(entryPath);
    }
    return entry.name.endsWith('.cjs') ? [entryPath] : [];
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function multipartRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Request> {
  const suppliedHeaders = new Headers(init?.headers);
  expect(suppliedHeaders.has('content-type')).toBe(false);

  const request = new Request(input, init);
  expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data;\s*boundary=.+$/i);
  return request;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('native ElevenLabs batch request', () => {
  it('does not declare or statically require the third-party form-data package', () => {
    const manifest = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    expect(manifest.dependencies?.['form-data']).toBeUndefined();
    expect(manifest.devDependencies?.['form-data']).toBeUndefined();

    const staticRequire = /\brequire\s*\(\s*['"]form-data['"]\s*\)/;
    for (const sourcePath of listCommonJsSources(join(rootDir, 'electron'))) {
      expect(readFileSync(sourcePath, 'utf8'), sourcePath).not.toMatch(staticRequire);
    }
  });

  it('sends the official file field with exact audio metadata, bytes, model, and API key', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();
    const audioBytes = Buffer.from([0x00, 0x01, 0x02, 0x7f, 0x80, 0xff]);
    const apiKey = 'test-elevenlabs-key';
    let observedRequest: Request | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      observedRequest = await multipartRequest(input, init);
      return jsonResponse({ text: 'fixture transcript' });
    });

    await sendElevenLabsRequest({ audioBuffer: audioBytes, apiKey, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(observedRequest).toBeDefined();
    if (!observedRequest) throw new Error('Expected an ElevenLabs request');

    expect(observedRequest.url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(observedRequest.method).toBe('POST');
    expect(observedRequest.headers.get('xi-api-key')).toBe(apiKey);

    const body = await observedRequest.formData();
    expect([...body.keys()].sort()).toEqual(['file', 'model_id']);
    expect(body.get('model_id')).toBe('scribe_v1');

    const audioFile = body.get('file');
    expect(audioFile).toBeInstanceOf(File);
    if (!(audioFile instanceof File)) throw new Error('Expected the file field to contain audio');

    expect(audioFile.name).toBe('audio.webm');
    expect(audioFile.type).toBe('audio/webm');
    expect([...new Uint8Array(await audioFile.arrayBuffer())]).toEqual([...audioBytes]);
  });

  it('creates a fresh multipart body for each call', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();
    const bodies: BodyInit[] = [];
    const requests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.body) throw new Error('Expected a multipart request body');
      bodies.push(init.body);
      requests.push(await multipartRequest(input, init));
      return jsonResponse({ text: 'ok' });
    });
    const options = {
      audioBuffer: Buffer.from([0x10, 0x20, 0x30]),
      apiKey: 'test-key',
      fetchImpl,
    };

    await sendElevenLabsRequest(options);
    await sendElevenLabsRequest(options);

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toBe(bodies[1]);
    for (const request of requests) {
      const body = await request.formData();
      const audioFile = body.get('file');
      expect(audioFile).toBeInstanceOf(File);
      if (!(audioFile instanceof File)) throw new Error('Expected a fresh audio file');
      expect([...new Uint8Array(await audioFile.arrayBuffer())]).toEqual([0x10, 0x20, 0x30]);
    }
  });

  it('returns successful JSON', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();
    const responseBody = { text: 'hello from ElevenLabs', language_code: 'en' };

    await expect(
      sendElevenLabsRequest({
        audioBuffer: Buffer.from('audio'),
        apiKey: 'test-key',
        fetchImpl: vi.fn(async () => jsonResponse(responseBody)),
      }),
    ).resolves.toEqual(responseBody);
  });

  it('rejects a successful response with invalid JSON', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();

    await expect(
      sendElevenLabsRequest({
        audioBuffer: Buffer.from('audio'),
        apiKey: 'test-key',
        fetchImpl: vi.fn(
          async () =>
            new Response('{not-json', {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      }),
    ).rejects.toThrow(/invalid JSON/i);
  });

  it('reports a stable non-2xx status without reflecting the API key or response body', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();
    const apiKey = 'secret-key-must-not-appear';
    let caughtError: unknown;

    try {
      await sendElevenLabsRequest({
        audioBuffer: Buffer.from('audio'),
        apiKey,
        fetchImpl: vi.fn(
          async () => new Response(`Unsupported file format for key ${apiKey}`, { status: 422 }),
        ),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError).toMatchObject({ status: 422 });
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    expect(message).toBe('ElevenLabs API error: 422');
    expect(message).not.toContain(apiKey);
    expect(message).not.toContain('Unsupported file format');
  });

  it('keeps the provider status when its error body cannot be read', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();
    const response = {
      ok: false,
      status: 503,
      text: vi.fn().mockRejectedValue(new Error('Response body failed')),
    } as unknown as Response;

    await expect(
      sendElevenLabsRequest({
        audioBuffer: Buffer.from('audio'),
        apiKey: 'test-key',
        fetchImpl: vi.fn(async () => response),
      }),
    ).rejects.toMatchObject({
      message: 'ElevenLabs API error: 503',
      status: 503,
    });
    expect(response.text).not.toHaveBeenCalled();
  });

  it('forwards the caller abort signal to fetch', async () => {
    const { sendElevenLabsRequest } = loadRequestModule();
    const controller = new AbortController();
    let observedSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal;
      return jsonResponse({ text: 'ok' });
    });

    await sendElevenLabsRequest({
      audioBuffer: Buffer.from('audio'),
      apiKey: 'test-key',
      signal: controller.signal,
      fetchImpl,
    });

    expect(observedSignal).toBe(controller.signal);
  });

  it('loads and runs after a production prune with no third-party module resolution', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'audiobash-elevenlabs-request-'));
    temporaryDirectories.push(fixtureDir);
    const fixtureHelper = join(fixtureDir, 'elevenLabsRequest.cjs');
    const sentinelModule = join(fixtureDir, 'node_modules', 'form-data');

    copyFileSync(helperPath, fixtureHelper);
    writeFileSync(
      join(fixtureDir, 'package.json'),
      JSON.stringify({ name: 'audiobash-elevenlabs-fixture', version: '1.0.0', private: true }),
    );
    writeFileSync(join(fixtureDir, 'user.npmrc'), '');
    writeFileSync(join(fixtureDir, 'global.npmrc'), '');
    mkdirSync(sentinelModule, { recursive: true });
    writeFileSync(
      join(sentinelModule, 'package.json'),
      JSON.stringify({ name: 'form-data', version: '0.0.0', main: 'index.cjs' }),
    );
    writeFileSync(
      join(sentinelModule, 'index.cjs'),
      "throw new Error('The pruned form-data sentinel was loaded');\n",
    );

    const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(
      npmExecutable,
      ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'],
      {
        cwd: fixtureDir,
        env: childEnvironment({
          NODE_PATH: '',
          npm_config_cache: join(fixtureDir, '.npm-cache'),
          npm_config_globalconfig: join(fixtureDir, 'global.npmrc'),
          npm_config_userconfig: join(fixtureDir, 'user.npmrc'),
          npm_config_update_notifier: 'false',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    );
    expect(existsSync(sentinelModule)).toBe(false);

    const fixtureProbe = join(fixtureDir, 'probe.cjs');
    writeFileSync(
      fixtureProbe,
      `
const Module = require('node:module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const isBuiltin = request.startsWith('node:') || Module.builtinModules.includes(request);
  const isLocal = request.startsWith('.') || require('node:path').isAbsolute(request);
  if (!isBuiltin && !isLocal) throw new Error('THIRD_PARTY_RESOLUTION:' + request);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { sendElevenLabsRequest } = require('./elevenLabsRequest.cjs');

(async () => {
  const audioBytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  const result = await sendElevenLabsRequest({
    audioBuffer: audioBytes,
    apiKey: 'fixture-key',
    fetchImpl: async (input, init) => {
      if (new Headers(init.headers).has('content-type')) {
        throw new Error('EXPLICIT_MULTIPART_CONTENT_TYPE');
      }
      const request = new Request(input, init);
      const body = await request.formData();
      const file = body.get('file');
      const outputBytes = [...new Uint8Array(await file.arrayBuffer())];
      if (
        file.name !== 'audio.webm' ||
        file.type !== 'audio/webm' ||
        body.get('model_id') !== 'scribe_v1' ||
        request.headers.get('xi-api-key') !== 'fixture-key' ||
        JSON.stringify(outputBytes) !== JSON.stringify([...audioBytes])
      ) {
        throw new Error('INVALID_MULTIPART_REQUEST');
      }
      return new Response(JSON.stringify({ text: 'fixture ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  if (result.text !== 'fixture ok') throw new Error('INVALID_FIXTURE_RESPONSE');
  process.stdout.write('PRUNED_ELEVENLABS_REQUEST_OK\\n');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`.trimStart(),
    );

    const output = execFileSync(process.execPath, [fixtureProbe], {
      cwd: fixtureDir,
      encoding: 'utf8',
      env: childEnvironment({ NODE_PATH: '' }),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });

    expect(output).toContain('PRUNED_ELEVENLABS_REQUEST_OK');
  });
});
