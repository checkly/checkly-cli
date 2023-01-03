import * as path from 'path'
import { runChecklyCli } from '../run-checkly'

describe('deploy', () => {
  it('Simple project should deploy successfully', () => {
    const result = runChecklyCli({
      args: ['deploy', '--force'],
      directory: path.join(__dirname, 'fixtures/simple-project'),
    })
    expect(result.stderr).toBe('')
  })
})
