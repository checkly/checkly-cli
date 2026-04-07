import { describe, it, expect } from 'vitest'

import { isNativeBinaryPath } from '../paths'

describe('isNativeBinaryPath', () => {
  it('returns true for .node imports', () => {
    expect(isNativeBinaryPath('./fsevents.node')).toBe(true)
    expect(isNativeBinaryPath('../bindings/sharp.node')).toBe(true)
    expect(isNativeBinaryPath('/absolute/path/to/module.node')).toBe(true)
    expect(isNativeBinaryPath('build/Release/better_sqlite3.node')).toBe(true)
  })

  it('returns false for JavaScript imports', () => {
    expect(isNativeBinaryPath('./foo.js')).toBe(false)
    expect(isNativeBinaryPath('./foo.mjs')).toBe(false)
    expect(isNativeBinaryPath('./foo.cjs')).toBe(false)
    expect(isNativeBinaryPath('./foo.ts')).toBe(false)
    expect(isNativeBinaryPath('./foo')).toBe(false)
  })

  it('returns false for package imports that contain "node" in the name', () => {
    expect(isNativeBinaryPath('node-fetch')).toBe(false)
    expect(isNativeBinaryPath('./node.js')).toBe(false)
    expect(isNativeBinaryPath('node:fs')).toBe(false)
  })
})
