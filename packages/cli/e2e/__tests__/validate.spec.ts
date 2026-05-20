import path from 'node:path'

import { describe, it, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('validate', () => {
  describe('config', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'allowed-config-file-constructs'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should let allowed constructs to be used in config file', async () => {
      await runCheckly(fixt, ['validate'])
    })
  })
})
