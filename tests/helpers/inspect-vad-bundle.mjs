import { build } from 'vite';
import { join } from 'node:path';

const rootDir = process.argv[2];
if (!rootDir) throw new Error('AudioBash root directory is required');

function normalizeModuleId(moduleId) {
  return moduleId.replaceAll('\\', '/');
}

function isVADRuntimeModule(moduleId) {
  const normalizedId = normalizeModuleId(moduleId);
  return (
    normalizedId.includes('/node_modules/@ricky0123/vad-web/') ||
    normalizedId.includes('/node_modules/onnxruntime-web/')
  );
}

function collectChunkClosure(firstChunkNames, chunksByName, linkedChunks) {
  const closure = new Set();
  const pending = [...firstChunkNames];

  while (pending.length > 0) {
    const chunkName = pending.pop();
    if (!chunkName || closure.has(chunkName)) continue;

    closure.add(chunkName);
    const chunk = chunksByName.get(chunkName);
    if (chunk) pending.push(...linkedChunks(chunk));
  }

  return closure;
}

const buildResult = await build({
  configFile: join(rootDir, 'vite.config.ts'),
  logLevel: 'silent',
  build: { write: false },
});
const output = (Array.isArray(buildResult) ? buildResult : [buildResult]).flatMap(
  (result) => result.output,
);
const chunks = output.filter((item) => item.type === 'chunk');
const assets = output.filter((item) => item.type === 'asset');
const entryChunk = chunks.find((chunk) => chunk.isEntry);

if (!entryChunk) throw new Error('Renderer entry chunk was not generated');

const chunksByName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
const vadOwnerChunks = chunks.filter((chunk) =>
  Object.keys(chunk.modules).some(isVADRuntimeModule),
);
const staticClosure = collectChunkClosure(
  [entryChunk.fileName],
  chunksByName,
  (chunk) => chunk.imports,
);
const dynamicClosure = collectChunkClosure(entryChunk.dynamicImports, chunksByName, (chunk) => [
  ...chunk.imports,
  ...chunk.dynamicImports,
]);
const staticVADModules = [...staticClosure].flatMap((chunkName) =>
  Object.keys(chunksByName.get(chunkName)?.modules ?? {}).filter(isVADRuntimeModule),
);
const entryHTML = assets.find((asset) => asset.fileName === 'index.html');
const entryHTMLSource = entryHTML ? String(entryHTML.source) : '';

process.stdout.write(
  JSON.stringify({
    entryChunk: entryChunk.fileName,
    entryCharacters: entryChunk.code.length,
    entryBytes: Buffer.byteLength(entryChunk.code, 'utf8'),
    vadOwnerChunks: vadOwnerChunks.map((chunk) => ({
      fileName: chunk.fileName,
      characters: chunk.code.length,
      bytes: Buffer.byteLength(chunk.code, 'utf8'),
    })),
    staticVADModules: staticVADModules.map(normalizeModuleId),
    allVADOwnersAreDeferred: vadOwnerChunks.every((chunk) => dynamicClosure.has(chunk.fileName)),
    entryPreloadsVAD: vadOwnerChunks.some((chunk) => entryHTMLSource.includes(chunk.fileName)),
  }),
);
