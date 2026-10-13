import { describe, expect, it, vi } from 'vitest'

import { Parser } from '../parser.js'

// oxc-parser's native binding can be missing, e.g. when optional dependencies
// weren't installed. Its load error must fail only the TypeScript file being
// parsed, as that file's parse error.
vi.mock('../../oxc-parser.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../oxc-parser.js')>(),
  loadOxcParser: () => {
    throw new Error('Cannot find native binding.')
  },
}))

describe('when oxc-parser fails to load', () => {
  it('reports the load error as the parse error of a TypeScript file', () => {
    const { error } = Parser.parseDependencies('a.ts', `import './b'`)
    expect(error.message).toEqual('Cannot find native binding.')
  })

  it('still parses JavaScript files', () => {
    const { error, module } = Parser.parseDependencies('a.js', `import './b'`)
    expect(error).toBeUndefined()
    expect(module.dependencies.map(dependency => dependency.importPath)).toEqual(['./b'])
  })
})
