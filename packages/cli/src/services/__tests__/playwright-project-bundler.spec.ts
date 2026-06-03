import path from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  getAutoIncludes,
  getPlaywrightVersionFromPackage,
} from '../playwright-project-bundler.js'
import { PackageManager } from '../check-parser/package-files/package-manager.js'

describe('getAutoIncludes()', () => {
  const basePath = path.resolve('/project')
  const makePm = (name: string): PackageManager => ({
    name,
    representativeLockfiles: [],
    representativeConfigFile: undefined,
    installCommand: () => ({ executable: name, args: ['install'], unsafeDisplayCommand: `${name} install` }),
    execCommand: (args: string[]) => ({ executable: name, args, unsafeDisplayCommand: `${name} ${args.join(' ')}` }),
    lookupWorkspace: () => Promise.resolve(undefined),
    detector: () => ({}) as any,
  })

  it('should return patches/*.patch for pnpm', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), [])
    expect(result).toEqual(['patches/*.patch'])
  })

  it('should return empty for npm', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('npm'), [])
    expect(result).toEqual([])
  })

  it('should return empty for yarn', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('yarn'), [])
    expect(result).toEqual([])
  })

  it('should skip when user already includes patches/*.patch', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), ['patches/*.patch'])
    expect(result).toEqual([])
  })

  it('should skip when user already includes a patches/ subpath', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), ['patches/some-patch.patch'])
    expect(result).toEqual([])
  })

  it('should skip when user includes ./patches/**', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), ['./patches/**'])
    expect(result).toEqual([])
  })

  it('should skip when user includes absolute patches path', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), [path.join(basePath, 'patches/**')])
    expect(result).toEqual([])
  })

  it('should return relative pattern when globCwd is a subdirectory', () => {
    const globCwd = path.resolve('/project/packages/app')
    const result = getAutoIncludes(basePath, globCwd, makePm('pnpm'), [])
    expect(result).toEqual(['../../patches/*.patch'])
  })

  it('should detect alreadyIncluded when patterns are relative to globCwd', () => {
    const globCwd = path.resolve('/project/packages/app')
    const result = getAutoIncludes(basePath, globCwd, makePm('pnpm'), ['../../patches/foo.patch'])
    expect(result).toEqual([])
  })
})

describe('getPlaywrightVersionFromPackage()', () => {
  it('should throw error when playwright package is not found', async () => {
    const nonExistentDir = '/tmp/non-existent-dir'
    await expect(getPlaywrightVersionFromPackage(nonExistentDir)).rejects.toThrow()
  })

  it('should get version from installed playwright package', async () => {
    // Use the current working directory which should have playwright installed
    const currentDir = process.cwd()
    const version = await getPlaywrightVersionFromPackage(currentDir)

    // Should return a valid semver version
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
