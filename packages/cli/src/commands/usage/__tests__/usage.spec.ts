import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../rest/api', () => ({
  usage: { getTerms: vi.fn(), getSummary: vi.fn(), getSeries: vi.fn() },
}))

import * as api from '../../../rest/api.js'
import { NotFoundError } from '../../../rest/errors.js'
import UsageTermsCommand from '../terms.js'

export function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: { outputFormat: undefined as string | undefined, longError: vi.fn() },
    logged,
  }
}

export const termsFixture = {
  id: '5c6f0a1e-7c4d-4a4f-9d6b-1e2f3a4b5c6d',
  name: 'Acme Corp',
  accounts: [
    { id: 'a1111111-1111-4111-8111-111111111111', name: 'Acme Production' },
    { id: 'b2222222-2222-4222-8222-222222222222', name: 'Acme Staging' },
  ],
  contractStartDate: '2026-01-01',
  contractEndDate: '2026-12-31',
  usageStartDate: '2026-01-01',
  creditBudget: 1000,
  standardCreditsPerUnit: 2,
  premiumCreditsPerUnit: 3,
}

describe('usage terms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.usage.getTerms).mockResolvedValue({ data: termsFixture } as any)
  })

  it('-o json prints the raw terms', async () => {
    const ctx = createCommandContext({ flags: { output: 'json' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).toHaveBeenCalledWith({ usageTermsId: undefined, to: undefined })
    expect(JSON.parse(ctx.logged[0])).toEqual(termsFixture)
  })

  it('passes --usage-terms-id and --to through', async () => {
    const ctx = createCommandContext({ flags: { 'usage-terms-id': 'terms-1', 'to': '2026-03-31', 'output': 'json' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).toHaveBeenCalledWith({ usageTermsId: 'terms-1', to: '2026-03-31' })
  })

  it('renders the detail view with follow-up hints', async () => {
    const ctx = createCommandContext({ flags: { output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('Usage terms: Acme Corp')
    expect(ctx.logged[0]).toContain('Acme Production')
    expect(ctx.logged[0]).toContain(`checkly usage summary --usage-terms-id ${termsFixture.id}`)
    expect(ctx.logged[0]).toContain(`checkly usage series --usage-terms-id ${termsFixture.id}`)
  })

  it('renders markdown without hints', async () => {
    const ctx = createCommandContext({ flags: { output: 'md' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('# Usage terms: Acme Corp')
    expect(ctx.logged[0]).not.toContain('checkly usage summary')
  })

  it('rejects an invalid --to date before calling the API', async () => {
    const ctx = createCommandContext({ flags: { to: '2026-02-30', output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to load usage terms.',
      expect.objectContaining({ message: '--to must be a valid calendar date in YYYY-MM-DD format.' }),
    )
    expect(process.exitCode).toBe(1)
  })

  it('translates NO_USAGE_TERMS into an actionable message', async () => {
    vi.mocked(api.usage.getTerms).mockRejectedValue(new NotFoundError({
      statusCode: 404,
      error: 'Not Found',
      message: 'No usage terms found for the requested date',
      code: 'NO_USAGE_TERMS',
    } as any))
    const ctx = createCommandContext({ flags: { output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to load usage terms.',
      expect.stringContaining('No usage terms cover this account'),
    )
    expect(process.exitCode).toBe(1)
  })
})
