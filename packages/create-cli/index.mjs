#!/usr/bin/env node
/* eslint-disable no-console */

const currentVersion = process.versions.node;
const requiredVersion = parseInt(currentVersion.split('.')[0], 10);
const minimumVersion = 16;

if (requiredVersion < minimumVersion) {
  console.error(`You are running Node.js v${currentVersion}. The Checkly CLI requires Node.js v${minimumVersion} or higher.`)
  process.exit(1);
}

import('./dist/index.js').then(({ main }) => main());
