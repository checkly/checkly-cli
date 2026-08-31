import { describe, it, expect, vi } from 'vitest'

const { installDependenciesMock } = vi.hoisted(() => ({
  installDependenciesMock: vi.fn(),
}))

vi.mock('../../actions/dependencies.js', () => ({
  addDevDependecies: vi.fn(),
  installDependencies: installDependenciesMock,
}))
vi.mock('../../actions/git.js', () => ({
  initGit: () => Promise.resolve(),
}))

import { installDependenciesAndInitGit } from '../installation.js'

// The install outcome must reach the bootstrap command, which turns a failed
// install into a non-zero exit code for scripted callers. Pin the threading
// so a refactor cannot silently drop it and make failed installs exit 0
// again.
describe('installDependenciesAndInitGit()', () => {
  it('threads a failed install through as installOk: false', async () => {
    installDependenciesMock.mockResolvedValue(false)
    await expect(installDependenciesAndInitGit({ projectDirectory: '/tmp/project' }))
      .resolves.toEqual({ installOk: false })
  })

  it('threads a successful install through as installOk: true', async () => {
    installDependenciesMock.mockResolvedValue(true)
    await expect(installDependenciesAndInitGit({ projectDirectory: '/tmp/project' }))
      .resolves.toEqual({ installOk: true })
  })
})
