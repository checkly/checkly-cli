import { runChecklyCli } from '../run-checkly'
import * as config from 'config'
import '../command-matchers'

describe('locations', () => {
  it('should give locations list', () => {
    const result = runChecklyCli({
      args: ['locations'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result).toHaveStdoutContaining('us-east-1')
  })
})
