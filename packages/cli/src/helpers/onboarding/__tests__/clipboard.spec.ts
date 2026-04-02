import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

import { execSync } from 'child_process'
import { copyToClipboard } from '../clipboard'

const mockExecSync = vi.mocked(execSync)

describe('copyToClipboard', () => {
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    mockExecSync.mockReset()
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  function setPlatform (platform: string) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  }

  it('returns true on success', () => {
    setPlatform('darwin')
    mockExecSync.mockReturnValue(Buffer.from(''))
    const result = copyToClipboard('hello')
    expect(result).toBe(true)
  })

  it('returns false on failure without throwing', () => {
    setPlatform('darwin')
    mockExecSync.mockImplementation(() => {
      throw new Error('pbcopy not found')
    })
    const result = copyToClipboard('hello')
    expect(result).toBe(false)
  })

  it('uses pbcopy on darwin', () => {
    setPlatform('darwin')
    mockExecSync.mockReturnValue(Buffer.from(''))
    copyToClipboard('test text')
    expect(mockExecSync).toHaveBeenCalledWith('pbcopy', expect.objectContaining({ input: 'test text' }))
  })

  it('uses xclip on linux', () => {
    setPlatform('linux')
    mockExecSync.mockReturnValue(Buffer.from(''))
    copyToClipboard('test text')
    expect(mockExecSync).toHaveBeenCalledWith('xclip -selection clipboard', expect.objectContaining({ input: 'test text' }))
  })

  it('falls back to xsel if xclip fails on linux', () => {
    setPlatform('linux')
    mockExecSync
      .mockImplementationOnce(() => {
        throw new Error('xclip not found')
      })
      .mockReturnValueOnce(Buffer.from(''))
    copyToClipboard('test text')
    expect(mockExecSync).toHaveBeenNthCalledWith(1, 'xclip -selection clipboard', expect.objectContaining({ input: 'test text' }))
    expect(mockExecSync).toHaveBeenNthCalledWith(2, 'xsel --clipboard --input', expect.objectContaining({ input: 'test text' }))
  })

  it('uses clip on win32', () => {
    setPlatform('win32')
    mockExecSync.mockReturnValue(Buffer.from(''))
    copyToClipboard('test text')
    expect(mockExecSync).toHaveBeenCalledWith('clip', expect.objectContaining({ input: 'test text' }))
  })

  it('returns false on unknown platform', () => {
    setPlatform('freebsd')
    const result = copyToClipboard('test text')
    expect(result).toBe(false)
    expect(mockExecSync).not.toHaveBeenCalled()
  })
})
