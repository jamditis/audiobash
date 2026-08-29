'use strict';

const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');

if (process.env.AUDIOBASH_IGNORE_SIGTERM) process.on('SIGTERM', () => {});
const childScript = process.env.AUDIOBASH_IGNORE_SIGTERM
  ? "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
  : 'setInterval(() => {}, 1000)';
const child = spawn(process.execPath, ['-e', childScript], {
  detached: Boolean(process.env.AUDIOBASH_CHILD_DETACHED),
  stdio: process.env.AUDIOBASH_CHILD_INHERITS_STDIO ? 'inherit' : 'ignore',
});

const processIds = { childPid: child.pid, parentPid: process.pid };
if (process.env.AUDIOBASH_PROCESS_IDS_PATH) {
  writeFileSync(process.env.AUDIOBASH_PROCESS_IDS_PATH, JSON.stringify(processIds));
}
process.stdout.write(`${JSON.stringify(processIds)}\n`);
if (process.env.AUDIOBASH_EXIT_AFTER_SPAWN) {
  process.exit(Number(process.env.AUDIOBASH_EXIT_CODE || 0));
}
setInterval(() => {}, 1000);
