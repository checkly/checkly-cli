import path from 'node:path'

import config from 'config'
import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'

describe('check parse error', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'check-parse-error'),
      installPackages: false,
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('"checkly test" should return a clear error when there are check dependency errors', async () => {
    try {
      await fixt.run('pnpm', [
        'checkly',
        'test',
      ], {
        env: {
          CHECKLY_API_KEY: config.get('apiKey') as string,
          CHECKLY_ACCOUNT_ID: config.get('accountId') as string,
          CHECKLY_ENV: process.env.CHECKLY_ENV,
          CHECKLY_CLI_VERSION: '4.8.0',
        },
        timeout: 30_000,
      })
      expect.unreachable('Expected checkly test to fail with a parse error')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect((err.stderr as unknown as string).replace(/(\r\n|\n|\r|\s+)/gm, '')).toContain(
          path.join(fixt.root, 'entrypoint.js'),
        )
      } else {
        throw err
      }
    }
  })
})
