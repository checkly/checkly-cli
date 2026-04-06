import { describe, it, expect } from 'vitest'

import { PackageJsonFile } from '../package-json-file'

describe('package.json file', () => {
  it('should upsert devDependencies (general use)', () => {
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

  it('should upsert devDependencies if newer', () => {
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

  it('should not upsert devDependencies if older', () => {
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

  it('should not upsert devDependencies if equal', () => {
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

  describe('resolveExportPath', () => {
    const importConditions = ['import', 'node', 'module-sync', 'default']
    const requireConditions = ['require', 'node', 'module-sync', 'default']

    it('resolves a string subpath', () => {
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'foo',
        version: '1.0.0',
        exports: {
          './sub': './lib/sub.js',
        },
      })

      const { paths } = testFile.resolveExportPath('./sub', importConditions)

      expect(paths).toHaveLength(1)
      expect(paths[0].target.path).toBe('./lib/sub.js')
    })

    it('resolves a single-level conditional export (import/require/default)', () => {
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'foo',
        version: '1.0.0',
        exports: {
          './x': {
            import: './lib/x.mjs',
            require: './lib/x.cjs',
            default: './lib/x.js',
          },
        } as any,
      })

      const importResult = testFile.resolveExportPath('./x', importConditions)
      expect(importResult.paths).toHaveLength(1)
      expect(importResult.paths[0].target.path).toBe('./lib/x.mjs')

      const requireResult = testFile.resolveExportPath('./x', requireConditions)
      expect(requireResult.paths).toHaveLength(1)
      expect(requireResult.paths[0].target.path).toBe('./lib/x.cjs')
    })

    it('resolves rimraf-style nested conditional exports (issue #1274)', () => {
      // Reproduces bug #1274: when import/require contain nested
      // { types, default } objects, the old resolver blew up with
      // "spec.split is not a function".
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'rimraf',
        version: '6.0.0',
        exports: {
          './main': {
            import: {
              types: './dist/esm/index.d.ts',
              default: './dist/esm/index.js',
            },
            require: {
              types: './dist/commonjs/index.d.ts',
              default: './dist/commonjs/index.js',
            },
          },
        } as any,
      })

      const importResult = testFile.resolveExportPath('./main', importConditions)
      expect(importResult.paths).toHaveLength(1)
      expect(importResult.paths[0].target.path).toBe('./dist/esm/index.js')

      const requireResult = testFile.resolveExportPath('./main', requireConditions)
      expect(requireResult.paths).toHaveLength(1)
      expect(requireResult.paths[0].target.path).toBe('./dist/commonjs/index.js')
    })

    it('resolves dotenv v17-style nested conditional exports (issue #1274)', () => {
      // dotenv v17's exports nests import/require inside each subpath with
      // { types, default } objects.
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'dotenv',
        version: '17.0.0',
        exports: {
          './main': {
            require: {
              types: './lib/main.d.ts',
              default: './lib/main.js',
            },
            import: {
              types: './lib/main.d.ts',
              default: './lib/main.js',
            },
            default: './lib/main.js',
          },
        } as any,
      })

      const result = testFile.resolveExportPath('./main', importConditions)
      expect(result.paths).toHaveLength(1)
      expect(result.paths[0].target.path).toBe('./lib/main.js')
    })

    it('does not throw on nested conditional exports even when the subpath is not requested', () => {
      // Guard against the original crash: even just building the resolver
      // used to throw because of the nested `{ types, default }` object
      // being fed to PathResolver.matcherForPath. This test asserts that
      // constructing the resolver succeeds regardless of which subpath
      // is requested.
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'rimraf',
        version: '6.0.0',
        exports: {
          './package.json': './package.json',
          './main': {
            import: {
              types: './dist/esm/index.d.ts',
              default: './dist/esm/index.js',
            },
            require: {
              types: './dist/commonjs/index.d.ts',
              default: './dist/commonjs/index.js',
            },
          },
        } as any,
      })

      expect(() => testFile.resolveExportPath('./package.json', importConditions))
        .not.toThrow()
    })

    it('falls back to default when no condition matches', () => {
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'foo',
        version: '1.0.0',
        exports: {
          './x': {
            // None of import/require/node/default match 'browser'.
            browser: './lib/x.browser.js',
            default: './lib/x.js',
          },
        } as any,
      })

      const { paths } = testFile.resolveExportPath('./x', importConditions)
      expect(paths).toHaveLength(1)
      expect(paths[0].target.path).toBe('./lib/x.js')
    })

    it('falls back to nested default when the outer condition matches but has no direct target', () => {
      // Nested conditions where `import` matches but the nested object
      // has only `types` + `default` — we should pick the nested default.
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'foo',
        version: '1.0.0',
        exports: {
          './x': {
            import: {
              types: './esm.d.ts',
              default: './esm.js',
            },
          },
        } as any,
      })

      const { paths } = testFile.resolveExportPath('./x', importConditions)
      expect(paths).toHaveLength(1)
      expect(paths[0].target.path).toBe('./esm.js')
    })

    it('treats null export target as "no export"', () => {
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'foo',
        version: '1.0.0',
        exports: {
          './a': './a.js',
          // Per Node.js spec, null blocks a path — treat as unresolved.
          './b': null,
        } as any,
      })

      const aResult = testFile.resolveExportPath('./a', importConditions)
      expect(aResult.paths).toHaveLength(1)
      expect(aResult.paths[0].target.path).toBe('./a.js')

      const bResult = testFile.resolveExportPath('./b', importConditions)
      expect(bResult.paths).toHaveLength(0)
    })

    it('resolves array fallback targets (first valid wins)', () => {
      const testFile = PackageJsonFile.make('/pkg/package.json', {
        name: 'foo',
        version: '1.0.0',
        exports: {
          './x': {
            import: ['./esm.mjs', './fallback.mjs'],
          },
        } as any,
      })

      const { paths } = testFile.resolveExportPath('./x', importConditions)
      expect(paths).toHaveLength(1)
      expect(paths[0].target.path).toBe('./esm.mjs')
    })
  })
})
