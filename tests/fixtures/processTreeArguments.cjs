'use strict';

const { writeFileSync } = require('node:fs');

if (!process.env.AUDIOBASH_ARGUMENTS_PATH) {
  throw new Error('AUDIOBASH_ARGUMENTS_PATH is required');
}

writeFileSync(process.env.AUDIOBASH_ARGUMENTS_PATH, JSON.stringify(process.argv.slice(2)));
