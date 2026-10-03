#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy-remote.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const failures = [];

if (!/^\s*workflow_dispatch:\s*$/m.test(workflow)) {
  failures.push('expected the workflow to keep manual dispatch enabled');
}

if (!/^\s*branches:\s*\n\s*- master\s*$/m.test(workflow)) {
  failures.push('expected push deployments to remain limited to master');
}

if (!/^\s*deploy:\s*\n(?:\s{4}.*\n)*?\s{4}if:\s*github\.ref\s*==\s*'refs\/heads\/master'\s*$/m.test(workflow)) {
  failures.push('expected the deploy job to reject manually dispatched non-master refs');
}

if (!/pages deploy docs\/remote --project-name=audiobash --commit-dirty=true/.test(workflow)) {
  failures.push('expected the deployment command to keep publishing docs/remote to audiobash');
}

if (failures.length > 0) {
  console.error(`deploy workflow security check failed for ${workflowPath}:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('deploy workflow security check passed');
