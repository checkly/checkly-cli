import { runChecklyCli } from '../run-checkly'

describe('check parse error', () => {
  it('"checkly test" should return a clear error when there are check dependency errors', () => {
    const result = runChecklyCli({
      args: ['test'],
      directory: 'check-parse-error'
    })
    expect(result.stderr).toMatchSnapshot()
  })
})
