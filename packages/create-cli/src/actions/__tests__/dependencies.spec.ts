import { describe, it, expect, vi, beforeEach } from 'vitest'

const { spinnerFake, hintMock, execaMock, askInstallDependenciesMock } = vi.hoisted(() => ({
  spinnerFake: { text: '', fail: vi.fn(), succeed: vi.fn() },
  hintMock: vi.fn(),
  execaMock: vi.fn(),
  askInstallDependenciesMock: vi.fn(),
}))

vi.mock('execa', () => ({ execa: execaMock }))
vi.mock('../../utils/terminal.js', () => ({ spinner: () => spinnerFake }))
vi.mock('../../utils/messages.js', () => ({ hint: hintMock }))
vi.mock('../../utils/prompts.js', () => ({
  askInstallDependencies: askInstallDependenciesMock,
}))
vi.mock('../../utils/which-pm.js', () => ({
  getPackageManager: () => Promise.resolve({ name: 'npm' }),
}))

import { installDependencies } from '../dependencies.js'

describe('installDependencies()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    askInstallDependenciesMock.mockResolvedValue({ installDependencies: true })
  })

  it('reports success when the install exits cleanly', async () => {
    execaMock.mockImplementation(() => Promise.resolve({}))
    await expect(installDependencies('/tmp/project')).resolves.toBe(true)
    expect(spinnerFake.succeed).toHaveBeenCalledWith('Packages installed successfully')
    expect(spinnerFake.fail).not.toHaveBeenCalled()
  })

  it('resolves false without throwing when the install fails, so the bootstrap flow continues', async () => {
    execaMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('boom'), { shortMessage: 'Command failed with exit code 1: npm install' })))
    await expect(installDependencies('/tmp/project')).resolves.toBe(false)
    expect(spinnerFake.fail).toHaveBeenCalledWith('Failed to install packages (Command failed with exit code 1: npm install)')
    expect(spinnerFake.succeed).not.toHaveBeenCalled()
    expect(hintMock).toHaveBeenCalledWith('Uh oh.', expect.stringContaining('npm install'))
  })

  it('resolves false when execa itself throws synchronously', async () => {
    execaMock.mockImplementation(() => {
      throw new TypeError('Cannot use line breaks in commands or their arguments')
    })
    await expect(installDependencies('/tmp/project')).resolves.toBe(false)
    expect(spinnerFake.fail).toHaveBeenCalledWith('Failed to install packages')
  })

  it('resolves true without installing when the user declines', async () => {
    askInstallDependenciesMock.mockResolvedValue({ installDependencies: false })
    await expect(installDependencies('/tmp/project')).resolves.toBe(true)
    expect(execaMock).not.toHaveBeenCalled()
    expect(hintMock).toHaveBeenCalledWith('No worries.', expect.stringContaining('install the dependencies'))
  })
})
