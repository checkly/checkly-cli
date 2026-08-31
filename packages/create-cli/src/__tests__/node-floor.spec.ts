import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { belowMinimumVersion, minimumVersion } from '../../bin/check-node-version.js'

// The minimum supported Node version is declared in three independent places:
// engines.node in both published packages, and the preflight constant in
// bin/check-node-version.js (which cannot read package.json because it must
// run before any dependency is guaranteed to be installed). Nothing else
// keeps them aligned, so assert it here to stop a future floor bump from
// moving one and silently leaving the others behind.
describe('Node version floor', () => {
  const packageDir = path.join(import.meta.dirname, '..', '..')

  function readEngines (packageJsonPath: string): string {
    const { engines } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    return engines.node
  }

  const createCliEngines = readEngines(path.join(packageDir, 'package.json'))
  const cliEngines = readEngines(path.join(packageDir, '..', 'cli', 'package.json'))

  it('declares the same engines.node in checkly and create-checkly', () => {
    expect(createCliEngines).toEqual(cliEngines)
  })

  it('uses the engines.node minimum in the bin preflight', () => {
    const enginesMinimum = createCliEngines.match(/^>=(\d+\.\d+\.\d+)$/)?.[1]
    expect(enginesMinimum).toBeDefined()
    expect(minimumVersion).toEqual(enginesMinimum)
  })

  it.each([
    ['18.20.0', true],
    ['20.19.5', true],
    ['22.12.9', true],
    ['22.13.0', false],
    ['22.13.1', false],
    ['22.14.0', false],
    ['23.0.0', false],
    ['24.1.0', false],
  ])('judges Node %s as below the minimum supported version: %s', (version, below) => {
    expect(belowMinimumVersion(version)).toEqual(below)
  })

  it('imports @oclif/core only after the version check', () => {
    const binRun = fs.readFileSync(path.join(packageDir, 'bin', 'run'), 'utf8')
    // A static import would be hoisted and evaluate @oclif/core's dependency
    // graph before the preflight, so the check must use a dynamic import.
    expect(binRun).toMatch(/await import\('@oclif\/core'\)/)
    expect(binRun).not.toMatch(/^import .*'@oclif\/core'/m)
  })
})
