import { describe, it, expect, vi } from 'vitest'

const mockCiInfo = vi.hoisted(() => ({ isCI: false }))
vi.mock('ci-info', () => mockCiInfo)

import { prepareReportersTypes } from '../test-helper'

describe('prepareReportersTypes', () => {
  it('should default to "list" in non-CI environments', () => {
    mockCiInfo.isCI = false
    expect(prepareReportersTypes()).toEqual(['list'])
  })

  it('should default to "ci" in CI environments', () => {
    mockCiInfo.isCI = true
    expect(prepareReportersTypes()).toEqual(['ci'])
  })

  it('should use a single reporter flag', () => {
    expect(prepareReportersTypes(['github'])).toEqual(['github'])
  })

  it('should support multiple reporter flags', () => {
    expect(prepareReportersTypes(['github', 'json'])).toEqual(['github', 'json'])
  })

  it('should fall back to config reporters when no flags are provided', () => {
    expect(prepareReportersTypes([], ['dot', 'json'])).toEqual(['dot', 'json'])
  })

  it('should prefer reporter flags over config reporters', () => {
    expect(prepareReportersTypes(['github'], ['dot', 'json'])).toEqual(['github'])
  })

  it('should default when both flags and config are empty', () => {
    mockCiInfo.isCI = false
    expect(prepareReportersTypes([], [])).toEqual(['list'])
  })
})
