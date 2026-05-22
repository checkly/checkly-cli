import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import Cancel from '../cancel.js'

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
    it('calls POST /v1/test-sessions/:id/cancel', async () => {
      await cancel.cancelTestSession({ testSessionId: 'ts-abc' })

      expect(api.post).toHaveBeenCalledWith('/v1/test-sessions/ts-abc/cancel', undefined)
    })

    it('passes sequenceId in the body when provided', async () => {
      await cancel.cancelTestSession({ testSessionId: 'ts-abc', sequenceId: ['seq-1', 'seq-2'] })

      expect(api.post).toHaveBeenCalledWith('/v1/test-sessions/ts-abc/cancel', { sequenceId: ['seq-1', 'seq-2'] })
    })

    it('silently ignores a 403 response', async () => {
      vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 403 } })

      await expect(cancel.cancelTestSession({ testSessionId: 'ts-forbidden' })).resolves.not.toThrow()
    })

    it('re-throws non-403 errors', async () => {
      vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 500 } })

      await expect(cancel.cancelTestSession({ testSessionId: 'ts-error' })).rejects.toEqual({ response: { status: 500 } })
    })
  })

  describe('cancelCheckSession()', () => {
    it('calls POST /v1/check-sessions/:id/cancel', async () => {
      await cancel.cancelCheckSession({ checkSessionId: 'cs-abc' })

      expect(api.post).toHaveBeenCalledWith('/v1/check-sessions/cs-abc/cancel', undefined)
    })

    it('passes sequenceId in the body when provided', async () => {
      await cancel.cancelCheckSession({ checkSessionId: 'cs-abc', sequenceId: ['seq-1'] })

      expect(api.post).toHaveBeenCalledWith('/v1/check-sessions/cs-abc/cancel', { sequenceId: ['seq-1'] })
    })
  })
})
