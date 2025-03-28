import { Parser } from '../parser'
import * as path from 'path'
import { pathToPosix } from '../../util'

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
    const expectedFiles = [
      'dep1.js',
      'dep2.js',
      'dep3.js',
      'entrypoint.js',
      'module-package/main.js',
      'module-package/package.json',
      'module/index.js',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
    expect(res.errors).toHaveLength(0)
  })

  it('Should not repeat files if duplicated', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js'), toAbsolutePath('*.js')])
    const expectedFiles = [
      'dep1.js',
      'dep2.js',
      'dep3.js',
      'entrypoint.js',
      'module-package/main.js',
      'module-package/package.json',
      'module/index.js',
      'unreachable.js',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
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
    const isCI = process.env.CI === 'true'
    expect(endTimestamp - startTimestamp).toBeLessThan(isCI ? 2000 : 400)
  })

  it('should handle JS file with dependencies glob patterns', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'simple-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('*.js'), toAbsolutePath('*.json')])
    const expectedFiles = [
      'dep1.js',
      'dep2.js',
      'dep3.js',
      'entrypoint.js',
      'module-package/main.js',
      'module-package/package.json',
      'module/index.js',
      'unreachable.js',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
    expect(res.errors).toHaveLength(0)
  })

  it('should parse typescript dependencies', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'typescript-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.ts')])
    const expectedFiles = [
      'dep1.ts',
      'dep2.ts',
      'dep3.ts',
      'dep4.js',
      'dep5.ts',
      'dep6.ts',
      'entrypoint.ts',
      'module-package/main.js',
      'module-package/package.json',
      'module/index.ts',
      'pages/external.first.page.js',
      'pages/external.second.page.ts',
      'type.ts',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
    expect(res.errors).toHaveLength(0)
  })

  it('should parse typescript dependencies using tsconfig', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-sample-project', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('src', 'entrypoint.ts')])
    const expectedFiles = [
      'lib1/file1.ts',
      'lib1/file2.ts',
      'lib1/folder/file1.ts',
      'lib1/folder/file2.ts',
      'lib1/index.ts',
      'lib1/package.json',
      'lib1/tsconfig.json',
      'lib2/index.ts',
      'lib3/foo/bar.ts',
      'src/entrypoint.ts',
      'tsconfig.json',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
    expect(res.errors).toHaveLength(0)
  })

  it('should not include tsconfig if not needed', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'tsconfig-paths-unused', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('src', 'entrypoint.ts')])
    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual([pathToPosix(toAbsolutePath('src', 'entrypoint.ts'))])
    expect(res.errors).toHaveLength(0)
  })

  it('should support importing ts extensions if allowed', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'tsconfig-allow-importing-ts-extensions', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('src', 'entrypoint.ts')])
    const expectedFiles = [
      'src/dep1.ts',
      'src/dep2.ts',
      'src/dep3.ts',
      'src/entrypoint.ts',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
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
          pathToPosix(toAbsolutePath('dep1')),
          pathToPosix(toAbsolutePath('dep1.ts')),
          pathToPosix(toAbsolutePath('dep1.js')),
        ],
      })
    }
  })

  it('should import JS files from a TS file', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'import-js-from-ts', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.ts')])
    const expectedFiles = [
      'dep1.js',
      'dep2.js',
      'dep3.ts',
      'entrypoint.ts',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
  })

  it('should handle ES Modules', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'esmodules-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.js')])
    const expectedFiles = [
      'dep1.js',
      'dep2.js',
      'dep3.js',
      'dep5.js',
      'dep6.js',
      'entrypoint.js',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
  })

  it('should handle Common JS and ES Modules', async () => {
    const toAbsolutePath = (...filepath: string[]) => path.join(__dirname, 'check-parser-fixtures', 'common-esm-example', ...filepath)
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies([toAbsolutePath('entrypoint.mjs')])
    const expectedFiles = [
      'dep1.js',
      'dep2.mjs',
      'dep3.mjs',
      'dep4.mjs',
      'dep5.mjs',
      'dep6.mjs',
      'entrypoint.mjs',
    ].map(file => pathToPosix(toAbsolutePath(file)))

    expect(res.files.map(file => pathToPosix(file)).sort()).toEqual(expectedFiles)
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
