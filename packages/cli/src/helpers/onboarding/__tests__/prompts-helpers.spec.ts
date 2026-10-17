import { describe, expect, it, vi } from 'vitest'

import { makeOnCancel } from '../prompts-helpers.js'

describe('makeOnCancel', () => {
  it('logs the cancellation and throws an oclif exit with code 0 instead of ending the process', () => {
    const log = vi.fn()
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      expect(() => makeOnCancel(log)()).toThrow(expect.objectContaining({ oclif: { exit: 0 } }))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Setup cancelled'))
      expect(exit).not.toHaveBeenCalled()
    } finally {
      exit.mockRestore()
    }
  })
})
