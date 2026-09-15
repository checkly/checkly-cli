import path from 'node:path'

import { describe, it, expect, beforeEach } from 'vitest'

import { EmailAlertChannel } from '../email-alert-channel.js'
import { Project } from '../project.js'
import { resolveSourceFile } from '../project-bundle.js'
import { Session } from '../session.js'
import { Bundler } from '../../services/check-parser/bundler.js'

const repoRoot = path.resolve('/home/user/repo')

async function bundleProject () {
  const bundler = await Bundler.create({ cacheHash: 'foo' })
  return Session.project!.bundle(bundler)
}

describe('resolveSourceFile()', () => {
  it('returns the file relative to the repository root', () => {
    expect(resolveSourceFile(repoRoot, path.join(repoRoot, 'src', '__checks__', 'api.check.ts')))
      .toBe('src/__checks__/api.check.ts')
  })

  it('is undefined without a repository root', () => {
    expect(resolveSourceFile(undefined, path.join(repoRoot, 'api.check.ts'))).toBeUndefined()
  })

  it('is undefined without a declaring file', () => {
    expect(resolveSourceFile(repoRoot, undefined)).toBeUndefined()
  })

  it('is undefined for a file outside the repository', () => {
    expect(resolveSourceFile(repoRoot, path.resolve('/home/user/elsewhere/api.check.ts'))).toBeUndefined()
    expect(resolveSourceFile(repoRoot, repoRoot)).toBeUndefined()
  })

  it('uses posix separators for Windows paths', () => {
    expect(resolveSourceFile('C:\\repo', 'C:\\repo\\src\\api.check.ts', path.win32))
      .toBe('src/api.check.ts')
  })

  it('is undefined for a file on another Windows drive', () => {
    expect(resolveSourceFile('C:\\repo', 'D:\\other\\api.check.ts', path.win32)).toBeUndefined()
  })
})

describe('ProjectBundle.synthesize()', () => {
  beforeEach(() => {
    Session.reset()
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  function declareAlertChannel (logicalId: string, checkFileAbsolutePath: string | undefined) {
    Session.checkFileAbsolutePath = checkFileAbsolutePath
    try {
      return new EmailAlertChannel(logicalId, { address: 'alerts@example.com' })
    } finally {
      Session.checkFileAbsolutePath = undefined
    }
  }

  it('reports each resource\'s source file relative to the repository root', async () => {
    declareAlertChannel('email', path.join(repoRoot, 'src', 'alerts', 'email.ts'))

    const { resources } = (await bundleProject()).synthesize({ repoRoot })

    expect(resources).toEqual([
      expect.objectContaining({ logicalId: 'email', sourceFile: 'src/alerts/email.ts' }),
    ])
  })

  it('reports the config file for constructs declared in checkly.config.ts', async () => {
    declareAlertChannel('email', path.join(repoRoot, 'checkly.config.ts'))

    const { resources } = (await bundleProject()).synthesize({ repoRoot })

    expect(resources).toEqual([
      expect.objectContaining({ logicalId: 'email', sourceFile: 'checkly.config.ts' }),
    ])
  })

  it('omits sourceFile without a repository root', async () => {
    declareAlertChannel('email', path.join(repoRoot, 'src', 'email.ts'))

    const { resources } = (await bundleProject()).synthesize()

    expect(resources).toHaveLength(1)
    expect(resources[0]).not.toHaveProperty('sourceFile')
  })

  it('omits sourceFile for constructs declared outside the repository', async () => {
    declareAlertChannel('outside', path.resolve('/home/user/elsewhere/email.ts'))
    declareAlertChannel('unknown', undefined)

    const { resources } = (await bundleProject()).synthesize({ repoRoot })

    expect(resources).toHaveLength(2)
    for (const resource of resources) {
      expect(resource).not.toHaveProperty('sourceFile')
    }
  })

  it('keeps sourceFile on the envelope rather than in the payload', async () => {
    declareAlertChannel('email', path.join(repoRoot, 'src', 'email.ts'))

    const { resources } = (await bundleProject()).synthesize({ repoRoot })

    expect(resources[0].payload).not.toHaveProperty('sourceFile')
  })
})
