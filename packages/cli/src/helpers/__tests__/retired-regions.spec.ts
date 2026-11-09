import { describe, expect, it } from 'vitest'

import { DEFAULT_REGION, isRetiredRegion, retiredRegionMessage } from '../constants.js'

describe('isRetiredRegion()', () => {
  it('is true for me-south-1', () => {
    expect(isRetiredRegion('me-south-1')).toBe(true)
  })

  it.each([DEFAULT_REGION, 'us-east-1', undefined, 'ME-SOUTH-1', ['me-south-1']])('is false for %j', value => {
    expect(isRetiredRegion(value)).toBe(false)
  })
})

describe('retiredRegionMessage()', () => {
  it('returns the text the backend returns', () => {
    expect(retiredRegionMessage('me-south-1')).toBe(
      'Location "me-south-1" (Bahrain) is retired and can no longer run checks. Choose another location.',
    )
  })
})
