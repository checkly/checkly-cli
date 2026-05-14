import config from 'config'
import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

const apiKey: string | undefined = config.has('emptyApiKey') ? config.get('emptyApiKey') : undefined
const accountId: string | undefined = config.has('emptyAccountId') ? config.get('emptyAccountId') : undefined

describe.skipIf(!apiKey || !accountId)('checks commands on empty account', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should show "No checks found." for checks list', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list'], { apiKey, accountId })
    expect(stdout).toContain('No checks found.')
  })

  it('should return empty JSON array for checks list --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'json'], { apiKey, accountId })
    const parsed = JSON.parse(stdout)
    expect(parsed.data).toEqual([])
    expect(parsed.pagination.total).toBe(0)
  })

  it('should show "No checks found." for checks list --output md', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'md'], { apiKey, accountId })
    expect(stdout).toContain('No checks found.')
  })

  it('should handle --search filter gracefully on empty account', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list', '--search', 'anything'], { apiKey, accountId })
    expect(stdout).toContain('No checks matching')
  })

  it('should show "No checks found." for checks stats', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats'], { apiKey, accountId })
    expect(stdout).toContain('No checks found.')
  })

  it('should return empty JSON for checks stats --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--output', 'json'], { apiKey, accountId })
    const parsed = JSON.parse(stdout)
    expect(parsed.data).toEqual([])
    expect(parsed.pagination.total).toBe(0)
    expect(parsed.range).toBe('last24Hours')
  })

  it('should fail gracefully for checks get on empty account', async () => {
    try {
      await runCheckly(fixt, ['checks', 'get', '00000000-0000-0000-0000-000000000000'], { apiKey, accountId })
      expect.unreachable('Expected command to fail for checks get on empty account')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).toBe(1)
        expect(err.stdout).toContain('Failed to get check details')
      } else {
        throw err
      }
    }
  })
})
