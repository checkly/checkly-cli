import { describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

import * as api from '../../rest/api'
import { BaseCommand } from '../baseCommand'
import { AuthCommand } from '../authCommand'

describe('AuthCommand.init', () => {
  it('awaits BaseCommand.init before validating authentication', async () => {
    let releaseBaseInit!: () => void
    const baseInitGate = new Promise<void>(resolve => {
      releaseBaseInit = resolve
    })

    const baseInitSpy = vi.spyOn(BaseCommand.prototype, 'init').mockImplementation(async function () {
      await baseInitGate
    })

    const ctx = {}
    const initPromise = AuthCommand.prototype.init.call(ctx as any)

    await Promise.resolve()

    expect(baseInitSpy).toHaveBeenCalledTimes(1)
    expect(api.validateAuthentication).not.toHaveBeenCalled()

    releaseBaseInit()
    // This intentionally invokes AuthCommand.init with a fake `this`, so the
    // eventual rejection is incidental. The behavior under test is that auth
    // validation does not begin until BaseCommand.init has finished.
    await expect(initPromise).rejects.toThrow()

    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)

    baseInitSpy.mockRestore()
  })
})
