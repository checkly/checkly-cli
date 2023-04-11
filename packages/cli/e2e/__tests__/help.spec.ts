import { runChecklyCli } from '../run-checkly'
import * as config from 'config'
import '../command-matchers'

describe('help', () => {
  it('should print custom help with examples', () => {
    const result = runChecklyCli({
      args: ['--help'],
    })
    expect(result).toHaveStdoutContaining('EXAMPLES')
  })
})
