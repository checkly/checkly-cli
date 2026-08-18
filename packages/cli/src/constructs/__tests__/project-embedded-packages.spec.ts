import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

import { Project } from '../project.js'
import { PlaywrightCheck } from '../playwright-check.js'
import { Session } from '../session.js'
import { Diagnostics, WarningDiagnostic } from '../diagnostics.js'
import { InvalidPropertyValueDiagnostic, UnsatisfiedLocalPrerequisitesDiagnostic } from '../construct-diagnostics.js'
import { Package, Workspace } from '../../services/check-parser/package-files/workspace.js'
import { Ok, Err } from '../../services/check-parser/package-files/result.js'

describe('Project embedded packages validation', () => {
  let dir: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-embed-validate-'))
    await fs.writeFile(path.join(dir, 'playwright.config.ts'), 'export default {}\n')
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), [
      `lockfileVersion: '9.0'`,
      `packages:`,
      `  present-pkg@1.0.0:`,
      `    resolution: {integrity: sha512-aaa}`,
      `  'present-git@https://codeload.github.com/user/present-git/tar.gz/abc':`,
      `    resolution: {tarball: https://codeload.github.com/user/present-git/tar.gz/abc}`,
    ].join('\n'))
    await fs.writeFile(path.join(dir, 'yarn.lock'), '')
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  beforeEach(() => {
    Session.reset()
  })

  afterEach(() => {
    Session.reset()
  })

  // `lockfile: null` sets up a workspace without a lockfile.
  const setupProject = ({ withPlaywrightCheck = true, lockfile = 'pnpm-lock.yaml' as string | null } = {}) => {
    const project = new Project('embed-validate', { name: 'Embed Validate' })
    Session.project = project
    Session.basePath = dir
    Session.contextPath = dir
    Session.checkDefaults = {}
    Session.workspace = Ok(new Workspace({
      root: new Package({ name: 'embed-validate', path: dir }),
      packages: [],
      lockfile: lockfile !== null
        ? Ok(path.join(dir, lockfile))
        : Err(new Error('no lockfile')),
      configFile: Err(new Error('no config file')),
    }))

    if (withPlaywrightCheck) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const check = new PlaywrightCheck('pw-suite', {
        name: 'PW Suite',
        playwrightConfigPath: path.join(dir, 'playwright.config.ts'),
      })
    }

    return project
  }

  const validateEmbeddedDiagnostics = async (project: Project) => {
    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)
    // Ignore diagnostics produced by the checks themselves; only the
    // project-level embedded-packages ones are under test here.
    return diagnostics.observations.filter(diag =>
      diag instanceof UnsatisfiedLocalPrerequisitesDiagnostic
      || (diag instanceof InvalidPropertyValueDiagnostic && diag.property === 'checks.embeddedPackages'))
  }

  it('surfaces plan warnings as non-fatal warning diagnostics', async () => {
    const project = setupProject()
    Session.embeddedPackages = ['present-*']
    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)
    const warning = diagnostics.observations.find((diag): diag is WarningDiagnostic =>
      diag instanceof WarningDiagnostic && diag.title === 'Embedded packages')
    expect(warning).toBeDefined()
    expect(warning?.message).toContain('present-git')
    expect(warning?.isFatal()).toBe(false)
    // The wildcard resolves present-pkg, so no fatal issue accompanies it.
    expect(diagnostics.observations.filter(diag =>
      diag instanceof InvalidPropertyValueDiagnostic && diag.property === 'checks.embeddedPackages')).toEqual([])
  })

  it('maps a missing lockfile to an unsatisfied-prerequisites diagnostic', async () => {
    const project = setupProject({ lockfile: null })
    Session.embeddedPackages = ['present-pkg']

    const observations = await validateEmbeddedDiagnostics(project)
    expect(observations).toHaveLength(1)
    expect(observations[0]).toBeInstanceOf(UnsatisfiedLocalPrerequisitesDiagnostic)
    expect(observations[0].message).toContain('require a lockfile')
  })

  it('maps an unsupported lockfile to an unsatisfied-prerequisites diagnostic', async () => {
    const project = setupProject({ lockfile: 'yarn.lock' })
    Session.embeddedPackages = ['present-pkg']

    const observations = await validateEmbeddedDiagnostics(project)
    expect(observations).toHaveLength(1)
    expect(observations[0]).toBeInstanceOf(UnsatisfiedLocalPrerequisitesDiagnostic)
    expect(observations[0].message).toContain('yarn.lock')
  })

  it('groups multiple spec issues into a single diagnostic', async () => {
    const project = setupProject()
    Session.embeddedPackages = ['missing-one', 'missing-two']

    const observations = await validateEmbeddedDiagnostics(project)
    expect(observations).toHaveLength(1)
    expect(observations[0]).toBeInstanceOf(InvalidPropertyValueDiagnostic)
    expect(observations[0].message).toContain('missing-one')
    expect(observations[0].message).toContain('missing-two')
  })

  it('accepts specs that resolve against the lockfile', async () => {
    const project = setupProject()
    Session.embeddedPackages = ['present-pkg']

    const observations = await validateEmbeddedDiagnostics(project)
    expect(observations).toHaveLength(0)
  })

  it('skips validation when the project has no Playwright checks', async () => {
    const project = setupProject({ withPlaywrightCheck: false })
    Session.embeddedPackages = ['missing-one']

    const observations = await validateEmbeddedDiagnostics(project)
    expect(observations).toHaveLength(0)
  })
})

describe('Session.getEmbeddedPackagesMaterializer()', () => {
  afterEach(() => {
    Session.reset()
  })

  it('exists by default because detection defaults to on', () => {
    expect(Session.getEmbeddedPackagesMaterializer()).toBeDefined()
  })

  it('returns undefined when detection is off and nothing is configured', () => {
    Session.detectEmbeddedPackages = false
    expect(Session.getEmbeddedPackagesMaterializer()).toBeUndefined()
    Session.embeddedPackages = []
    expect(Session.getEmbeddedPackagesMaterializer()).toBeUndefined()
  })

  it('exists with explicit packages even when detection is off', () => {
    Session.detectEmbeddedPackages = false
    Session.embeddedPackages = ['some-pkg']
    expect(Session.getEmbeddedPackagesMaterializer()).toBeDefined()
  })

  it('memoizes the instance and reset() clears it', () => {
    Session.embeddedPackages = ['some-pkg']
    const first = Session.getEmbeddedPackagesMaterializer()
    expect(first).toBeDefined()
    expect(Session.getEmbeddedPackagesMaterializer()).toBe(first)

    Session.reset()
    expect(Session.embeddedPackagesMaterializer).toBeUndefined()
  })
})
