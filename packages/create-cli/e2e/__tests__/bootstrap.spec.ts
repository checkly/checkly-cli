import { describe, it, expect } from 'vitest'

import { runChecklyCreateCli } from '../run-create-cli'

describe('bootstrap', () => {
  it('Should show deprecation notice pointing to npx checkly init', async () => {
    const commandOutput = await runChecklyCreateCli({
      directory: __dirname,
    })

    const { exitCode, stdout } = commandOutput

    expect(stdout).toContain('npx checkly init')
    expect(stdout).toContain('replaced')
    expect(exitCode).toBe(0)
  }, 15000)
})
