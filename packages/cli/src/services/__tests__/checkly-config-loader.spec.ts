import * as path from 'path'
import { loadChecklyConfig } from '../checkly-config-loader'

describe('loadChecklyConfig()', () => {
  it('config file should export an object', async () => {
    try {
      const config = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['no-export-config.js'])
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
  it('config file should export an object with projectName and logicalId', async () => {
    try {
      const config = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['no-logical-id-config.js'])
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
})
