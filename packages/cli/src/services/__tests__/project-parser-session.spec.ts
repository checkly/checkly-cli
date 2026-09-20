import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'

import { parseProject } from '../project-parser.js'
import { Session } from '../../constructs/session.js'

describe('parseProject() Session plumbing', () => {
  let dir: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-project-parser-'))
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'empty-project' }))
  })

  afterEach(() => {
    Session.reset()
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('threads embeddedPackages into Session and reset() clears it', async () => {
    await parseProject({
      directory: dir,
      projectLogicalId: 'test-project',
      projectName: 'Test Project',
      availableRuntimes: {},
      defaultRuntimeId: '2025.04',
      embeddedPackages: ['@acme/private-utils', 'legacy-private-pkg@2.1.0'],
    })

    expect(Session.embeddedPackages).toEqual(['@acme/private-utils', 'legacy-private-pkg@2.1.0'])

    Session.reset()
    expect(Session.embeddedPackages).toBeUndefined()
  })

  it('parses from the physical directory, since loaders report files with symlinks resolved', async () => {
    // On macOS os.tmpdir() is a symlink (/var -> /private/var), so the
    // directory handed in here differs from its physical path.
    await parseProject({
      directory: dir,
      projectLogicalId: 'test-project',
      projectName: 'Test Project',
      availableRuntimes: {},
      defaultRuntimeId: '2025.04',
    })

    const physical = await fs.realpath(dir)
    expect(Session.checkFilesDirectory).toBe(physical)
    expect(Session.basePath).toBe(physical)
    expect(Session.contextPath).toBe(physical)
  })

  it('leaves Session.embeddedPackages undefined when not configured', async () => {
    await parseProject({
      directory: dir,
      projectLogicalId: 'test-project',
      projectName: 'Test Project',
      availableRuntimes: {},
      defaultRuntimeId: '2025.04',
    })

    expect(Session.embeddedPackages).toBeUndefined()
  })
})
