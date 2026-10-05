import { describe, expect, it } from 'vitest'

import { Context, pathsUnder } from '../internal/codegen/context.js'

/** The spelled-out properties a `Context` carries for a rendering of code that already exists (`context.ts`). */

describe('Context.spelledOut', () => {
  it('answers for the exact paths given, and nothing without a set', () => {
    const context = new Context({ spelledOut: new Set(['muted', 'retryStrategy.maxRetries', 'headers[x-a].locked']) })
    expect(context.spelledOut('muted')).toBe(true)
    expect(context.spelledOut('retryStrategy.maxRetries')).toBe(true)
    expect(context.spelledOut('headers[x-a].locked')).toBe(true)
    expect(context.spelledOut('retryStrategy')).toBe(false)
    expect(context.spelledOut('activated')).toBe(false)
    expect(new Context().spelledOut('muted')).toBe(false)
  })

  it('lists the children of a prefix', () => {
    const context = new Context({
      spelledOut: new Set(['retryStrategy', 'retryStrategy.maxRetries', 'retryStrategy.sameRegion', 'muted']),
    })
    expect(context.spelledOutUnder('retryStrategy')).toEqual(['maxRetries', 'sameRegion'])
    expect(context.spelledOutUnder('request')).toEqual([])
    expect(new Context().spelledOutUnder('retryStrategy')).toEqual([])
  })
})

describe('pathsUnder', () => {
  it('takes the first segment under the prefix once, and leaves bracketed element paths alone', () => {
    const paths = new Set([
      'request',
      'request.url',
      'request.basicAuth.username',
      'request.basicAuth.password',
      'request.headers[x-a].locked',
      'request.headers[x.trace].locked',
      'requestTimeout',
    ])
    expect(pathsUnder(paths, 'request')).toEqual(['url', 'basicAuth', 'headers[x-a]', 'headers[x.trace]'])
    expect(pathsUnder(paths, 'request.headers[x.trace]')).toEqual(['locked'])
    expect(pathsUnder(paths, 'request.basicAuth')).toEqual(['username', 'password'])
    expect(pathsUnder(paths, 'retryStrategy')).toEqual([])
  })
})
