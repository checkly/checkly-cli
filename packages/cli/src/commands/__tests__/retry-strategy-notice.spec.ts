import { afterEach, describe, expect, it, vi } from 'vitest'
import Test from '../test.js'
import Trigger from '../trigger.js'

describe('retries above the maximum', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  for (const command of [Test, Trigger]) {
    it(`${command.name} notes the capped retry count on stderr, not stdout`, () => {
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      command.prototype.prepareTestRetryStrategy.call({}, 99)

      expect(stderr.mock.calls.map(([text]) => String(text)).join('')).toContain('Defaulting to the maximum of 3 retries.')
      expect(stdout).not.toHaveBeenCalled()
    })
  }
})
