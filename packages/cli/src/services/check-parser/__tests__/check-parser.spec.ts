import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { Parser } from '../parser'
import { usingIsolatedFixture } from './helper'

const defaultNpmModules = [
  'timers', 'tls', 'url', 'util', 'zlib', '@faker-js/faker', '@opentelemetry/api', '@opentelemetry/sd-trace-base',
  '@playwright/test', 'aws4', 'axios', 'btoa', 'chai', 'chai-string', 'crypto-js', 'expect', 'form-data',
  'jsonwebtoken', 'lodash', 'mocha', 'moment', 'otpauth', 'playwright', 'uuid',
]

describe('dependency-parser - parser()', () => {
  it('should handle JS file with no dependencies', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(path.join(dir, 'no-dependencies.js'))
      expect(dependencies.map(d => d.filePath)).toHaveLength(0)
    })
  })

  it('should handle JS file with dependencies', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'simple-example'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.js'),
        toAbsolutePath('dep3.js'),
        toAbsolutePath('module-package', 'main.js'),
        toAbsolutePath('module-package', 'package.json'),
        toAbsolutePath('module', 'index.js'),
      ])
    })
  })

  it('should report a missing entrypoint file', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const missingEntrypoint = path.join(dir, 'does-not-exist.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
        })
        await parser.parse(missingEntrypoint)
      } catch (err) {
        expect(err).toMatchObject({ missingFiles: [missingEntrypoint] })
      }
    })
  })

  it('should report missing check dependencies', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
        })
        await parser.parse(toAbsolutePath('missing-dependencies.js'))
      } catch (err) {
        expect(err).toMatchObject({ missingFiles: [toAbsolutePath('does-not-exist.js'), toAbsolutePath('does-not-exist2.js')] })
      }
    })
  })

  it('should report syntax errors', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const entrypoint = path.join(dir, 'syntax-error.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
        })
        await parser.parse(entrypoint)
      } catch (err) {
        expect(err).toMatchObject({ parseErrors: [{ file: entrypoint, error: 'Unexpected token (4:70)' }] })
      }
    })
  })

  it('should report unsupported dependencies', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const entrypoint = path.join(dir, 'unsupported-dependencies.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
        })
        await parser.parse(entrypoint)
      } catch (err) {
        expect(err).toMatchObject({ unsupportedNpmDependencies: [{ file: entrypoint, unsupportedDependencies: ['left-pad', 'right-pad'] }] })
      }
    })
  })

  it('should allow unsupported dependencies if configured to do so', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const entrypoint = path.join(dir, 'unsupported-dependencies.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        checkUnsupportedModules: false,
      })
      await parser.parse(entrypoint)
    })
  })

  it('should handle circular dependencies', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'circular-dependencies'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))

      // Circular dependencies are allowed in Node.js
      // We just need to test that parsing the dependencies doesn't loop indefinitely
      // https://nodejs.org/api/modules.html#modules_cycles
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.js'),
      ])
    })
  })

  it('should parse typescript dependencies', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'typescript-example'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.ts'),
        toAbsolutePath('dep2.ts'),
        toAbsolutePath('dep3.ts'),
        toAbsolutePath('dep4.js'),
        toAbsolutePath('dep5.ts'),
        toAbsolutePath('dep6.ts'),
        toAbsolutePath('module-package', 'main.js'),
        toAbsolutePath('module-package', 'package.json'),
        toAbsolutePath('module', 'index.ts'),
        toAbsolutePath('pages/external.first.page.js'),
        toAbsolutePath('pages/external.second.page.ts'),
        toAbsolutePath('type.ts'),
      ])
    })
  })

  it('should parse typescript dependencies relying on tsconfig when tsconfig has comments', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'tsconfig-json-text'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('lib', 'foo1.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })
  })

  it('should parse typescript dependencies using tsconfig paths', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-sample-project'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('lib1', 'file1.ts'),
        toAbsolutePath('lib1', 'file2.ts'),
        toAbsolutePath('lib1', 'folder', 'file1.ts'),
        toAbsolutePath('lib1', 'folder', 'file2.ts'),
        toAbsolutePath('lib1', 'index.ts'),
        toAbsolutePath('lib1', 'package.json'),
        toAbsolutePath('lib1', 'tsconfig.json'),
        toAbsolutePath('lib2', 'index.ts'),
        toAbsolutePath('lib3', 'foo', 'bar.ts'),
        toAbsolutePath('lib3', 'jsconfig.json'),
        toAbsolutePath('package.json'),
        toAbsolutePath('tsconfig.json'),
      ])
    })
  })

  it('should parse typescript dependencies using tsconfig paths relative to baseUrl', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-baseurl-relative'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('package.json'),
        toAbsolutePath('src', 'lib1', 'file1.ts'),
        toAbsolutePath('src', 'lib1', 'file2.ts'),
        toAbsolutePath('src', 'lib1', 'folder', 'file1.ts'),
        toAbsolutePath('src', 'lib1', 'folder', 'file2.ts'),
        toAbsolutePath('src', 'lib1', 'index.ts'),
        toAbsolutePath('src', 'lib1', 'package.json'),
        toAbsolutePath('src', 'lib1', 'tsconfig.json'),
        toAbsolutePath('src', 'lib2', 'index.ts'),
        toAbsolutePath('src', 'lib3', 'foo', 'bar.ts'),
        toAbsolutePath('src', 'lib3', 'jsconfig.json'),
        toAbsolutePath('tsconfig.json'),
      ])
    })
  })

  it('should always include tsconfig even if not needed', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-unused'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('tsconfig.json'),
      ])
    })
  })

  it('should support importing ts extensions if allowed', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'tsconfig-allow-importing-ts-extensions'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('src', 'dep1.ts'),
        toAbsolutePath('src', 'dep2.ts'),
        toAbsolutePath('src', 'dep3.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })
  })

  it('should not import TS files from a JS file', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'no-import-ts-from-js'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      expect.assertions(1)
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      } catch (err) {
        expect(err).toMatchObject({
          missingFiles: [
            toAbsolutePath('dep1'),
            toAbsolutePath('dep1.ts'),
            toAbsolutePath('dep1.js'),
          ],
        })
      }
    })
  })

  it('should import JS files from a TS file', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'import-js-from-ts'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.js'),
        toAbsolutePath('dep3.ts'),
      ])
    })
  })

  it('should handle ES Modules', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'esmodules-example'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.js'),
        toAbsolutePath('dep3.js'),
        toAbsolutePath('dep5.js'),
        toAbsolutePath('dep6.js'),
      ])
    })
  })

  it('should handle Common JS and ES Modules', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures', 'common-esm-example'), async dir => {
      const toAbsolutePath = (...filepath: string[]) => path.join(dir, ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.mjs'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.mjs'),
        toAbsolutePath('dep3.mjs'),
        toAbsolutePath('dep4.mjs'),
        toAbsolutePath('dep5.mjs'),
        toAbsolutePath('dep6.mjs'),
      ])
    })
  })

  it('should handle node: prefix for built-ins', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
    })
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'builtin-with-node-prefix', ...filepath)
    const parser = new Parser({
      supportedNpmModules: defaultNpmModules,
    })
    await parser.parse(toAbsolutePath('entrypoint.ts'))
  })

  /*
   * There is an unhandled edge-case when require() is reassigned.
   * Even though the check might execute fine, we throw an error for a missing dependency.
   * We could address this by keeping track of assignments as we walk the AST.
   */
  it.skip('should ignore cases where require is reassigned', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const entrypoint = path.join(dir, 'reassign-require.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      await parser.parse(entrypoint)
    })
  })

  // Checks run on Checkly are wrapped to support top level await.
  // For consistency with checks created via the UI, the CLI should support this as well.
  it('should allow top-level await', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const entrypoint = path.join(dir, 'top-level-await.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      await parser.parse(entrypoint)
    })
  })

  it('should allow top-level await in TypeScript', async () => {
    await usingIsolatedFixture(path.join(__dirname, 'check-parser-fixtures'), async dir => {
      const entrypoint = path.join(dir, 'top-level-await.ts')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
      })
      await parser.parse(entrypoint)
    })
  })
})
