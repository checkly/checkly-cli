import path from 'path'
import { pathToPosix } from '../util'

describe('pathToPosix()', () => {
  it('should convert Windows paths', () => {
    const originalSep = path.sep
    try {
      path.sep = '\\'
      expect(pathToPosix('src\\__checks__\\my_check.spec.ts'))
        .toEqual('src/__checks__/my_check.spec.ts')
    } finally {
      path.sep = originalSep
    }
  })

  it('should have no effect on linux paths', () => {
    const originalSep = path.sep
    try {
      path.sep = '/'
      expect(pathToPosix('src/__checks__/my_check.spec.ts'))
        .toEqual('src/__checks__/my_check.spec.ts')
    } finally {
      path.sep = originalSep
    }
  })
})
