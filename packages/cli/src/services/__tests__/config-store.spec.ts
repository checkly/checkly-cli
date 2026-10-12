import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigStore } from '../config-store.js'

type Store = { apiKey: unknown, pending: unknown }

const schema = {
  apiKey: { type: 'string' },
  pending: { type: 'object' },
} as const

describe('ConfigStore', () => {
  let home: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'config-store-'))
    vi.spyOn(os, 'homedir').mockReturnValue(home)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(home, { recursive: true, force: true })
  })

  function makeStore (projectSuffix = '') {
    return new ConfigStore<Store>({ projectName: '@checkly/cli', projectSuffix, configName: 'auth', schema })
  }

  it.runIf(process.platform !== 'win32')('uses the same location as conf', () => {
    const expectedDir = process.platform === 'darwin'
      ? path.join(home, 'Library', 'Preferences')
      : path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'))
    expect(makeStore().path).toEqual(path.join(expectedDir, '@checkly/cli', 'auth.json'))
    expect(makeStore('local').path).toEqual(path.join(expectedDir, '@checkly/cli-local', 'auth.json'))
  })

  it('returns an empty store without creating anything when the file is missing', () => {
    const store = makeStore()
    expect(store.store).toEqual({})
    expect(store.get('apiKey')).toBeUndefined()
    expect(fs.existsSync(path.dirname(store.path))).toBe(false)
  })

  it('sets, gets, deletes and clears values', () => {
    const store = makeStore()
    store.set('apiKey', 'secret')
    store.set('pending', { code: 'abc' })
    expect(store.get('apiKey')).toEqual('secret')
    expect(store.get('pending')).toEqual({ code: 'abc' })

    store.delete('pending')
    expect(store.store).toEqual({ apiKey: 'secret' })

    store.clear()
    expect(store.store).toEqual({})
  })

  it('writes tab-indented JSON like conf', () => {
    const store = makeStore()
    store.set('apiKey', 'secret')
    expect(fs.readFileSync(store.path, 'utf8')).toEqual('{\n\t"apiKey": "secret"\n}')
  })

  it('restores a previous store', () => {
    const store = makeStore()
    store.set('apiKey', 'old')
    const previous = store.store
    store.set('apiKey', 'new')
    store.store = previous
    expect(store.get('apiKey')).toEqual('old')
  })

  it('keeps keys outside of the schema', () => {
    const store = makeStore()
    fs.mkdirSync(path.dirname(store.path), { recursive: true })
    fs.writeFileSync(store.path, JSON.stringify({ apiKey: 'secret', other: 1 }))
    store.set('pending', { code: 'abc' })
    expect(JSON.parse(fs.readFileSync(store.path, 'utf8'))).toEqual({ apiKey: 'secret', other: 1, pending: { code: 'abc' } })
  })

  it('rejects values that violate the schema', () => {
    const store = makeStore()
    expect(() => store.set('apiKey', 42)).toThrow('Config schema violation: `apiKey` must be string')
    expect(() => store.set('pending', ['not', 'an', 'object'])).toThrow('Config schema violation: `pending` must be object')
    expect(fs.existsSync(store.path)).toBe(false)

    fs.mkdirSync(path.dirname(store.path), { recursive: true })
    fs.writeFileSync(store.path, JSON.stringify({ apiKey: 42 }))
    expect(() => store.store).toThrow('Config schema violation: `apiKey` must be string')
  })

  it('throws on a corrupt file', () => {
    const store = makeStore()
    fs.mkdirSync(path.dirname(store.path), { recursive: true })
    fs.writeFileSync(store.path, '{ not json')
    expect(() => store.store).toThrow(SyntaxError)
  })

  it('leaves no temporary files behind', () => {
    const store = makeStore()
    store.set('apiKey', 'secret')
    expect(fs.readdirSync(path.dirname(store.path))).toEqual(['auth.json'])
  })
})
