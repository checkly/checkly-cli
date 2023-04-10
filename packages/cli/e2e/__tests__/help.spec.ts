import { runChecklyCli } from '../run-checkly'
import * as config from 'config'
import '../command-matchers'

describe('help', () => {
  it('should print custom help with examples', () => {
    const result = runChecklyCli({
      args: [''],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result).toHaveStdoutContaining('EXAMPLES')
  })
})
