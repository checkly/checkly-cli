import path from 'path'
import { pathToLogicalId } from '../util'

describe('pathToLogicalId()', () => {
  it('should convert Windows paths', () => {
    const originalSep = path.sep
    try {
      path.sep = '\\'
      expect(pathToLogicalId('src\\__checks__\\my_check.spec.ts'))
        .toEqual('src/__checks__/my_check.spec.ts')
    } finally {
      path.sep = originalSep
    }
  })

  it('should have no effect on linux paths', () => {
    const originalSep = path.sep
    try {
      path.sep = '/'
      expect(pathToLogicalId('src/__checks__/my_check.spec.ts'))
        .toEqual('src/__checks__/my_check.spec.ts')
    } finally {
      path.sep = originalSep
    }
  })
})
