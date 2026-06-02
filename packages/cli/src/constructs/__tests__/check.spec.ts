import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Frequency } from '../frequency.js'
import { Project, Session } from '../project.js'
import { ApiCheck } from '../api-check.js'

describe('Check', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  afterEach(() => {
    Session.reset()
  })

  it('synthesizes Frequency instances as numeric frequency fields', () => {
    const check = new ApiCheck('api-health', {
      name: 'API Health',
      frequency: Frequency.EVERY_10M,
      request: {
        method: 'GET',
        url: 'https://api.example.com/health',
      },
    })

    expect(check.synthesize()).toMatchObject({
      frequency: 10,
      frequencyOffset: undefined,
    })
  })

  it('synthesizes frequency-like values from separate module instances as numeric fields', () => {
    const check = new ApiCheck('api-health', {
      name: 'API Health',
      frequency: { frequency: 10 } as any,
      request: {
        method: 'GET',
        url: 'https://api.example.com/health',
      },
    })

    expect(check.synthesize()).toMatchObject({
      frequency: 10,
      frequencyOffset: undefined,
    })
  })

  it('synthesizes frequency-like default values as numeric fields', () => {
    Session.checkDefaults = {
      frequency: { frequency: 10 } as any,
    }
    const check = new ApiCheck('api-health', {
      name: 'API Health',
      request: {
        method: 'GET',
        url: 'https://api.example.com/health',
      },
    })

    expect(check.synthesize()).toMatchObject({
      frequency: 10,
      frequencyOffset: undefined,
    })
  })
})
