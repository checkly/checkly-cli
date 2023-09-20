import * as path from 'path'
import config from 'config'
import { runChecklyCli } from '../run-checkly'

describe('check parse error', () => {
  it('"checkly test" should return a clear error when there are check dependency errors', async () => {
    const { stderr } = await runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/check-parse-error'),
    })
    const toAbsolutePath = (filename: string) => path.join(__dirname, 'fixtures', 'check-parse-error', filename)

    expect(stderr.replace(/(\r\n|\n|\r|\s+)/gm, '')).toContain(toAbsolutePath('entrypoint.js'))
  })
})
