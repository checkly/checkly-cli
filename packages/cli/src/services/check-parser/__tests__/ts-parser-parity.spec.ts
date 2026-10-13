import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { Parser, typescriptEstreeParse } from '../parser.js'
import { isTSExtension } from '../package-files/extension.js'

// TypeScript files are parsed with oxc-parser, which replaced
// typescript-estree. These tests make sure both find exactly the same
// dependencies, so switching parsers doesn't change what gets bundled.

const estree = typescriptEstreeParse()

function findTSFiles (dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => !file.split(path.sep).includes('node_modules'))
    .filter(file => isTSExtension(path.extname(file)))
    .map(file => path.join(dir, file))
}

const repoRoot = path.join(__dirname, '..', '..', '..', '..', '..', '..')

const fixtureFiles = [
  ...findTSFiles(path.join(__dirname, 'check-parser-fixtures')),
  ...findTSFiles(path.join(repoRoot, 'examples')),
  ...findTSFiles(path.join(repoRoot, 'benchmarks')),
]

const edgeCases: Record<string, string> = {
  'imports.ts': `
    import type { A } from './type-only'
    import './side-effect'
    import def, { named } from './default-and-named'
    import * as ns from './namespace'
    export type { B } from './type-reexport'
    export { c } from './reexport'
    export * from './star'
    export * as star from './star-as'
    import json from './data.json' with { type: 'json' }
  `,
  'requires.ts': `
    const a = require('./require')
    const b = module.require('./module-require')
    const c = require(\`./template\`)
    const d = require(variable)
    function lazy () { return require('./in-function') }
    const e = await import('./dynamic')
    import f = require('./import-equals')
    namespace N { const g = require('./in-namespace') }
    declare module 'ambient' { import h from './in-ambient-module' }
  `,
  'syntax.ts': `
    import { inject } from './decorators'
    enum Color { Red, Green }
    abstract class Base<T extends object = {}> {
      @inject() accessor value!: T
      constructor (private readonly dep: typeof import('./type-import')) {}
    }
    const config = { a: 1 } satisfies Record<string, number>
    export default class extends Base<{}> {}
    const x = <T,>(value: T) => value
    using res = getResource()
  `,
  'component.tsx': `
    import { Button } from './button'
    const el = <div>{require('./in-jsx')}<Button onClick={() => require('./in-handler')} /></div>
    const generic = <T,>(value: T) => value
  `,
  'module.mts': `
    import { a } from './a.mjs'
    export const b = await import('./b.mjs')
  `,
  'common.cts': `
    const a = require('./a.cjs')
    module.exports = { a }
  `,
  'declarations.d.ts': `
    import type { A } from './a'
    export const value: { title: string }
    export function fn (a: A): void
    export default class Page { title: string }
  `,
  'declarations.d.mts': `
    export const value: number
    export * from './other.mjs'
  `,
  'styles.d.css.ts': `
    declare const styles: { readonly [key: string]: string }
    export default styles
  `,
  'syntax-error.ts': `
    import { a } from './a'
    const b: = ;
  `,
}

describe('TypeScript dependency parsing', () => {
  it('finds TypeScript fixture files to compare', () => {
    expect(fixtureFiles.length).toBeGreaterThan(100)
  })

  it.each(fixtureFiles.map(file => [path.relative(process.cwd(), file), file]))(
    'finds the same dependencies as typescript-estree in %s',
    (_, file) => {
      const contents = fs.readFileSync(file, 'utf8')
      const actual = Parser.parseDependencies(file, contents)
      const expected = Parser.parseDependencies(file, contents, estree)
      expect(actual.module.dependencies).toEqual(expected.module.dependencies)
      expect(Boolean(actual.error)).toEqual(Boolean(expected.error))
    },
  )

  it.each(Object.entries(edgeCases))('finds the same dependencies as typescript-estree in %s', (file, contents) => {
    const actual = Parser.parseDependencies(file, contents)
    const expected = Parser.parseDependencies(file, contents, estree)
    expect(actual.module.dependencies).toEqual(expected.module.dependencies)
    expect(Boolean(actual.error)).toEqual(Boolean(expected.error))
  })

  it('reports syntax errors with their location', () => {
    const { error } = Parser.parseDependencies('broken.ts', edgeCases['syntax-error.ts']!)
    expect(error).toBeInstanceOf(SyntaxError)
    expect(error.message).toMatch(/\(3:13\)$/)
  })
})
