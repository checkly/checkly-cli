import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

const apiKey = process.env.CHECKLY_EMPTY_API_KEY
const accountId = process.env.CHECKLY_EMPTY_ACCOUNT_ID

describe('checks commands on empty account', () => {
  it('should show "No checks found." for checks list', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No checks found.')
  })

  it('should return empty JSON array for checks list --output json', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.data).toEqual([])
    expect(parsed.pagination.total).toBe(0)
  })

  it('should show "No checks found." for checks list --output md', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--output', 'md'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No checks found.')
  })

  it('should handle --status filter gracefully on empty account', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--status', 'failing'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No checks matching')
  })

  it('should handle --search filter gracefully on empty account', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--search', 'anything'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No checks matching')
  })

  it('should fail gracefully for checks get on empty account', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'get', '00000000-0000-0000-0000-000000000000'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Failed to get check details')
  })
})
