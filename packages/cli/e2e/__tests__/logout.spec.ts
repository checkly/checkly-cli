import { runChecklyCli } from '../run-checkly'

describe('logout', () => {
  it('should logout', () => {
    const { status, stdout, stderr } = runChecklyCli({
      args: ['logout'],
      promptsInjection: [true],
    })

    // TODO: try to get prompts questions text and validate them

    expect(stdout).toContain('See you soon! 👋')
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })
})
