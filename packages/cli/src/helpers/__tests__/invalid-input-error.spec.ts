import { describe, expect, it } from 'vitest'

import { exitCodeFor, InvalidInputError } from '../invalid-input-error.js'

describe('InvalidInputError', () => {
  it('carries the usage-error exit code for oclif', () => {
    const error = new InvalidInputError('--limit must be an integer between 1 and 100.')

    expect(error).toBeInstanceOf(Error)
    expect(error.oclif).toEqual({ exit: 2 })
  })

  it('exitCodeFor maps invalid input to 2 and anything else to 1', () => {
    expect(exitCodeFor(new InvalidInputError('bad'))).toBe(2)
    expect(exitCodeFor(new Error('boom'))).toBe(1)
    expect(exitCodeFor('boom')).toBe(1)
  })
})
