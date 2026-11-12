import { describe, expect, it } from 'vitest'

import type { Region } from '../../index.js'
import { DEFAULT_REGION, RETIRED_REGIONS, isRetiredRegion, retiredRegionMessage } from '../constants.js'

const activeRegions: Array<keyof Region> = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'sa-east-1',
  'eu-west-1',
  'eu-central-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'ap-east-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'af-south-1',
]

describe('RETIRED_REGIONS', () => {
  it('lists me-south-1 only', () => {
    expect(RETIRED_REGIONS).toEqual(['me-south-1'])
  })

  it('does not hold the default region', () => {
    expect(RETIRED_REGIONS).not.toContain(DEFAULT_REGION)
  })
})

describe('isRetiredRegion()', () => {
  it('is true for me-south-1', () => {
    expect(isRetiredRegion('me-south-1')).toBe(true)
  })

  it.each(activeRegions)('is false for the active region %s', region => {
    expect(isRetiredRegion(region)).toBe(false)
  })

  it.each([undefined, null, 42, '', 'ME-SOUTH-1', ' me-south-1', ['me-south-1'], { region: 'me-south-1' }])(
    'is false for %j',
    value => {
      expect(isRetiredRegion(value)).toBe(false)
    },
  )
})

describe('retiredRegionMessage()', () => {
  it('returns the text the backend returns', () => {
    expect(retiredRegionMessage('me-south-1')).toBe(
      'Location "me-south-1" (Bahrain) is retired and can no longer run checks. Choose another location.',
    )
  })
})
