import { describe, it, expect } from 'vitest'
import { prepareReportersTypes } from '../test-helper'

describe('prepareReportersTypes', () => {
  it('returns list reporter by default', () => {
    const result = prepareReportersTypes(undefined, [])
    expect(result).toEqual(['list'])
  })

  it('returns list reporter when flag is empty', () => {
    const result = prepareReportersTypes([], [])
    expect(result).toEqual(['list'])
  })

  it('returns a single reporter when one flag is passed', () => {
    const result = prepareReportersTypes(['json'], [])
    expect(result).toEqual(['json'])
  })

  it('falls back to config reporters when no flag is passed', () => {
    const result = prepareReportersTypes(undefined, ['list', 'json'])
    expect(result).toEqual(['list', 'json'])
  })

  it('CLI flag takes precedence over config reporters', () => {
    const result = prepareReportersTypes(['dot'], ['list', 'json'])
    expect(result).toEqual(['dot'])
  })

  it('CLI --reporter flag supports multiple values', () => {
    const result = prepareReportersTypes(['list', 'json'], ['list', 'dot'])
    expect(result).toEqual(['list', 'json'])
  })
})
