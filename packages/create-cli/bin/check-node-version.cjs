'use strict'

// Keep minimumVersion in sync with engines.node in package.json (asserted by
// src/__tests__/node-floor.spec.ts). This module must stay dependency-free and
// use only long-established syntax: it runs before the Node version is known
// to be supported, so it has to load cleanly on runtimes far below the floor.
// It is duplicated verbatim in the other package's bin/; create-checkly's
// node-floor spec asserts the two copies are byte-identical, so change both
// together.
const minimumVersion = '22.13.0'

function belowMinimumVersion (currentVersion) {
  // Strip any prerelease suffix (e.g. 22.13.0-rc.1): Number('0-rc') is NaN and
  // NaN comparisons are always false, which would let such builds through.
  const [major, minor, patch] = currentVersion.split('-')[0].split('.').map(Number)
  const [minMajor, minMinor, minPatch] = minimumVersion.split('.').map(Number)
  return major < minMajor
    || (major === minMajor && (minor < minMinor || (minor === minMinor && patch < minPatch)))
}

module.exports = { minimumVersion, belowMinimumVersion }
