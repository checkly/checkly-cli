import { describe, it, expect } from 'vitest'

import { FileLoader } from '../loader.js'

// A promise we can resolve/reject from the outside, to hold a load "in flight"
// while we issue concurrent calls — this is what makes the dedup test
// deterministic rather than timing-dependent.
function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('FileLoader', () => {
  it('shares a single in-flight load across concurrent callers for the same path', async () => {
    let calls = 0
    const gate = deferred<string>()
    const loader = new FileLoader<string>(async () => {
      calls++
      return await gate.promise
    })

    // Issue concurrent loads while the underlying loader is still pending.
    const results = Promise.all([
      loader.load('foo.ts'),
      loader.load('foo.ts'),
      loader.load('foo.ts'),
    ])

    gate.resolve('contents')

    expect(await results).toEqual(['contents', 'contents', 'contents'])
    // The regression: with the old value-cache this was 3 (every concurrent
    // caller missed and reloaded). The promise-cache collapses it to 1.
    expect(calls).toBe(1)
  })

  it('loads each distinct path exactly once', async () => {
    const seen: string[] = []
    const loader = new FileLoader<string>(filePath => {
      seen.push(filePath)
      return Promise.resolve(filePath)
    })

    await Promise.all([
      loader.load('a.ts'),
      loader.load('b.ts'),
      loader.load('a.ts'),
      loader.load('b.ts'),
    ])

    expect(seen.sort()).toEqual(['a.ts', 'b.ts'])
  })

  it('caches a not-found (undefined) result without reloading', async () => {
    let calls = 0
    const loader = new FileLoader<string>(() => {
      calls++
      return Promise.resolve(undefined)
    })

    expect(await loader.load('missing.ts')).toBeUndefined()
    expect(await loader.load('missing.ts')).toBeUndefined()
    expect(calls).toBe(1)
  })

  it('caches and shares a rejected load instead of retrying it', async () => {
    let calls = 0
    const loader = new FileLoader<string>(() => {
      calls++
      return Promise.reject(new Error('boom'))
    })

    const a = loader.load('foo.ts')
    const b = loader.load('foo.ts')

    await expect(a).rejects.toThrow('boom')
    await expect(b).rejects.toThrow('boom')
    // A later call gets the cached rejection — the failure is computed once.
    await expect(loader.load('foo.ts')).rejects.toThrow('boom')
    expect(calls).toBe(1)
  })
})
