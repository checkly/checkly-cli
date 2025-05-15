import { describe, it, expect } from 'vitest'

import { PackageJsonFile } from '../package-json-file'

describe('package.json file', () => {
  it('should upsert devDependencies (general use)', async () => {
    const testFile = PackageJsonFile.make('package.json', {
      name: 'foo',
      version: '1.0.0',
    })

    expect(testFile.devDependencies).toBeUndefined()

    expect(testFile.upsertDevDependencies({ a: '^6.24.0' })).toBe(true)
    expect(testFile.devDependencies).toEqual({
      a: '^6.24.0',
    })

    expect(testFile.upsertDevDependencies({ b: '1.0.0' })).toBe(true)
    expect(testFile.devDependencies).toEqual({
      a: '^6.24.0',
      b: '1.0.0',
    })

    expect(testFile.upsertDevDependencies({ b: '2.0.0' })).toBe(true)
    expect(testFile.devDependencies).toEqual({
      a: '^6.24.0',
      b: '2.0.0',
    })

    expect(testFile.upsertDevDependencies({ a: '^5.2.0' })).toBe(false)
    expect(testFile.devDependencies).toEqual({
      a: '^6.24.0',
      b: '2.0.0',
    })
  })

  it('should upsert devDependencies if newer', async () => {
    const testFile = PackageJsonFile.make('package.json', {
      name: 'foo',
      version: '1.0.0',
      devDependencies: {
        checkly: '^4',
      },
    })

    expect(testFile.upsertDevDependencies({ checkly: '^5' })).toBe(true)
    expect(testFile.devDependencies).toEqual({
      checkly: '^5',
    })
  })

  it('should not upsert devDependencies if older', async () => {
    const testFile = PackageJsonFile.make('package.json', {
      name: 'foo',
      version: '1.0.0',
      devDependencies: {
        checkly: '^5',
      },
    })

    expect(testFile.upsertDevDependencies({ checkly: '^4' })).toBe(false)
    expect(testFile.devDependencies).toEqual({
      checkly: '^5',
    })
  })

  it('should not upsert devDependencies if equal', async () => {
    const testFile = PackageJsonFile.make('package.json', {
      name: 'foo',
      version: '1.0.0',
      devDependencies: {
        checkly: '^5',
      },
    })

    expect(testFile.upsertDevDependencies({ checkly: '^5' })).toBe(false)
    expect(testFile.devDependencies).toEqual({
      checkly: '^5',
    })
  })
})
