import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Frequency } from '../frequency.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
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

  describe('__checkFilePath', () => {
    const request = { method: 'GET' as const, url: 'https://api.example.com/health' }

    it('is the declaring file relative to the parse directory', () => {
      // Created from a test, so the declaring file is the session's current
      // check file.
      Session.checkFilesDirectory = path.resolve('/proj')
      Session.checkFileAbsolutePath = path.resolve('/proj/src/a.check.ts')
      const check = new ApiCheck('a', { name: 'A', request })
      expect(check.checkFileAbsolutePath).toBe(path.resolve('/proj/src/a.check.ts'))
      expect(check.__checkFilePath).toBe('src/a.check.ts')
      expect(check.getSourceFile()).toBe('src/a.check.ts')
    })

    it('is unset while no project is being parsed, as for constructs in the config file', () => {
      Session.checkFileAbsolutePath = path.resolve('/proj/checkly.config.ts')
      const check = new ApiCheck('a', { name: 'A', request })
      expect(check.checkFileAbsolutePath).toBe(path.resolve('/proj/checkly.config.ts'))
      expect(check.__checkFilePath).toBeUndefined()
    })
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
