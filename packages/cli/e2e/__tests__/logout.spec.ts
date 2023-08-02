import { runChecklyCli } from '../run-checkly'

describe('logout', () => {
  it('should logout', () => {
    const { status, stdout, stderr } = runChecklyCli({
      args: ['logout'],
      promptsInjection: [true],
    })
    expect(stdout).toContain('See you soon! 👋')
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })
})
