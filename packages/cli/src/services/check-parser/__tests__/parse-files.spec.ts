import { Parser } from '../parser'
import * as path from 'path'

describe('project parser - getFilesAndDependencies()', () => {
  it('should handle JS file with no dependencies', async () => {
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([path.join(__dirname, 'check-parser-fixtures', 'no-dependencies.js')])
    expect(res.files).toHaveLength(1)
    expect(res.errors).toHaveLength(0)
  })

  it('should handle JS file with dependencies', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.js'),
      toAbsolutePath('entrypoint.js'),
      toAbsolutePath('module-package', 'main.js'),
      toAbsolutePath('module-package', 'package.json'),
      toAbsolutePath('module', 'index.js'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('Should not repeat files if duplicated', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js'), toAbsolutePath('*.js')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.js'),
      toAbsolutePath('entrypoint.js'),
      toAbsolutePath('module-package', 'main.js'),
      toAbsolutePath('module-package', 'package.json'),
      toAbsolutePath('module', 'index.js'),
      toAbsolutePath('unreachable.js'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('should not fail on a non-existing glob', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('*.foo')])
    expect(res.files).toHaveLength(0)
    expect(res.errors).toHaveLength(0)
  })

  it('should not fail on a non-existing file', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('idonotexist.js')])
    expect(res.files).toHaveLength(0)
    expect(res.errors).toHaveLength(0)
  })

  it('should not fail on a non-existing directory', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example-that-does-not-exist', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('/')])
    expect(res.files).toHaveLength(0)
    expect(res.errors).toHaveLength(0)
  })

  it('should parse the cli in less than 400ms', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, '../../../', ...filepath)
    const startTimestamp = Date.now().valueOf()
    const res = await new Parser({}).getFilesAndDependencies([toAbsolutePath('/index.ts')])
    const endTimestamp = Date.now().valueOf()
    expect(res.files).not.toHaveLength(0)
    expect(res.errors).toHaveLength(0)
    expect(endTimestamp - startTimestamp).toBeLessThan(400)
  })

  it('should handle JS file with dependencies glob patterns', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('*.js'), toAbsolutePath('*.json')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.js'),
      toAbsolutePath('entrypoint.js'),
      toAbsolutePath('module-package', 'main.js'),
      toAbsolutePath('module-package', 'package.json'),
      toAbsolutePath('module', 'index.js'),
      toAbsolutePath('unreachable.js'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('should report a missing entrypoint file', async () => {
    const missingEntrypoint = path.join(__dirname, 'check-parser-fixtures', 'does-not-exist.js')
    try {
      const parser = new Parser({})
      await parser.getFilesAndDependencies([missingEntrypoint])
    } catch (err) {
      expect(err).toMatchObject({ missingFiles: [missingEntrypoint] })
    }
  })

  it('should report missing check dependencies', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', ...filepath)
    try {
      const parser = new Parser({})
      await parser.getFilesAndDependencies([toAbsolutePath('missing-dependencies.js')])
    } catch (err) {
      expect(err).toMatchObject({ missingFiles: [toAbsolutePath('does-not-exist.js'), toAbsolutePath('does-not-exist2.js')] })
    }
  })

  it('should report syntax errors', async () => {
    const entrypoint = path.join(__dirname, 'check-parser-fixtures', 'syntax-error.js')
    try {
      const parser = new Parser({})
      await parser.getFilesAndDependencies([entrypoint])
    } catch (err) {
      expect(err).toMatchObject({ parseErrors: [{ file: entrypoint, error: 'Unexpected token (4:70)' }] })
    }
  })

  it('should report unsupported dependencies', async () => {
    const entrypoint = path.join(__dirname, 'check-parser-fixtures', 'unsupported-dependencies.js')
    try {
      const parser = new Parser({})
      await parser.getFilesAndDependencies([entrypoint])
    } catch (err) {
      expect(err).toMatchObject({ unsupportedNpmDependencies: [{ file: entrypoint, unsupportedDependencies: ['left-pad', 'right-pad'] }] })
    }
  })

  it('should handle circular dependencies', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'circular-dependencies', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js')])

    // Circular dependencies are allowed in Node.js
    // We just need to test that parsing the dependencies doesn't loop indefinitely
    // https://nodejs.org/api/modules.html#modules_cycles
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('entrypoint.js'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('should parse typescript dependencies', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'typescript-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.ts')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.ts'),
      toAbsolutePath('dep2.ts'),
      toAbsolutePath('dep3.ts'),
      toAbsolutePath('dep4.js'),
      toAbsolutePath('dep5.ts'),
      toAbsolutePath('dep6.ts'),
      toAbsolutePath('entrypoint.ts'),
      toAbsolutePath('module-package', 'main.js'),
      toAbsolutePath('module-package', 'package.json'),
      toAbsolutePath('module', 'index.ts'),
      toAbsolutePath('pages/external.first.page.js'),
      toAbsolutePath('pages/external.second.page.ts'),
      toAbsolutePath('type.ts'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('should parse typescript dependencies using tsconfig', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-sample-project', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('src', 'entrypoint.ts')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('lib1', 'file1.ts'),
      toAbsolutePath('lib1', 'file2.ts'),
      toAbsolutePath('lib1', 'folder', 'file1.ts'),
      toAbsolutePath('lib1', 'folder', 'file2.ts'),
      toAbsolutePath('lib1', 'index.ts'),
      toAbsolutePath('lib1', 'package.json'),
      toAbsolutePath('lib1', 'tsconfig.json'),
      toAbsolutePath('lib2', 'index.ts'),
      toAbsolutePath('lib3', 'foo', 'bar.ts'),
      toAbsolutePath('src', 'entrypoint.ts'),
      toAbsolutePath('tsconfig.json'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('should not include tsconfig if not needed', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-unused', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('src', 'entrypoint.ts')])
    expect(res.files.sort()).toEqual([toAbsolutePath('src', 'entrypoint.ts')])
    expect(res.errors).toHaveLength(0)
  })

  it('should support importing ts extensions if allowed', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'tsconfig-allow-importing-ts-extensions', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('src', 'entrypoint.ts')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('src', 'dep1.ts'),
      toAbsolutePath('src', 'dep2.ts'),
      toAbsolutePath('src', 'dep3.ts'),
      toAbsolutePath('src', 'entrypoint.ts'),
    ])
    expect(res.errors).toHaveLength(0)
  })

  it('should not import TS files from a JS file', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'no-import-ts-from-js', ...filepath)
    const parser = new Parser({})
    expect.assertions(1)
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js')])
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
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'import-js-from-ts', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.ts')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.ts'),
      toAbsolutePath('entrypoint.ts'),
    ])
  })

  it('should handle ES Modules', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'esmodules-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.js'),
      toAbsolutePath('dep5.js'),
      toAbsolutePath('dep6.js'),
      toAbsolutePath('entrypoint.js'),
    ])
  })

  it('should handle Common JS and ES Modules', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'common-esm-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.mjs')])
    expect(res.files.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.mjs'),
      toAbsolutePath('dep3.mjs'),
      toAbsolutePath('dep4.mjs'),
      toAbsolutePath('dep5.mjs'),
      toAbsolutePath('dep6.mjs'),
      toAbsolutePath('entrypoint.mjs'),
    ])
  })

  it('should handle node: prefix for built-ins', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'builtin-with-node-prefix', ...filepath)
    const parser = new Parser({})
    await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.ts')])
  })

  /*
   * There is an unhandled edge-case when require() is reassigned.
   * Even though the check might execute fine, we throw an error for a missing dependency.
   * We could address this by keeping track of assignments as we walk the AST.
   */
  it.skip('should ignore cases where require is reassigned', async () => {
    const entrypoint = path.join(__dirname, 'check-parser-fixtures', 'reassign-require.js')
    const parser = new Parser({})
    await parser.getFilesAndDependencies([entrypoint])
  })

  // Checks run on Checkly are wrapped to support top level await.
  // For consistency with checks created via the UI, the CLI should support this as well.
  it('should allow top-level await', async () => {
    const entrypoint = path.join(__dirname, 'check-parser-fixtures', 'top-level-await.js')
    const parser = new Parser({})
    await parser.getFilesAndDependencies([entrypoint])
  })

  it('should allow top-level await in TypeScript', async () => {
    const entrypoint = path.join(__dirname, 'check-parser-fixtures', 'top-level-await.ts')
    const parser = new Parser({})
    await parser.getFilesAndDependencies([entrypoint])
  })
})
