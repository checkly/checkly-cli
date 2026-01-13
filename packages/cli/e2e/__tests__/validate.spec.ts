/* eslint-disable no-console */
import path from 'node:path'

import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('validate', () => {
  describe('config', () => {
    it('should let allowed constructs to be used in config file', async () => {
      const result = await runChecklyCli({
        args: ['validate'],
        apiKey: config.get('apiKey'),
        accountId: config.get('accountId'),
        directory: path.join(__dirname, 'fixtures', 'allowed-config-file-constructs'),
      })
      if (result.status != 0) {
        console.error('stderr=', result.stderr)
        console.error('stdout=', result.stdout)
      }
      expect(result.status).toBe(0)
    })
  })
})
