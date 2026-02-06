import { describe, it, expect } from 'vitest'
import * as recast from 'recast'
import * as acornParser from '../recast-acorn-parser'
import { findPropertyByName } from '../write-config-helpers'

const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')

describe('recast-acorn-parser', () => {
  it('should parse numeric literals with underscore separators', () => {
    const source = 'const x = 1_000_000'
    const ast = recast.parse(source, { parser: acornParser })
    const output = recast.print(ast).code
    expect(normalizeLineEndings(output)).toBe(source)
  })

  it('should parse config-like code with underscore-separated numbers', () => {
    const source = `const config = {
  timeout: 30_000,
  frequency: 1_440,
}`
    const ast = recast.parse(source, { parser: acornParser })
    const prop = findPropertyByName(ast, 'timeout')
    expect(prop).toBeDefined()
    expect(normalizeLineEndings(recast.print(ast).code)).toBe(source)
  })

  it('should preserve comments', () => {
    const source = '// a comment\nconst x = 1'
    const ast = recast.parse(source, { parser: acornParser })
    expect(normalizeLineEndings(recast.print(ast).code)).toBe(source)
  })

  it('should parse module syntax', () => {
    const source = 'import foo from \'bar\'\nexport default foo'
    const ast = recast.parse(source, { parser: acornParser })
    expect(normalizeLineEndings(recast.print(ast).code)).toBe(source)
  })
})
