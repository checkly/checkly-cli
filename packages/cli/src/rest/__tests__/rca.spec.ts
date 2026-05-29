import { describe, expect, it, vi } from 'vitest'
import Rca from '../rca.js'

describe('Rca REST client', () => {
  it('triggers an error group RCA without a body when no user context is given', async () => {
    const api = {
      post: vi.fn().mockResolvedValue({ data: { id: 'rca-id' } }),
    }
    const rca = new Rca(api as any)

    await rca.trigger('error-group-id')

    expect(api.post).toHaveBeenCalledWith(
      '/v1/root-cause-analyses/error-groups/error-group-id',
      undefined,
    )
  })

  it('passes user context as the body when triggering an error group RCA', async () => {
    const api = {
      post: vi.fn().mockResolvedValue({ data: { id: 'rca-id' } }),
    }
    const rca = new Rca(api as any)

    await rca.trigger('error-group-id', 'some extra context')

    expect(api.post).toHaveBeenCalledWith(
      '/v1/root-cause-analyses/error-groups/error-group-id',
      { userContext: 'some extra context' },
    )
  })

  it('triggers a test session error group RCA without a body when no user context is given', async () => {
    const api = {
      post: vi.fn().mockResolvedValue({ data: { id: 'rca-id' } }),
    }
    const rca = new Rca(api as any)

    await rca.triggerTestSessionErrorGroup('ts-error-group-id')

    expect(api.post).toHaveBeenCalledWith(
      '/v1/root-cause-analyses/test-session-error-groups/ts-error-group-id',
      undefined,
    )
  })

  it('passes user context as the body when triggering a test session error group RCA', async () => {
    const api = {
      post: vi.fn().mockResolvedValue({ data: { id: 'rca-id' } }),
    }
    const rca = new Rca(api as any)

    await rca.triggerTestSessionErrorGroup('ts-error-group-id', 'some extra context')

    expect(api.post).toHaveBeenCalledWith(
      '/v1/root-cause-analyses/test-session-error-groups/ts-error-group-id',
      { userContext: 'some extra context' },
    )
  })
})
