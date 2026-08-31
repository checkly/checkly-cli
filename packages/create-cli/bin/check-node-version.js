// Keep minimumVersion in sync with engines.node in package.json (asserted by
// src/__tests__/node-floor.spec.ts). This module must stay dependency-free and
// use only long-established syntax: it runs before the Node version is known
// to be supported, so it has to load cleanly on runtimes far below the floor.
export const minimumVersion = '22.13.0'

export function belowMinimumVersion (currentVersion) {
  const [major, minor, patch] = currentVersion.split('.').map(Number)
  const [minMajor, minMinor, minPatch] = minimumVersion.split('.').map(Number)
  return major < minMajor
    || (major === minMajor && (minor < minMinor || (minor === minMinor && patch < minPatch)))
}
