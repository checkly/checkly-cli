import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../run-checkly'

describe('deploy', () => {
  it('Simple project should deploy successfully', () => {
    const result = runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/deploy-project'),
    })
    expect(result.stderr).toBe('')
  })
})
