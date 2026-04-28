import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import Cancel from '../cancel'

function makeAxiosMock (): AxiosInstance {
  return {
    post: vi.fn().mockResolvedValue({ data: {} }),
  } as unknown as AxiosInstance
}

describe('Cancel', () => {
  let api: AxiosInstance
  let cancel: Cancel

  beforeEach(() => {
    api = makeAxiosMock()
    cancel = new Cancel(api)
  })

  describe('cancelTestSession()', () => {
    it('calls POST /v1/cancel with the testSessionId payload', async () => {
      await cancel.cancelTestSession({ testSessionId: 'ts-abc' })

      expect(api.post).toHaveBeenCalledWith('/v1/cancel', { testSessionId: 'ts-abc' })
    })

    it('calls POST /v1/cancel with only the testSessionId field (not checkSessionId)', async () => {
      await cancel.cancelTestSession({ testSessionId: 'ts-xyz' })

      const [, payload] = vi.mocked(api.post).mock.calls[0]
      expect(payload).toEqual({ testSessionId: 'ts-xyz' })
      expect(payload).not.toHaveProperty('checkSessionId')
    })
  })

  describe('cancelCheckSession()', () => {
    it('calls POST /v1/cancel with the checkSessionId payload', async () => {
      await cancel.cancelCheckSession({ checkSessionId: 'cs-abc' })

      expect(api.post).toHaveBeenCalledWith('/v1/cancel', { checkSessionId: 'cs-abc' })
    })

    it('calls POST /v1/cancel with only the checkSessionId field (not testSessionId)', async () => {
      await cancel.cancelCheckSession({ checkSessionId: 'cs-xyz' })

      const [, payload] = vi.mocked(api.post).mock.calls[0]
      expect(payload).toEqual({ checkSessionId: 'cs-xyz' })
      expect(payload).not.toHaveProperty('testSessionId')
    })
  })
})
