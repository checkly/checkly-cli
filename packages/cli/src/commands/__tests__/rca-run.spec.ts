import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  getDefaults: vi.fn(() => ({ accountId: 'acc-1' })),
  errorGroups: { get: vi.fn() },
  testSessionErrorGroups: { get: vi.fn() },
  rca: { trigger: vi.fn(), triggerTestSessionErrorGroup: vi.fn(), pollUntilComplete: vi.fn() },
}))

import * as api from '../../rest/api.js'
import { ForbiddenError, NotFoundError } from '../../rest/errors.js'
import RcaRun from '../rca/run.js'
import { createCommandContext as createSharedCommandContext } from './helpers/command-context.js'

function createCommandContext (flags: Record<string, unknown>) {
  return createSharedCommandContext({
    command: RcaRun,
    parsed: { flags: { watch: false, output: 'detail', ...flags } },
    members: { argv: [] },
  })
}

const notFound = () => new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' })
const forbidden = (errorCode?: string) => new ForbiddenError({
  statusCode: 403,
  error: 'Forbidden',
  message: errorCode ? 'Rocky AI is not enabled for this account.' : 'Forbidden',
  ...errorCode && { errorCode },
})

describe('rca run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
  })

  it('says the error group was not found', async () => {
    vi.mocked(api.errorGroups.get).mockRejectedValue(notFound())
    const ctx = createCommandContext({ 'error-group': 'eg-1' })

    await RcaRun.prototype.run.call(ctx as any)

    expect(ctx.style.shortError).toHaveBeenCalledWith('Error group not found: eg-1.')
    expect(process.exitCode).toBe(1)
  })

  it('says which account it searched when the test session error group is not there', async () => {
    vi.mocked(api.testSessionErrorGroups.get).mockRejectedValue(notFound())
    const ctx = createCommandContext({ 'test-session-error-group': 'tseg-1' })
    ctx.searchedAccount.mockReturnValue({ id: 'acc-1', name: 'Acme' })

    await RcaRun.prototype.run.call(ctx as any)

    expect(ctx.style.shortError).toHaveBeenCalledWith('Test session error group not found: tseg-1. '
      + 'Searched account "Acme" (acc-1). If it belongs to another of your accounts, run the command again '
      + 'with `CHECKLY_ACCOUNT_ID=<id>` set; `npx checkly whoami` lists them.')
  })

  it('says Rocky AI is disabled and where an owner can enable it', async () => {
    vi.mocked(api.errorGroups.get).mockResolvedValue({ data: { checkId: 'check-1' } } as any)
    vi.mocked(api.rca.trigger).mockRejectedValue(forbidden('ERR_ROCKY_AI_DISABLED'))
    const ctx = createCommandContext({ 'error-group': 'eg-1' })

    await RcaRun.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Rocky AI is disabled for this account.',
      'An account owner can enable it in the Rocky AI settings: https://app.checklyhq.com/accounts/acc-1/rocky-ai',
      { code: 'ERR_ROCKY_AI_DISABLED' },
    )
    expect(process.exitCode).toBe(1)
  })

  it('reports a disabled Rocky AI with its code in JSON output', async () => {
    vi.mocked(api.testSessionErrorGroups.get).mockResolvedValue({ data: {} } as any)
    vi.mocked(api.rca.triggerTestSessionErrorGroup).mockRejectedValue(forbidden('ERR_ROCKY_AI_DISABLED'))
    const ctx = createCommandContext({ 'test-session-error-group': 'tseg-1', 'output': 'json' })

    await RcaRun.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Rocky AI is disabled for this account.',
      expect.stringContaining('/accounts/acc-1/rocky-ai'),
      { code: 'ERR_ROCKY_AI_DISABLED' },
    )
    expect(process.exitCode).toBe(1)
  })

  it('keeps the generic error for a 403 without a code', async () => {
    vi.mocked(api.errorGroups.get).mockResolvedValue({ data: { checkId: 'check-1' } } as any)
    const err = forbidden()
    vi.mocked(api.rca.trigger).mockRejectedValue(err)
    const ctx = createCommandContext({ 'error-group': 'eg-1' })

    await RcaRun.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to trigger root cause analysis.', err)
    expect(process.exitCode).toBe(1)
  })
})
