import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  errorGroups: { get: vi.fn() },
  testSessionErrorGroups: { get: vi.fn() },
  rca: { trigger: vi.fn(), triggerTestSessionErrorGroup: vi.fn(), pollUntilComplete: vi.fn() },
}))

import * as api from '../../rest/api.js'
import { NotFoundError } from '../../rest/errors.js'
import { BaseCommand } from '../baseCommand.js'
import RcaRun from '../rca/run.js'

function createCommandContext (flags: Record<string, unknown>) {
  return {
    argv: [],
    parse: vi.fn().mockResolvedValue({ flags: { watch: false, output: 'detail', ...flags } }),
    log: vi.fn(),
    searchedAccount: vi.fn(),
    notFoundHint: BaseCommand.prototype.notFoundHint,
    withNotFoundHint: BaseCommand.prototype.withNotFoundHint,
    style: { outputFormat: undefined, shortError: vi.fn(), longError: vi.fn() },
  }
}

const notFound = () => new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' })

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
})
