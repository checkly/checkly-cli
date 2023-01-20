import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../run-checkly'

describe('check parse error', () => {
  it('"checkly test" should return a clear error when there are check dependency errors', () => {
    const result = runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/check-parse-error'),
    })
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'fixtures', 'check-parse-error', filename)

    expect(result.stderr).toContain(toAbsolutePath('entrypoint.js'))
  })
})
