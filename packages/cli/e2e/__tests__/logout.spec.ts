import { runChecklyCli } from '../run-checkly'

describe('logout', () => {
  it('should logout', () => {
    const { status, stdout, stderr } = runChecklyCli({
      args: ['logout'],
      promptsInjection: [true],
      timeout: 5000,
    })

    expect(stdout).toContain('See you soon! 👋')
    expect(stderr).toBe('')
    expect(status).toBe(0)
  }, 10000)
})
