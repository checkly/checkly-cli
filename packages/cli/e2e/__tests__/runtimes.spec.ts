import { runChecklyCli } from '../run-checkly'

describe('runtimes', () => {
  it('should return supported runtimes', async () => {
    const { stdout } = await runChecklyCli({
      args: ['runtimes'],
    })
    expect(stdout).toMatchSnapshot('runtimes')
  })
})
