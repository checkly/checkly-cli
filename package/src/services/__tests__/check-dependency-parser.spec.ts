import { Parser } from '../check-dependency-parser'
import * as path from 'path'

describe('dependency-parser - parseDependencies()', () => {
  it('should handle JS file with no dependencies', () => {
    const parser = new Parser()
    const dependencies = parser.parseDependencies(path.join(__dirname, 'check-dependency-parser-fixtures', 'no-dependencies.js'))
    expect(dependencies).toHaveLength(0)
  })

  it('should handle JS file with dependencies', () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'check-dependency-parser-fixtures', 'simple-example', filename)
    const parser = new Parser()
    const dependencies = parser.parseDependencies(toAbsolutePath('entrypoint.js'))
    expect(dependencies.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
      toAbsolutePath('dep3.js'),
    ])
  })

  it('should report a missing entrypoint file', () => {
    const missingEntrypoint = path.join(__dirname, 'check-dependency-parser-fixtures', 'does-not-exist.js')
    try {
      const parser = new Parser()
      parser.parseDependencies(missingEntrypoint)
    } catch (err) {
      expect(err).toMatchObject({ missingFiles: [missingEntrypoint] })
    }
  })

  it('should report missing check dependencies', () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'check-dependency-parser-fixtures', filename)
    try {
      const parser = new Parser()
      parser.parseDependencies(toAbsolutePath('missing-dependencies.js'))
    } catch (err) {
      expect(err).toMatchObject({ missingFiles: [toAbsolutePath('does-not-exist.js'), toAbsolutePath('does-not-exist2.js')] })
    }
  })

  it('should report syntax errors', () => {
    const entrypoint = path.join(__dirname, 'check-dependency-parser-fixtures', 'syntax-error.js')
    try {
      const parser = new Parser()
      parser.parseDependencies(entrypoint)
    } catch (err) {
      expect(err).toMatchObject({ parseErrors: [{ file: entrypoint, error: 'Unexpected token (4:70)' }] })
    }
  })

  it('should report unsupported dependencies', () => {
    const entrypoint = path.join(__dirname, 'check-dependency-parser-fixtures', 'unsupported-dependencies.js')
    try {
      const parser = new Parser()
      parser.parseDependencies(entrypoint)
    } catch (err) {
      expect(err).toMatchObject({ unsupportedNpmDependencies: [{ file: entrypoint, unsupportedDependencies: ['left-pad', 'right-pad'] }] })
    }
  })

  it('should handle circular dependencies', () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'check-dependency-parser-fixtures', 'circular-dependencies', filename)
    const parser = new Parser()
    const dependencies = parser.parseDependencies(toAbsolutePath('entrypoint.js'))
    // Circular dependencies are allowed in Node.js
    // We just need to test that parsing the dependencies doesn't loop indefinitely
    // https://nodejs.org/api/modules.html#modules_cycles
    expect(dependencies.sort()).toEqual([
      toAbsolutePath('dep1.js'),
      toAbsolutePath('dep2.js'),
    ])
  })

  it('should parse typescript dependencies', () => {
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'check-dependency-parser-fixtures', 'typescript-example', filename)
    const parser = new Parser()
    const dependencies = parser.parseDependencies(toAbsolutePath('entrypoint.ts'))
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
  it.skip('should ignore cases where require is reassigned', () => {
    const entrypoint = path.join(__dirname, 'check-dependency-parser-fixtures', 'reassign-require.js')
    const parser = new Parser()
    parser.parseDependencies(entrypoint)
  })
})
