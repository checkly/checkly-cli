#!/usr/bin/env node
'use strict'

// Node version preflight. This entry must load and run on any Node version,
// however old, so it can print a useful message instead of whatever error an
// unsupported runtime would hit inside the dependency graph. That means plain
// CommonJS with long-established syntax only, and no ESM syntax in any form:
// a dynamic import() expression would already fail to parse on old Node. The
// real CLI lives in ./launch.cjs, which is required only after the check
// passes — require defers parsing, so modern syntax is safe there.
const { minimumVersion, belowMinimumVersion } = require('./check-node-version.cjs')

const currentVersion = process.versions.node

// Bun and Deno pin process.versions.node to a fixed value that may sit below
// the supported floor even though the CLI works there. Let them through; on
// real commands they still get the soft engines warning printed during
// command init. A runtime that reports no Node version at all is also let
// through: belowMinimumVersion would throw on a missing version, replacing
// the friendly message with a stack trace.
const isCheckableNodeRuntime = !process.versions.bun && !process.versions.deno && !!currentVersion

const skipRequested = process.env.CHECKLY_SKIP_NODE_VERSION_CHECK === '1'

if (!skipRequested && isCheckableNodeRuntime && belowMinimumVersion(currentVersion)) {
  console.error(`You are running Node.js v${currentVersion}. The Checkly CLI requires Node.js v${minimumVersion} or higher.`)
  console.error('If you cannot upgrade Node.js, the checkly@8 release line still supports Node.js 20 (>=20.19.0).')
  console.error('Set CHECKLY_SKIP_NODE_VERSION_CHECK=1 (in the shell environment, not .env) to attempt to run anyway.')
  process.exit(1)
}

// Cache V8 bytecode for the CLI bundle across runs (Node >= 22.8), so warm
// runs skip re-parsing the bundle entirely. Best effort: a no-op when the
// runtime does not provide it or the cache directory is not writable.
// Old-syntax only (var, no optional chaining): like the rest of this file,
// it must parse on runtimes old enough to need the version message above.
/* eslint-disable no-var */
try {
  var nodeModule = require('node:module')
  if (nodeModule && typeof nodeModule.enableCompileCache === 'function') {
    nodeModule.enableCompileCache()
  }
// eslint-disable-next-line no-empty
} catch (err) {} /* eslint-enable no-var */

require('./launch.cjs')
