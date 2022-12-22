import { runChecklyCli } from '../run-checkly'
import * as config from 'config'
import '../command-matchers'

describe('whomai', () => {
  it('should give correct user', () => {
    const result = runChecklyCli({
      args: ['whoami'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result).toHaveStdoutContaining(config.get('accountName'))
  })
})