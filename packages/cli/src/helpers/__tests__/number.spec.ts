import { describe, expect, it } from 'vitest'

import { InvalidInputError } from '../invalid-input-error.js'
import { parseNonNegativeInteger, parsePositiveInteger, validateIntegerRange } from '../number.js'

describe('number helpers', () => {
  it('parsePositiveInteger accepts positive integers from strings and numbers', () => {
    expect(parsePositiveInteger('12', 'ID')).toBe(12)
    expect(parsePositiveInteger(3, 'ID')).toBe(3)
  })

  it.each(['abc', '0', '-1', '1.5'])('parsePositiveInteger rejects %j as invalid input', value => {
    expect(() => parsePositiveInteger(value, 'ID')).toThrow('ID must be a positive integer.')
    expect(() => parsePositiveInteger(value, 'ID')).toThrow(InvalidInputError)
  })

  it('parseNonNegativeInteger rejects a negative value as invalid input', () => {
    expect(parseNonNegativeInteger(0, '--from')).toBe(0)
    expect(() => parseNonNegativeInteger(-1, '--from')).toThrow(InvalidInputError)
  })

  it('validateIntegerRange rejects a value out of range as invalid input', () => {
    expect(validateIntegerRange(5, '--limit', 1, 100)).toBe(5)
    expect(() => validateIntegerRange(101, '--limit', 1, 100)).toThrow('--limit must be an integer between 1 and 100.')
    expect(() => validateIntegerRange(101, '--limit', 1, 100)).toThrow(InvalidInputError)
  })
})
