import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { Session } from '../session.js'

describe('Session.relativeCheckFilePath', () => {
  afterEach(() => {
    Session.reset()
  })

  it('is relative to the parse directory, with posix separators', () => {
    Session.checkFilesDirectory = path.resolve('/proj')
    expect(Session.relativeCheckFilePath(path.resolve('/proj/src/a.check.ts'))).toBe('src/a.check.ts')
  })

  it('walks up for a declaring file outside the parse directory', () => {
    Session.checkFilesDirectory = path.resolve('/repo/apps/web')
    expect(Session.relativeCheckFilePath(path.resolve('/repo/packages/checks/index.ts')))
      .toBe('../../packages/checks/index.ts')
  })

  it('is unset without a parse directory or a file', () => {
    expect(Session.relativeCheckFilePath(path.resolve('/proj/src/a.check.ts'))).toBeUndefined()
    Session.checkFilesDirectory = path.resolve('/proj')
    expect(Session.relativeCheckFilePath(undefined)).toBeUndefined()
  })
})
