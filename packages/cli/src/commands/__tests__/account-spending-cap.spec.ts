import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  spendingCap: { get: vi.fn(), update: vi.fn() },
}))

import * as api from '../../rest/api.js'
import { ConflictError } from '../../rest/errors.js'
import { InvalidInputError } from '../../helpers/invalid-input-error.js'
import { stripAnsi } from '../../formatters/render.js'
import type { SpendingCap } from '../../rest/spending-cap.js'
import AccountSpendingCap from '../account/spending-cap.js'
import AccountSpendingCapSet from '../account/spending-cap/set.js'
import AccountSpendingCapRemove from '../account/spending-cap/remove.js'
import { createCommandContext } from './helpers/command-context.js'

const current: SpendingCap = {
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
  vi.mocked(api.spendingCap.get).mockResolvedValue({ data: current } as any)
  vi.mocked(api.spendingCap.update).mockImplementation(cap =>
    Promise.resolve({ data: { spendingCapCents: cap } } as any))
})

describe('account spending-cap', () => {
  it('prints the API response as is for --output json', async () => {
    const ctx = context(AccountSpendingCap, { flags: { output: 'json' } })
    await AccountSpendingCap.prototype.run.call(ctx as any)
    expect(JSON.parse(ctx.logged[0])).toEqual(current)
  })

  it('renders the terminal view', async () => {
    const ctx = context(AccountSpendingCap, { flags: { output: 'detail' } })
    await AccountSpendingCap.prototype.run.call(ctx as any)
    expect(stripAnsi(ctx.logged[0])).toMatch(/Spending cap:\s+\$50\.00/)
  })

  it('maps a 409 to a clear error and exits 1', async () => {
    vi.mocked(api.spendingCap.get).mockRejectedValue(
      new ConflictError({ statusCode: 409, error: 'Conflict', message: 'PREPAID' }))
    const ctx = context(AccountSpendingCap, { flags: { output: 'detail' } })
    await AccountSpendingCap.prototype.run.call(ctx as any)
    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load the spending cap.',
      expect.stringMatching(/plan cannot have a spending cap/))
    expect(process.exitCode).toBe(1)
  })
})

describe('account spending-cap set', () => {
  it('rejects invalid amounts before calling the API', async () => {
    const ctx = context(AccountSpendingCapSet, { args: { dollars: '10000.01' }, flags: mutationFlags })
    await expect(AccountSpendingCapSet.prototype.run.call(ctx as any)).rejects.toThrow(InvalidInputError)
    expect(api.spendingCap.get).not.toHaveBeenCalled()
  })

  it('asks for confirmation in agent mode, previewing the change and the warning', async () => {
    const ctx = context(AccountSpendingCapSet, { args: { dollars: '12.50' }, flags: mutationFlags })
    await expect(AccountSpendingCapSet.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_3')
    const preview = JSON.parse(ctx.logged[0])
    expect(preview).toMatchObject({ status: 'confirmation_required', command: 'account spending-cap set' })
    expect(preview.changes[0]).toBe('Change the spending cap from $50.00 to $12.50')
    expect(preview.changes[1]).toMatch(/stop running at once/)
    expect(preview.confirmCommand).toBe('npx checkly account spending-cap set 12.50 --force')
    expect(api.spendingCap.update).not.toHaveBeenCalled()
  })

  it('--dry-run previews and exits 0', async () => {
    const ctx = context(AccountSpendingCapSet, {
      args: { dollars: '20' }, flags: { ...mutationFlags, 'dry-run': true },
    })
    await expect(AccountSpendingCapSet.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')
    expect(JSON.parse(ctx.logged[0]).status).toBe('dry_run')
    expect(api.spendingCap.update).not.toHaveBeenCalled()
  })

  it('sends integer cents with --force and prints the response for --output json', async () => {
    const ctx = context(AccountSpendingCapSet, {
      args: { dollars: '0.29' }, flags: { ...mutationFlags, output: 'json', force: true },
    })
    await AccountSpendingCapSet.prototype.run.call(ctx as any)
    expect(api.spendingCap.update).toHaveBeenCalledExactlyOnceWith(29)
    expect(JSON.parse(ctx.logged[0])).toEqual({ spendingCapCents: 29 })
  })
})

describe('account spending-cap remove', () => {
  it('sends null with --force', async () => {
    const ctx = context(AccountSpendingCapRemove, { flags: { ...mutationFlags, force: true } })
    await AccountSpendingCapRemove.prototype.run.call(ctx as any)
    expect(api.spendingCap.update).toHaveBeenCalledExactlyOnceWith(null)
    expect(ctx.style.shortSuccess).toHaveBeenCalledWith('Spending cap removed. Overage is no longer capped.')
  })

  it('previews removing the current cap', async () => {
    const ctx = context(AccountSpendingCapRemove, { flags: mutationFlags })
    await expect(AccountSpendingCapRemove.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_3')
    expect(JSON.parse(ctx.logged[0]).changes).toEqual(['Remove the spending cap of $50.00'])
  })
})
