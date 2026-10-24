import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { OutsideProjectError, Session } from '../../constructs/session.js'
import { NO_DELEGATION_ENV } from '../project-cli.js'
import {
  explainFromConstructSide,
  explainTwoInstalls,
  findContainingInstall,
  findResolvedInstall,
  TWO_INSTALLS_MARKER,
} from '../two-installs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..')
const CLI_BIN = path.join(CLI_PACKAGE_ROOT, 'bin', 'run.cjs')
const OLD_MESSAGE = 'Unable to create a construct \'ApiCheck\' outside a Checkly CLI project.'
// Explanations show paths with the platform's separators.
const nodeModulesCheckly = path.join('node_modules', 'checkly')

/**
 * A checkly install that stands in for another, older copy: its constructs
 * throw the error every version throws when created outside a project.
 */
async function writeOtherInstall (projectDir: string, version = '1.2.3') {
  const dir = path.join(projectDir, 'node_modules', 'checkly')
  await fs.mkdir(path.join(dir, 'bin'), { recursive: true })
  await fs.writeFile(path.join(dir, 'bin', 'run.cjs'), '')
  await fs.writeFile(path.join(dir, 'index.js'), 'export const defineConfig = config => config\n')
  await fs.writeFile(path.join(dir, 'constructs.js'), [
    'export class ApiCheck {',
    `  constructor () { throw new Error(${JSON.stringify(OLD_MESSAGE)}) }`,
    '}',
  ].join('\n'))
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: 'checkly',
    version,
    type: 'module',
    bin: { checkly: './bin/run.cjs' },
    exports: { '.': './index.js', './constructs': './constructs.js' },
  }))
  return dir
}

let tempDir: string
let savedArgv: string[]
let savedOptOut: string | undefined
let originalCwd: typeof process.cwd

beforeEach(async () => {
  tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-two-installs-')))
  savedArgv = process.argv
  savedOptOut = process.env[NO_DELEGATION_ENV]
  delete process.env[NO_DELEGATION_ENV]
  originalCwd = process.cwd
  process.cwd = () => tempDir
})

afterEach(async () => {
  process.argv = savedArgv
  process.cwd = originalCwd
  if (savedOptOut === undefined) {
    delete process.env[NO_DELEGATION_ENV]
  } else {
    process.env[NO_DELEGATION_ENV] = savedOptOut
  }
  Session.reset()
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('explainTwoInstalls', () => {
  const project = { dir: '/p/node_modules/checkly', version: '9.5.0' }

  it('tells an older CLI to run the project\'s own CLI or update', () => {
    const text = explainTwoInstalls({ construct: project, project, running: { dir: '/g/checkly', version: '9.4.0' } })

    expect(text).toBe(
      'The project\'s files import checkly 9.5.0 from /p/node_modules/checkly, but checkly 9.4.0 from /g/checkly '
      + `runs this command. ${TWO_INSTALLS_MARKER} Run the project's own CLI with \`npx checkly\` (or your package `
      + 'manager\'s equivalent, such as `pnpm exec checkly` or `yarn checkly`), or update this checkly to 10.0.0 or '
      + 'later, which runs the project\'s install automatically.',
    )
  })

  it(`names ${NO_DELEGATION_ENV} when it stops a CLI that could hand off`, () => {
    const running = { dir: '/g/checkly', version: '10.0.0' }
    expect(explainTwoInstalls({ construct: project, project, running })).not.toContain(NO_DELEGATION_ENV)
    expect(explainTwoInstalls({ construct: project, project, running })).toContain(
      'If that fails too, reinstall the project\'s dependencies.',
    )

    process.env[NO_DELEGATION_ENV] = '1'
    expect(explainTwoInstalls({ construct: project, project, running })).toContain(
      `${NO_DELEGATION_ENV}=1 is set, which stops checkly from running the project's install; unset it`,
    )
    // A release candidate before the hand-off cannot hand off at all.
    expect(explainTwoInstalls({ construct: project, project, running: { ...running, version: '10.0.0-rc.3' } }))
      .toContain('update this checkly to 10.0.0 or later')
  })

  it('asks for a single install when the file resolves another checkly than the project', () => {
    const construct = { dir: '/p/packages/a/node_modules/checkly', version: '9.0.0' }
    const running = { dir: '/p/node_modules/checkly', version: '10.0.0' }

    expect(explainTwoInstalls({ construct, project: running, running })).toBe(
      'This file imports checkly 9.0.0 from /p/packages/a/node_modules/checkly, but checkly 10.0.0 from '
      + `/p/node_modules/checkly runs this command. ${TWO_INSTALLS_MARKER} Make the project resolve a single checkly `
      + 'install, for example by depending on the same checkly version in every package.',
    )
    expect(explainTwoInstalls({ construct, running })).toContain('Make the project resolve a single checkly install')
  })
})

describe('install lookups', () => {
  it('finds the install containing a file and the one a directory resolves', async () => {
    const dir = await writeOtherInstall(tempDir)
    const nested = path.join(tempDir, 'checks')
    await fs.mkdir(nested)

    expect(findContainingInstall(path.join(dir, 'bin', 'run.cjs'))).toEqual({ dir, version: '1.2.3' })
    expect(findResolvedInstall(nested)).toEqual({ dir, version: '1.2.3' })
  })

  it('stops at the first node_modules/checkly, as Node does', async () => {
    await writeOtherInstall(tempDir)
    const project = path.join(tempDir, 'project')
    await fs.mkdir(path.join(project, 'node_modules', 'checkly'), { recursive: true })
    await fs.writeFile(path.join(project, 'node_modules', 'checkly', 'package.json'), '{"name": "chec')

    expect(findResolvedInstall(project)).toBeUndefined()
  })

  it('finds nothing, without throwing, for missing paths or other packages', async () => {
    await fs.writeFile(path.join(tempDir, 'script.js'), '')

    expect(findContainingInstall(path.join(tempDir, 'missing.js'))).toBeUndefined()
    expect(findContainingInstall(path.join(tempDir, 'script.js'))).toBeUndefined()
    expect(findResolvedInstall(tempDir)).toBeUndefined()
  })
})

describe('creating a construct outside a project', () => {
  const construct = { type: 'check', constructor: { name: 'ApiCheck' }, allowInChecklyConfig: () => false } as any

  function errorFor (argv1: string | undefined): Error {
    process.argv = [process.execPath, ...(argv1 ? [argv1] : [])]
    try {
      Session.validateCreateConstruct(construct)
    } catch (err) {
      return err as Error
    }
    throw new Error('expected validateCreateConstruct to throw')
  }

  it('explains when another checkly install runs the command', async () => {
    const running = await writeOtherInstall(path.join(tempDir, 'global'), '9.4.0')

    const err = errorFor(path.join(running, 'bin', 'run.cjs'))

    expect(err).toBeInstanceOf(OutsideProjectError)
    expect(err.message).toMatch(new RegExp(`^${OLD_MESSAGE.replace(/[.']/g, '\\$&')}\n\n`))
    expect(err.message).toContain(`but checkly 9.4.0 from ${path.join('global', nodeModulesCheckly)} runs this command`)
  })

  it('keeps the message when this install runs the command, or no checkly does', async () => {
    await fs.writeFile(path.join(tempDir, 'script.js'), '')

    expect(errorFor(CLI_BIN).message).toBe(OLD_MESSAGE)
    expect(errorFor(path.join(tempDir, 'script.js')).message).toBe(OLD_MESSAGE)
    expect(errorFor(undefined).message).toBe(OLD_MESSAGE)
    expect(explainFromConstructSide()).toBeUndefined()
  })
})

describe('loading a file whose constructs come from another install', () => {
  function loadWithError (err: Error) {
    Session.loader = {
      isAuthoritativeFor: () => true,
      loadFile: () => Promise.reject(err),
    } as any
    return Session.loadFile(path.join(tempDir, 'home.check.ts')).then(
      () => {
        throw new Error('expected loadFile to fail')
      },
      (thrown: Error) => thrown,
    )
  }

  it('explains it once, without the other install\'s stack or a cause', async () => {
    await writeOtherInstall(tempDir)

    const err = await loadWithError(new Error(OLD_MESSAGE))

    expect(err.message).toContain(`${OLD_MESSAGE}\n\nThe project's files import checkly 1.2.3 from ${nodeModulesCheckly}`)
    expect(err.message.split(TWO_INSTALLS_MARKER)).toHaveLength(2)
    expect(err.message).not.toContain('    at ')
    expect(err.cause).toBeUndefined()
  })

  it('looks for the project\'s install from the config file\'s directory, not the workspace root', async () => {
    const project = path.join(tempDir, 'packages', 'app')
    await writeOtherInstall(project)
    process.env[NO_DELEGATION_ENV] = '1'
    Session.basePath = tempDir
    Session.checkFilesDirectory = project
    Session.loader = {
      isAuthoritativeFor: () => true,
      loadFile: () => Promise.reject(new Error(OLD_MESSAGE)),
    } as any

    const err: Error = await Session.loadFile(path.join(project, 'home.check.ts')).catch(thrown => thrown)

    expect(err.message).toContain('The project\'s files import checkly 1.2.3')
    expect(err.message).toContain(`${NO_DELEGATION_ENV}=1 is set`)
  })

  it('keeps an explanation the other install already gave', async () => {
    await writeOtherInstall(tempDir)
    const explained = `${OLD_MESSAGE}\n\nAlready explained. ${TWO_INSTALLS_MARKER}`

    const err = await loadWithError(new Error(explained))

    expect(err.message).toBe(`Error loading file '${path.join(tempDir, 'home.check.ts')}'\n${explained}`)
    expect(err.cause).toBeUndefined()
  })

  it('leaves its own errors and errors without another install alone', async () => {
    const own = await loadWithError(new OutsideProjectError(OLD_MESSAGE))
    expect(own.cause).toBeInstanceOf(OutsideProjectError)
    expect(own.message).not.toContain(TWO_INSTALLS_MARKER)

    const noInstall = await loadWithError(new Error(OLD_MESSAGE))
    expect(noInstall.message).not.toContain(TWO_INSTALLS_MARKER)
  })
})

// Runs the real launcher (needs a built dist/), with the hand-off turned off
// so this install loads a project whose checkly is another, older install.
describe('a project whose checkly is another install', () => {
  it('reports the explanation', async () => {
    await writeOtherInstall(tempDir)
    await fs.writeFile(path.join(tempDir, 'checkly.config.mjs'), [
      'import { defineConfig } from \'checkly\'',
      'export default defineConfig({ projectName: \'P\', logicalId: \'p\', checks: { checkMatch: \'*.check.mjs\' } })',
    ].join('\n'))
    await fs.writeFile(path.join(tempDir, 'home.check.mjs'), [
      'import { ApiCheck } from \'checkly/constructs\'',
      'new ApiCheck()',
    ].join('\n'))

    const child = spawn(process.execPath, [CLI_BIN, 'debug', 'parse-project'], {
      cwd: tempDir,
      env: { ...process.env, CHECKLY_SKIP_AUTH: '1', [NO_DELEGATION_ENV]: '1' },
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk
    })
    child.stderr.on('data', chunk => {
      output += chunk
    })
    await new Promise(resolve => child.on('close', resolve))

    // The output is JSON, which escapes the backslashes of Windows paths.
    expect(output.replaceAll('\\\\', '\\')).toContain(
      `The project's files import checkly 1.2.3 from ${nodeModulesCheckly}, but checkly 0.0.1-dev`,
    )
    expect(output).toContain(`${NO_DELEGATION_ENV}=1 is set`)
    expect(output.split(TWO_INSTALLS_MARKER)).toHaveLength(2)
  })
})
