import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { Parser } from '../parser.js'
import { FixtureSandbox } from '../../../testing/fixture-sandbox.js'
import { BunDetector, NpmDetector, PNpmDetector } from '../package-files/package-manager.js'
import { FAUX_PACKAGE_DESCRIPTION } from '../faux-package.js'
import { Workspace } from '../package-files/workspace.js'

const defaultNpmModules = [
  'timers', 'tls', 'url', 'util', 'zlib', '@faker-js/faker', '@opentelemetry/api', '@opentelemetry/sd-trace-base',
  '@playwright/test', 'aws4', 'axios', 'btoa', 'chai', 'chai-string', 'crypto-js', 'expect', 'form-data',
  'jsonwebtoken', 'lodash', 'mocha', 'moment', 'otpauth', 'playwright', 'uuid',
]

describe('dependency-parser - parser()', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    // These fixtures do not need packages as they are not executed and
    // therefore do not import anything.
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'check-parser-fixtures'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  describe('unrestricted mode', () => {
    describe('workspaces', () => {
      const realFileEntry = (filePath: string) => {
        return {
          filePath,
          content: fs.readFileSync(filePath, 'utf8'),
        }
      }

      const fauxFileEntry = (filePath: string) => {
        return {
          filePath,
          content: expect.stringContaining(FAUX_PACKAGE_DESCRIPTION),
        }
      }

      describe('pnpm workspaces', () => {
        describe('pnpm-depend-on-workspace-package-in-root-package', () => {
          const toAbsolutePath = (...filepath: string[]) => fixt.abspath(
            'pnpm-depend-on-workspace-package-in-root-package',
            ...filepath,
          )

          const packageManager = new PNpmDetector()

          let workspace: Workspace | undefined
          beforeAll(async () => {
            workspace = await packageManager.lookupWorkspace(toAbsolutePath('.'))
            expect(workspace).toBeDefined()
          })

          it('should find all dependencies', async () => {
            const parser = new Parser({
              checkUnsupportedModules: false,
              restricted: false,
              workspace,
            })
            const { dependencies } = await parser.parse(toAbsolutePath('apps/main/tests/foo.spec.js'))
            const got = dependencies.sort((a, b) => a.filePath.localeCompare(b.filePath))
            const want = [
              realFileEntry(toAbsolutePath('apps/depended-on-by-main-and-root/index.js')),
              realFileEntry(toAbsolutePath('apps/depended-on-by-main-and-root/package.json')),
              realFileEntry(toAbsolutePath('apps/depended-on-by-main/index.js')),
              realFileEntry(toAbsolutePath('apps/depended-on-by-main/package.json')),
              fauxFileEntry(toAbsolutePath('apps/depended-on-by-neighbor-depended-on-by-main/package.json')),
              fauxFileEntry(toAbsolutePath('apps/depended-on-by-root/package.json')),
              realFileEntry(toAbsolutePath('apps/main/package.json')),
              realFileEntry(toAbsolutePath('package.json')),
              realFileEntry(toAbsolutePath('pnpm-lock.yaml')),
              realFileEntry(toAbsolutePath('pnpm-workspace.yaml')),
            ]
            // Only check paths first, makes missing files easier to see.
            expect(got.map(({ filePath }) => filePath)).toEqual(want.map(({ filePath }) => filePath))
            expect(got).toEqual(want)
          })
        })
      })

      describe('npm workspaces', () => {
        describe('npm-depend-on-workspace-package-in-root-package', () => {
          const toAbsolutePath = (...filepath: string[]) => fixt.abspath(
            'npm-depend-on-workspace-package-in-root-package',
            ...filepath,
          )

          const packageManager = new NpmDetector()

          let workspace: Workspace | undefined
          beforeAll(async () => {
            workspace = await packageManager.lookupWorkspace(toAbsolutePath('.'))
            expect(workspace).toBeDefined()
          })

          it('should find all dependencies', async () => {
            const parser = new Parser({
              checkUnsupportedModules: false,
              restricted: false,
              workspace,
            })
            const { dependencies } = await parser.parse(toAbsolutePath('apps/main/tests/foo.spec.js'))
            const got = dependencies.sort((a, b) => a.filePath.localeCompare(b.filePath))
            const want = [
              realFileEntry(toAbsolutePath('apps/depended-on-by-main-and-root/index.js')),
              realFileEntry(toAbsolutePath('apps/depended-on-by-main-and-root/package.json')),
              realFileEntry(toAbsolutePath('apps/depended-on-by-main/index.js')),
              realFileEntry(toAbsolutePath('apps/depended-on-by-main/package.json')),
              fauxFileEntry(toAbsolutePath('apps/depended-on-by-neighbor-depended-on-by-main/package.json')),
              fauxFileEntry(toAbsolutePath('apps/depended-on-by-root/package.json')),
              realFileEntry(toAbsolutePath('apps/main/package.json')),
              realFileEntry(toAbsolutePath('package-lock.json')),
              realFileEntry(toAbsolutePath('package.json')),
            ]
            // Only check paths first, makes missing files easier to see.
            expect(got.map(({ filePath }) => filePath)).toEqual(want.map(({ filePath }) => filePath))
            expect(got).toEqual(want)
          })
        })
      })

      describe('bun workspaces', () => {
        // Regression test for #1324: Bun (and Yarn classic) allow the root
        // package.json `workspaces` field to be an object
        // (`{ packages: [...], catalogs: {...} }`) rather than a plain array of
        // glob patterns. Workspace discovery used to assume an array and crashed
        // with `TypeError: patterns.map is not a function`.
        describe('bun-workspace-object-form-in-root-package', () => {
          const toAbsolutePath = (...filepath: string[]) => fixt.abspath(
            'bun-workspace-object-form-in-root-package',
            ...filepath,
          )

          const packageManager = new BunDetector()

          let workspace: Workspace | undefined
          beforeAll(async () => {
            workspace = await packageManager.lookupWorkspace(toAbsolutePath('.'))
            expect(workspace).toBeDefined()
          })

          it('should discover workspace members from object-form workspaces', () => {
            expect(workspace?.memberByName('sibling')).toBeDefined()
          })

          it('should resolve dependencies on sibling workspace packages', async () => {
            const parser = new Parser({
              checkUnsupportedModules: false,
              restricted: false,
              workspace,
            })
            const { dependencies } = await parser.parse(toAbsolutePath('apps/main/tests/foo.spec.js'))
            const filePaths = dependencies.map(({ filePath }) => filePath)
            expect(filePaths).toContain(toAbsolutePath('apps/sibling/index.js'))
            expect(filePaths).toContain(toAbsolutePath('apps/sibling/package.json'))
          })
        })
      })
    })

    it('should handle JS file with no dependencies', async () => {
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(fixt.abspath('no-dependencies.js'))
      expect(dependencies.map(d => d.filePath)).toHaveLength(0)
    })

    it('should handle JS file with dependencies', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('simple-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should report a missing entrypoint file', async () => {
      const missingEntrypoint = fixt.abspath('does-not-exist.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: false,
        })
        await parser.parse(missingEntrypoint)
      } catch (err) {
        expect(err).toMatchObject({ missingFiles: [missingEntrypoint] })
      }
    })

    it('should report missing check dependencies', async () => {
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: false,
        })
        await parser.parse(fixt.abspath('missing-dependencies.js'))
      } catch (err) {
        expect(err).toMatchObject({
          missingFiles: [
            fixt.abspath('does-not-exist.js'),
            fixt.abspath('does-not-exist2.js'),
          ],
        })
      }
    })

    it('should report syntax errors', async () => {
      const entrypoint = fixt.abspath('syntax-error.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: false,
        })
        await parser.parse(entrypoint)
      } catch (err) {
        expect(err).toMatchObject({
          parseErrors: [
            { file: entrypoint, error: 'Unexpected token (4:70)' },
          ],
        })
      }
    })

    it('should report unsupported dependencies', async () => {
      const entrypoint = fixt.abspath('unsupported-dependencies.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: false,
        })
        await parser.parse(entrypoint)
      } catch (err) {
        expect(err).toMatchObject({
          unsupportedNpmDependencies: [{
            file: entrypoint,
            unsupportedDependencies: ['left-pad', 'right-pad'],
          }],
        })
      }
    })

    it('should allow unsupported dependencies if configured to do so', async () => {
      const entrypoint = fixt.abspath('unsupported-dependencies.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        checkUnsupportedModules: false,
        restricted: false,
      })
      await parser.parse(entrypoint)
    })

    it('should handle circular dependencies', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('circular-dependencies', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should parse typescript dependencies', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('typescript-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should parse typescript dependencies relying on tsconfig when tsconfig has comments', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-json-text', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('lib', 'foo1.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should parse typescript dependencies using tsconfig paths', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-paths-sample-project', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should parse typescript dependencies using tsconfig paths relative to baseUrl', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-paths-baseurl-relative', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should always include tsconfig even if not needed', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-paths-unused', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should support importing ts extensions if allowed', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-allow-importing-ts-extensions', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('src', 'dep1.ts'),
        toAbsolutePath('src', 'dep2.ts'),
        toAbsolutePath('src', 'dep3.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should resolve tsconfig paths inherited through a relative extends', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-relative', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('package.json'),
        toAbsolutePath('src', 'lib', 'foo.ts'),
        toAbsolutePath('tsconfig.base.json'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should apply the last extends entry when extends is an array', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-array', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('from-b', 'thing.ts'),
        toAbsolutePath('package.json'),
        toAbsolutePath('tsconfig.a.json'),
        toAbsolutePath('tsconfig.b.json'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should bundle a workspace-member config reached through extends', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-workspace', ...filepath)
      const workspace = await new NpmDetector().lookupWorkspace(toAbsolutePath('.'))
      expect(workspace).toBeDefined()
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
        workspace,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('package-lock.json'),
        toAbsolutePath('package.json'),
        toAbsolutePath('packages', 'config', 'package.json'),
        toAbsolutePath('packages', 'config', 'tsconfig.json'),
        toAbsolutePath('src', 'lib', 'thing.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should read options from an external node_modules config without bundling it', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-node-modules', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      // The `@ext/*` alias is defined only in the external config, so its
      // presence proves the inherited options were read. The external config
      // and its package.json appear only as the nearest config of the resolved
      // in-package file, not because the extends chain bundled them.
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('node_modules', '@fake', 'tsconfig', 'lib', 'util.ts'),
        toAbsolutePath('node_modules', '@fake', 'tsconfig', 'package.json'),
        toAbsolutePath('node_modules', '@fake', 'tsconfig', 'tsconfig.json'),
        toAbsolutePath('package.json'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should resolve jsconfig paths inherited through extends', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-jsconfig', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.js'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('jsconfig.base.json'),
        toAbsolutePath('jsconfig.json'),
        toAbsolutePath('package.json'),
        toAbsolutePath('src', 'lib', 'foo.js'),
      ])
    })

    it('should not import TS files from a JS file', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('no-import-ts-from-js', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should import JS files from a TS file', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('import-js-from-ts', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.js'),
        toAbsolutePath('dep3.ts'),
      ])
    })

    it('should handle ES Modules', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('esmodules-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should handle Common JS and ES Modules', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('common-esm-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
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

    it('should handle node: prefix for built-ins', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('builtin-with-node-prefix', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      await parser.parse(toAbsolutePath('entrypoint.ts'))
    })

    /*
   * There is an unhandled edge-case when require() is reassigned.
   * Even though the check might execute fine, we throw an error for a missing dependency.
   * We could address this by keeping track of assignments as we walk the AST.
   */
    it.skip('should ignore cases where require is reassigned', async () => {
      const entrypoint = fixt.abspath('reassign-require.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      await parser.parse(entrypoint)
    })

    // Checks run on Checkly are wrapped to support top level await.
    // For consistency with checks created via the UI, the CLI should support this as well.
    it('should allow top-level await', async () => {
      const entrypoint = fixt.abspath('top-level-await.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      await parser.parse(entrypoint)
    })

    it('should allow top-level await in TypeScript', async () => {
      const entrypoint = fixt.abspath('top-level-await.ts')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })
      await parser.parse(entrypoint)
    })

    it('should silently skip native binary (.node) imports (issue #1274)', async () => {
      // Native addons are loaded by Node.js at runtime via process.dlopen
      // and are not parseable as JavaScript. The parser should neither
      // report them as missing nor include them in the dependency set.
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('native-binary-import', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })

      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))

      // The .node file should not appear in the bundled dependencies and
      // parsing must not throw a DependencyParseError.
      expect(dependencies.map(d => d.filePath)).not.toContain(toAbsolutePath('native.node'))
    })

    it('should resolve package.json subpath #imports', async () => {
      // Node.js subpath imports (the package.json `imports` field, referenced
      // via `#`-prefixed specifiers) must be discovered and bundled
      // automatically, without a manual `include`.
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('subpath-imports', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })

      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      const filePaths = dependencies.map(d => d.filePath)

      // Both a direct relative target (#config) and a wildcard-mapped target
      // (#internal/bar) are bundled.
      expect(filePaths).toContain(toAbsolutePath('config.js'))
      expect(filePaths).toContain(toAbsolutePath('src', 'internal', 'bar.js'))

      // The raw `#`-specifiers must never leak into the dependency set, and the
      // external target (#dep -> lodash) is recorded as external, not bundled.
      expect(filePaths.some(filePath => filePath.includes('#'))).toBe(false)
      expect(filePaths.some(filePath => filePath.includes('lodash'))).toBe(false)
    })

    it('should resolve a package.json exports field', async () => {
      // The imported package exposes its entry point only through a conditional
      // `exports` map (no `main`), so the target file is discovered solely via
      // exports resolution. The `node` condition is selected: the earlier,
      // non-matching `browser` condition is skipped and the `default` fallback
      // is not reached.
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('package-exports', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: false,
      })

      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      const filePaths = dependencies.map(d => d.filePath)

      expect(filePaths).toContain(toAbsolutePath('local-pkg', 'lib', 'main.js'))
      expect(filePaths).not.toContain(toAbsolutePath('local-pkg', 'lib', 'browser.js'))
      expect(filePaths).not.toContain(toAbsolutePath('local-pkg', 'lib', 'fallback.js'))
    })
  })

  describe('restricted mode', () => {
    it('should handle JS file with no dependencies', async () => {
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(fixt.abspath('no-dependencies.js'))
      expect(dependencies.map(d => d.filePath)).toHaveLength(0)
    })

    it('should handle JS file with dependencies', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('simple-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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

    it('should resolve relative subpath #imports', async () => {
      // In restricted mode the nearest package.json is not bundled, so the
      // `imports` map is unavailable at runtime (a documented limitation), but
      // dependency resolution must still discover the mapped target files
      // and must not crash.
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('subpath-imports', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })

      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      const filePaths = dependencies.map(d => d.filePath)

      expect(filePaths).toContain(toAbsolutePath('config.js'))
      expect(filePaths).toContain(toAbsolutePath('src', 'internal', 'bar.js'))
      expect(filePaths.some(filePath => filePath.includes('#'))).toBe(false)
    })

    it('should resolve a package.json exports field', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('package-exports', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })

      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.js'))
      const filePaths = dependencies.map(d => d.filePath)

      expect(filePaths).toContain(toAbsolutePath('local-pkg', 'lib', 'main.js'))
      expect(filePaths).not.toContain(toAbsolutePath('local-pkg', 'lib', 'browser.js'))
      expect(filePaths).not.toContain(toAbsolutePath('local-pkg', 'lib', 'fallback.js'))
    })

    it('should report a missing entrypoint file', async () => {
      const missingEntrypoint = fixt.abspath('does-not-exist.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: true,
        })
        await parser.parse(missingEntrypoint)
      } catch (err) {
        expect(err).toMatchObject({ missingFiles: [missingEntrypoint] })
      }
    })

    it('should report missing check dependencies', async () => {
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: true,
        })
        await parser.parse(fixt.abspath('missing-dependencies.js'))
      } catch (err) {
        expect(err).toMatchObject({
          missingFiles: [
            fixt.abspath('does-not-exist.js'),
            fixt.abspath('does-not-exist2.js'),
          ],
        })
      }
    })

    it('should report syntax errors', async () => {
      const entrypoint = fixt.abspath('syntax-error.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: true,
        })
        await parser.parse(entrypoint)
      } catch (err) {
        expect(err).toMatchObject({
          parseErrors: [
            { file: entrypoint, error: 'Unexpected token (4:70)' },
          ],
        })
      }
    })

    it('should report unsupported dependencies', async () => {
      const entrypoint = fixt.abspath('unsupported-dependencies.js')
      expect.assertions(1)
      try {
        const parser = new Parser({
          supportedNpmModules: defaultNpmModules,
          restricted: true,
        })
        await parser.parse(entrypoint)
      } catch (err) {
        expect(err).toMatchObject({
          unsupportedNpmDependencies: [{
            file: entrypoint,
            unsupportedDependencies: ['left-pad', 'right-pad'],
          }],
        })
      }
    })

    it('should allow unsupported dependencies if configured to do so', async () => {
      const entrypoint = fixt.abspath('unsupported-dependencies.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        checkUnsupportedModules: false,
        restricted: true,
      })
      await parser.parse(entrypoint)
    })

    it('should handle circular dependencies', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('circular-dependencies', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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

    it('should parse typescript dependencies', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('typescript-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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

    it('should parse typescript dependencies relying on tsconfig when tsconfig has comments', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-json-text', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('lib', 'foo1.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should parse typescript dependencies using tsconfig paths', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-paths-sample-project', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should parse typescript dependencies using tsconfig paths relative to baseUrl', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-paths-baseurl-relative', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('src', 'lib1', 'file1.ts'),
        toAbsolutePath('src', 'lib1', 'file2.ts'),
        toAbsolutePath('src', 'lib1', 'folder', 'file1.ts'),
        toAbsolutePath('src', 'lib1', 'folder', 'file2.ts'),
        toAbsolutePath('src', 'lib1', 'index.ts'),
        toAbsolutePath('src', 'lib1', 'package.json'),
        toAbsolutePath('src', 'lib1', 'tsconfig.json'),
        toAbsolutePath('src', 'lib2', 'index.ts'),
        toAbsolutePath('src', 'lib3', 'foo', 'bar.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should not include tsconfig if not needed', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-paths-unused', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([])
    })

    it('should support importing ts extensions if allowed', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-allow-importing-ts-extensions', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('src', 'dep1.ts'),
        toAbsolutePath('src', 'dep2.ts'),
        toAbsolutePath('src', 'dep3.ts'),
      ])
    })

    it('should bundle a relative extends base needed for path resolution', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-relative', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      // The nearest package.json/tsconfig are not bundled in restricted mode, but
      // the extends base is still pulled in via the supporting-config path
      // because it is needed to resolve the `@/foo` alias.
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('src', 'lib', 'foo.ts'),
        toAbsolutePath('tsconfig.base.json'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should not bundle an external node_modules config in restricted mode', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('tsconfig-extends-node-modules', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('src', 'entrypoint.ts'))
      // The inherited `@ext/*` alias still resolves, but the external config is
      // never bundled — only the leaf config and the resolved source remain.
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('node_modules', '@fake', 'tsconfig', 'lib', 'util.ts'),
        toAbsolutePath('tsconfig.json'),
      ])
    })

    it('should not import TS files from a JS file', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('no-import-ts-from-js', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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

    it('should import JS files from a TS file', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('import-js-from-ts', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      const { dependencies } = await parser.parse(toAbsolutePath('entrypoint.ts'))
      expect(dependencies.map(d => d.filePath).sort()).toEqual([
        toAbsolutePath('dep1.js'),
        toAbsolutePath('dep2.js'),
        toAbsolutePath('dep3.ts'),
      ])
    })

    it('should handle ES Modules', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('esmodules-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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

    it('should handle Common JS and ES Modules', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('common-esm-example', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
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

    it('should handle node: prefix for built-ins', async () => {
      const toAbsolutePath = (...filepath: string[]) => fixt.abspath('builtin-with-node-prefix', ...filepath)
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      await parser.parse(toAbsolutePath('entrypoint.ts'))
    })

    /*
   * There is an unhandled edge-case when require() is reassigned.
   * Even though the check might execute fine, we throw an error for a missing dependency.
   * We could address this by keeping track of assignments as we walk the AST.
   */
    it.skip('should ignore cases where require is reassigned', async () => {
      const entrypoint = fixt.abspath('reassign-require.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      await parser.parse(entrypoint)
    })

    // Checks run on Checkly are wrapped to support top level await.
    // For consistency with checks created via the UI, the CLI should support this as well.
    it('should allow top-level await', async () => {
      const entrypoint = fixt.abspath('top-level-await.js')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      await parser.parse(entrypoint)
    })

    it('should allow top-level await in TypeScript', async () => {
      const entrypoint = fixt.abspath('top-level-await.ts')
      const parser = new Parser({
        supportedNpmModules: defaultNpmModules,
        restricted: true,
      })
      await parser.parse(entrypoint)
    })
  })
})
