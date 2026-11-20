import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  spendingLimit: { get: vi.fn(), update: vi.fn() },
}))

import * as api from '../../rest/api.js'
import { ConflictError } from '../../rest/errors.js'
import { InvalidInputError } from '../../helpers/invalid-input-error.js'
import { stripAnsi } from '../../formatters/render.js'
import type { SpendingLimit } from '../../rest/spending-limit.js'
import AccountSpendingLimit from '../account/spending-limit.js'
import AccountSpendingLimitSet from '../account/spending-limit/set.js'
import AccountSpendingLimitRemove from '../account/spending-limit/remove.js'
import { createCommandContext } from './helpers/command-context.js'

const current: SpendingLimit = {
  spendingCapCents: 5000,
  standing: {
    measuredAt: '2099-11-15T00:00:00.000Z',
    pools: { BROWSER: { used: 14890, included: 12000, overageRuns: 2890, overageCents: 1806.25 } },
    overageCents: 1806.25,
    limit: { capCents: 5000, state: 'UNDER', closeAtCents: 4000 },
  },
}

const mutationFlags = { 'output': 'detail', 'force': false, 'dry-run': false }

function context (Command: any, parsed: Record<string, unknown>) {
  return createCommandContext({ command: Command, parsed })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.exitCode = undefined
  vi.mocked(api.spendingLimit.get).mockResolvedValue({ data: current } as any)
  vi.mocked(api.spendingLimit.update).mockImplementation(cap =>
    Promise.resolve({ data: { spendingCapCents: cap } } as any))
})

describe('account spending-limit', () => {
  it('prints the API response as is for --output json', async () => {
    const ctx = context(AccountSpendingLimit, { flags: { output: 'json' } })
    await AccountSpendingLimit.prototype.run.call(ctx as any)
    expect(JSON.parse(ctx.logged[0])).toEqual(current)
  })

  it('renders the terminal view', async () => {
    const ctx = context(AccountSpendingLimit, { flags: { output: 'detail' } })
    await AccountSpendingLimit.prototype.run.call(ctx as any)
    expect(stripAnsi(ctx.logged[0])).toMatch(/Spending limit:\s+\$50\.00/)
  })

  it('maps a 409 to a clear error and exits 1', async () => {
    vi.mocked(api.spendingLimit.get).mockRejectedValue(
      new ConflictError({ statusCode: 409, error: 'Conflict', message: 'PREPAID' }))
    const ctx = context(AccountSpendingLimit, { flags: { output: 'detail' } })
    await AccountSpendingLimit.prototype.run.call(ctx as any)
    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load the spending limit.',
      expect.stringMatching(/plan cannot have a spending limit/))
    expect(process.exitCode).toBe(1)
  })
})

describe('account spending-limit set', () => {
  it('rejects invalid amounts before calling the API', async () => {
    const ctx = context(AccountSpendingLimitSet, { args: { dollars: '10000.01' }, flags: mutationFlags })
    await expect(AccountSpendingLimitSet.prototype.run.call(ctx as any)).rejects.toThrow(InvalidInputError)
    expect(api.spendingLimit.get).not.toHaveBeenCalled()
  })

  it('asks for confirmation in agent mode, previewing the change and the warning', async () => {
    const ctx = context(AccountSpendingLimitSet, { args: { dollars: '12.50' }, flags: mutationFlags })
    await expect(AccountSpendingLimitSet.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_3')
    const preview = JSON.parse(ctx.logged[0])
    expect(preview).toMatchObject({ status: 'confirmation_required', command: 'account spending-limit set' })
    expect(preview.changes[0]).toBe('Change the spending limit from $50.00 to $12.50')
    expect(preview.changes[1]).toMatch(/stop running at once/)
    expect(preview.confirmCommand).toBe('npx checkly account spending-limit set 12.50 --force')
    expect(api.spendingLimit.update).not.toHaveBeenCalled()
  })

  it('--dry-run previews and exits 0', async () => {
    const ctx = context(AccountSpendingLimitSet, {
      args: { dollars: '20' }, flags: { ...mutationFlags, 'dry-run': true },
    })
    await expect(AccountSpendingLimitSet.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')
    expect(JSON.parse(ctx.logged[0]).status).toBe('dry_run')
    expect(api.spendingLimit.update).not.toHaveBeenCalled()
  })

  it('sends integer cents with --force and prints the response for --output json', async () => {
    const ctx = context(AccountSpendingLimitSet, {
      args: { dollars: '0.29' }, flags: { ...mutationFlags, output: 'json', force: true },
    })
    await AccountSpendingLimitSet.prototype.run.call(ctx as any)
    expect(api.spendingLimit.update).toHaveBeenCalledExactlyOnceWith(29)
    expect(JSON.parse(ctx.logged[0])).toEqual({ spendingCapCents: 29 })
  })
})

describe('account spending-limit remove', () => {
  it('sends null with --force', async () => {
    const ctx = context(AccountSpendingLimitRemove, { flags: { ...mutationFlags, force: true } })
    await AccountSpendingLimitRemove.prototype.run.call(ctx as any)
    expect(api.spendingLimit.update).toHaveBeenCalledExactlyOnceWith(null)
    expect(ctx.style.shortSuccess).toHaveBeenCalledWith('Spending limit removed. Overage is no longer capped.')
  })

  it('previews removing the current limit', async () => {
    const ctx = context(AccountSpendingLimitRemove, { flags: mutationFlags })
    await expect(AccountSpendingLimitRemove.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_3')
    expect(JSON.parse(ctx.logged[0]).changes).toEqual(['Remove the spending limit of $50.00'])
  })
})
