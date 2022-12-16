import { parseDependencies } from '../dependency-parser'
import * as path from 'path'

describe('dependency-parser - parseDependencies()', () => {
  it('should handle JS file with no dependencies', async () => {
    const dependencies = await parseDependencies(path.join(__dirname, 'fixtures', 'no-dependencies.js'))
    expect(dependencies).toHaveLength(0)
  })

  it('should handle JS file with dependencies', async () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'fixtures', 'simple-example', filename)
    const dependencies = await parseDependencies(toAbsolutePath('entrypoint.js'))
    expect(dependencies.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.js'),
    ])
  })

  it('should report a missing entrypoint file', async () => {
    const missingEntrypoint = path.join(__dirname, 'fixtures', 'does-not-exist.js')
    await expect(parseDependencies(missingEntrypoint))
      .rejects
      .toMatchObject({ missingFiles: [missingEntrypoint] })
  })

  it('should report missing check dependencies', async () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'fixtures', filename)
    await expect(parseDependencies(toAbsolutePath('missing-dependencies.js')))
      .rejects
      .toMatchObject({ missingFiles: [toAbsolutePath('does-not-exist.js'), toAbsolutePath('does-not-exist2.js')] })
  })

  it('should report syntax errors', async () => {
    const entrypoint = path.join(__dirname, 'fixtures', 'syntax-error.js')
    await expect(parseDependencies(entrypoint))
      .rejects
      .toMatchObject({ parseErrors: [{ file: entrypoint, error: 'Unexpected token (4:70)' }] })
  })

  it('should report unsupported dependencies', async () => {
    const entrypoint = path.join(__dirname, 'fixtures', 'unsupported-dependencies.js')
    await expect(parseDependencies(entrypoint))
      .rejects
      .toMatchObject({ unsupportedNpmDependencies: [{ file: entrypoint, unsupportedDependencies: ['left-pad', 'right-pad'] }] })
  })

  it('should handle circular dependencies', async () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'fixtures', 'circular-dependencies', filename)
    const dependencies = await parseDependencies(toAbsolutePath('entrypoint.js'))
    // Circular dependencies are allowed in Node.js
    // We just need to test that parsing the dependencies doesn't loop indefinitely
    // https://nodejs.org/api/modules.html#modules_cycles
    expect(dependencies.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
    ])
  })

  it('should parse typescript dependencies', async () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'fixtures', 'typescript-example', filename)
    const dependencies = await parseDependencies(toAbsolutePath('entrypoint.ts'))
    expect(dependencies.sort()).toEqual([
      toAbsolutePath('dep1.ts'),
      toAbsolutePath('dep2.ts'),
      toAbsolutePath('dep3.ts'),
    ])
  })

  /*
   * There is an unhandled edge-case when require() is reassigned.
   * Even though the check might execute fine, we throw an error for a missing dependency.
   * We could address this by keeping track of assignments as we walk the AST.
   */
  it.skip('should ignore cases where require is reassigned', async () => {
    const entrypoint = path.join(__dirname, 'fixtures', 'reassign-require.js')
    await expect(parseDependencies(entrypoint)).resolves.not.toThrow()
  })
})
