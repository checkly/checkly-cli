import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Config } from '@oclif/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { FixtureSandbox } from '../../testing/fixture-sandbox.js'
import {
  childNodeOptions,
  findFlagValue,
  findInvokedCommand,
  findProjectCli,
  findProjectCliHandOff,
  NO_DELEGATION_ENV,
} from '../project-cli.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..')
const CLI_BIN = path.join(CLI_PACKAGE_ROOT, 'bin', 'run.cjs')

// Stands in for a project's own checkly install: reports how it was started
// and then behaves as FAKE_MODE asks.
const FAKE_BIN = `'use strict'
const report = JSON.stringify({
  marker: 'fake-project-cli',
  argv: process.argv.slice(2),
  handedOffTo: process.env.CHECKLY_HANDED_OFF_TO ?? null,
  dotenv: process.env.FAKE_DOTENV ?? null,
}) + '\\n'
const mode = process.env.FAKE_MODE
if (mode === 'wait-for-sigterm') {
  process.on('SIGTERM', () => process.stdout.write('got SIGTERM\\n', () => process.exit(42)))
  process.stdout.write(report + 'ready\\n')
  setInterval(() => {}, 1000)
} else if (mode === 'die-by-sigterm') {
  process.stdout.write(report, () => process.kill(process.pid, 'SIGTERM'))
} else {
  process.stdout.write(report)
  process.exitCode = Number(process.env.FAKE_EXIT ?? 0)
}
`

async function writeConfig (projectDir: string, filename = 'checkly.config.ts') {
  await fs.mkdir(projectDir, { recursive: true })
  await fs.writeFile(path.join(projectDir, filename), 'export default {}\n')
}

async function writeFakeInstall (projectDir: string, packageJson: Record<string, unknown> = {}) {
  const dir = path.join(projectDir, 'node_modules', 'checkly')
  await fs.mkdir(path.join(dir, 'bin'), { recursive: true })
  await fs.writeFile(path.join(dir, 'bin', 'fake.cjs'), FAKE_BIN)
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: 'checkly',
    version: '1.2.3',
    bin: { checkly: './bin/fake.cjs' },
    ...packageJson,
  }))
  return dir
}

function fakeConfig (root: string, commands: Record<string, Partial<Config['commands'][number]>>): Config {
  return {
    root,
    version: '10.0.0',
    // Command ids then come straight from the first argument.
    topicSeparator: ':',
    findCommand: (id: string) => commands[id],
  } as unknown as Config
}

const projectCommand = { parsesProject: true, flags: { config: { char: 'c' } } } as any

let tempDir: string
let savedOptOut: string | undefined

beforeEach(async () => {
  tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-project-cli-')))
  savedOptOut = process.env[NO_DELEGATION_ENV]
  delete process.env[NO_DELEGATION_ENV]
})

afterEach(async () => {
  if (savedOptOut === undefined) {
    delete process.env[NO_DELEGATION_ENV]
  } else {
    process.env[NO_DELEGATION_ENV] = savedOptOut
  }
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('childNodeOptions', () => {
  it('drops inspector flags from execArgv and NODE_OPTIONS', () => {
    expect(childNodeOptions(
      ['--inspect-brk=9230', '--enable-source-maps', '--debug-port=1'],
      '--max-old-space-size=4096  --inspect --no-warnings',
    )).toEqual({
      execArgv: ['--enable-source-maps'],
      nodeOptions: '--max-old-space-size=4096 --no-warnings',
    })
    expect(childNodeOptions([], undefined)).toEqual({ execArgv: [], nodeOptions: undefined })
  })
})

describe('findFlagValue', () => {
  it.each([
    [['--config', 'a.ts'], 'a.ts'],
    [['--config=a.ts'], 'a.ts'],
    [['-c', 'a.ts'], 'a.ts'],
    [['-c=a.ts'], 'a.ts'],
    [['-ca.ts'], 'a.ts'],
    [['--grep', 'x', '--config', 'a.ts'], 'a.ts'],
    [['--', '--config', 'a.ts'], undefined],
    [['--configure', 'a.ts'], undefined],
    [[], undefined],
  ])('reads %j', (args, expected) => {
    expect(findFlagValue(args, 'config', 'c')).toBe(expected)
  })

  it('ignores the short form when the flag has none', () => {
    expect(findFlagValue(['-c', 'a.ts'], 'config')).toBeUndefined()
  })
})

describe('findInvokedCommand', () => {
  let config: Config

  beforeAll(async () => {
    config = await Config.load(CLI_PACKAGE_ROOT)
  })

  it('matches space-separated and colon-separated topics and returns the remaining args', () => {
    for (const args of [['import', 'plan', '--root', 'x'], ['import:plan', '--root', 'x']]) {
      const invoked = findInvokedCommand(config, args)
      expect(invoked?.command.id).toBe('import:plan')
      expect(invoked?.rest).toEqual(['--root', 'x'])
    }
  })

  it('treats words after the command as its arguments', () => {
    expect(findInvokedCommand(config, ['test', 'home', '-c', 'x'])?.rest).toEqual(['home', '-c', 'x'])
  })

  it('finds nothing for unknown commands or bare flags', () => {
    expect(findInvokedCommand(config, ['nope'])).toBeUndefined()
    expect(findInvokedCommand(config, ['--version'])).toBeUndefined()
  })
})

describe('findProjectCli', () => {
  it('finds the nearest install from a nested directory', async () => {
    const dir = await writeFakeInstall(tempDir)
    const nested = path.join(tempDir, 'checks', 'api')
    await fs.mkdir(nested, { recursive: true })

    expect(await findProjectCli(nested)).toEqual({
      dir,
      version: '1.2.3',
      binPath: path.join(dir, 'bin', 'fake.cjs'),
    })
  })

  it('accepts the string form of bin', async () => {
    const dir = await writeFakeInstall(tempDir, { bin: './bin/fake.cjs' })
    expect((await findProjectCli(tempDir))?.binPath).toBe(path.join(dir, 'bin', 'fake.cjs'))
  })

  it('does not look for node_modules/node_modules', async () => {
    const inside = path.join(tempDir, 'node_modules', 'some-package')
    await fs.mkdir(path.join(tempDir, 'node_modules', 'node_modules', 'checkly'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'node_modules', 'node_modules', 'checkly', 'package.json'), '{"name":"x"}')
    await fs.mkdir(inside, { recursive: true })
    const dir = await writeFakeInstall(tempDir)

    expect((await findProjectCli(inside))?.dir).toBe(dir)
  })

  it('fails on an unreadable package.json instead of searching past it', async () => {
    await writeFakeInstall(tempDir)
    const project = path.join(tempDir, 'project')
    await fs.mkdir(path.join(project, 'node_modules', 'checkly'), { recursive: true })
    await fs.writeFile(path.join(project, 'node_modules', 'checkly', 'package.json'), '{"name": "chec')

    await expect(findProjectCli(project)).rejects.toThrow(SyntaxError)
  })

  it('rejects an install that is not the checkly package or lacks its bin', async () => {
    await writeFakeInstall(tempDir, { name: 'not-checkly' })
    expect(await findProjectCli(tempDir)).toBeUndefined()

    await writeFakeInstall(tempDir, { bin: { checkly: './bin/missing.cjs' } })
    expect(await findProjectCli(tempDir)).toBeUndefined()
  })

  it('finds nothing without an install', async () => {
    expect(await findProjectCli(tempDir)).toBeUndefined()
  })
})

describe('findProjectCliHandOff', () => {
  let originalCwd: typeof process.cwd

  beforeEach(() => {
    originalCwd = process.cwd
    process.cwd = () => tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
  })

  it('hands project commands to a different install', async () => {
    await writeConfig(tempDir, 'checkly.config.mjs')
    const dir = await writeFakeInstall(tempDir)
    const config = fakeConfig(CLI_PACKAGE_ROOT, { test: projectCommand })

    expect((await findProjectCliHandOff(config, ['test']))?.dir).toBe(dir)
  })

  it('keeps commands without a Checkly config file', async () => {
    await writeFakeInstall(tempDir)
    const config = fakeConfig(CLI_PACKAGE_ROOT, { test: projectCommand })

    expect(await findProjectCliHandOff(config, ['test'])).toBeUndefined()
    expect(await findProjectCliHandOff(config, ['test', '--config', 'missing.config.ts'])).toBeUndefined()
  })

  it('keeps commands that do not parse the project', async () => {
    await writeConfig(tempDir)
    await writeFakeInstall(tempDir)
    const config = fakeConfig(CLI_PACKAGE_ROOT, { whoami: { parsesProject: false, flags: {} } as any })

    expect(await findProjectCliHandOff(config, ['whoami'])).toBeUndefined()
  })

  it('keeps commands when the project resolves to this very install', async () => {
    await writeConfig(tempDir)
    const dir = await writeFakeInstall(tempDir)
    // Through a symlink, as with pnpm's node_modules layout.
    const link = path.join(tempDir, 'link')
    await fs.symlink(dir, link, 'dir')
    const config = fakeConfig(link, { test: projectCommand })

    expect(await findProjectCliHandOff(config, ['test'])).toBeUndefined()
  })

  it('resolves the install from the directory of --config', async () => {
    const otherProject = path.join(tempDir, 'other')
    await writeConfig(otherProject)
    const dir = await writeFakeInstall(otherProject)
    const config = fakeConfig(CLI_PACKAGE_ROOT, { test: projectCommand })

    expect(await findProjectCliHandOff(config, ['test'])).toBeUndefined()
    expect((await findProjectCliHandOff(config, ['test', '-c', 'other/checkly.config.ts']))?.dir).toBe(dir)
  })

  it('does not hand off again to the install a hand-off started', async () => {
    await writeConfig(tempDir)
    const dir = await writeFakeInstall(tempDir)
    const config = fakeConfig(CLI_PACKAGE_ROOT, { test: projectCommand })
    try {
      process.env.CHECKLY_HANDED_OFF_TO = dir
      expect(await findProjectCliHandOff(config, ['test'])).toBeUndefined()

      // A checkly started for another project still hands off.
      process.env.CHECKLY_HANDED_OFF_TO = path.join(tempDir, 'elsewhere')
      expect((await findProjectCliHandOff(config, ['test']))?.dir).toBe(dir)
    } finally {
      delete process.env.CHECKLY_HANDED_OFF_TO
    }
  })

  it(`is disabled by ${NO_DELEGATION_ENV}=1`, async () => {
    await writeConfig(tempDir)
    await writeFakeInstall(tempDir)
    process.env[NO_DELEGATION_ENV] = '1'
    const config = fakeConfig(CLI_PACKAGE_ROOT, { test: projectCommand })

    expect(await findProjectCliHandOff(config, ['test'])).toBeUndefined()
  })
})

// These run the real launcher, so they need a built dist/ and a manifest that
// knows parsesProject (`pnpm test` packs, which regenerates it). Each case
// asserts on the fake install's marker, so a stale manifest fails instead of
// passing by running in-process.
describe('launcher hand-off', () => {
  interface RunCliOptions {
    env?: Record<string, string>
    onStdout?: (stdout: string, child: ReturnType<typeof spawn>) => void
  }

  function runCli (args: string[], options: RunCliOptions = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env, CHECKLY_SKIP_AUTH: '1', ...options.env }
    delete env[NO_DELEGATION_ENV]
    if (options.env?.[NO_DELEGATION_ENV]) {
      env[NO_DELEGATION_ENV] = options.env[NO_DELEGATION_ENV]
    }
    const child = spawn(process.execPath, [CLI_BIN, ...args], { cwd: tempDir, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
      options.onStdout?.(stdout, child)
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    return new Promise<{ code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string }>(
      resolve => child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr })),
    )
  }

  function report (stdout: string) {
    const line = stdout.split('\n').find(line => line.includes('fake-project-cli'))
    return line ? JSON.parse(line) : undefined
  }

  beforeEach(async () => {
    await writeConfig(tempDir)
  })

  it('runs the project install with the same arguments and exits with its code', async () => {
    const dir = await writeFakeInstall(tempDir)
    await fs.writeFile(path.join(tempDir, '.env'), 'FAKE_DOTENV=from-dotenv\n')

    const result = await runCli(['test', 'home', '--grep', 'x'], { env: { FAKE_EXIT: '3' } })

    expect(report(result.stdout)).toEqual({
      marker: 'fake-project-cli',
      argv: ['test', 'home', '--grep', 'x'],
      handedOffTo: dir,
      // Installs before 8.0.0 do not load .env themselves.
      dotenv: 'from-dotenv',
    })
    expect(result.code).toBe(3)
    // The project's install is newer, so there is nothing to install.
    expect(result.stderr).toContain(
      'Using checkly 1.2.3 from this project (node_modules/checkly) instead of checkly 0.0.1-dev.\n',
    )
  })

  it('suggests installing the invoked version when the project install is older', async () => {
    await writeFakeInstall(tempDir, { version: '0.0.0' })

    const result = await runCli(['test'])

    expect(report(result.stdout)?.marker).toBe('fake-project-cli')
    expect(result.stderr).toContain(
      'Using checkly 0.0.0 from this project (node_modules/checkly) instead of checkly 0.0.1-dev. '
      + 'To use 0.0.1-dev, install it in this project.',
    )
  })

  it('says nothing when the project install is the same version', async () => {
    await writeFakeInstall(tempDir, { version: '0.0.1-dev' })

    const result = await runCli(['test'])

    expect(report(result.stdout)?.marker).toBe('fake-project-cli')
    expect(result.stderr).not.toContain('Using checkly')
  })

  it('leaves other commands and the opt-out to this install', async () => {
    await writeFakeInstall(tempDir)

    const help = await runCli(['whoami', '--help'])
    expect(report(help.stdout)).toBeUndefined()
    expect(help.stdout).toContain('whoami')

    // Help runs no project code.
    const projectHelp = await runCli(['test', '--help'])
    expect(report(projectHelp.stdout)).toBeUndefined()
    expect(projectHelp.stdout).toContain('--max-failures')

    // The in-process run then fails to load the placeholder config.
    const optedOut = await runCli(['validate'], { env: { [NO_DELEGATION_ENV]: '1' } })
    expect(report(optedOut.stdout)).toBeUndefined()
    expect(optedOut.stdout + optedOut.stderr).toContain('checkly.config.ts')
  })

  it.skipIf(process.platform === 'win32')('forwards SIGTERM to the project install', async () => {
    await writeFakeInstall(tempDir)
    let sent = false

    const result = await runCli(['test'], {
      env: { FAKE_MODE: 'wait-for-sigterm' },
      onStdout: (stdout, child) => {
        if (!sent && stdout.includes('ready\n')) {
          sent = true
          child.kill('SIGTERM')
        }
      },
    })

    expect(result.stdout).toContain('got SIGTERM')
    expect(result.code).toBe(42)
  })

  it.skipIf(process.platform === 'win32')('exits by the signal that ended the project install', async () => {
    await writeFakeInstall(tempDir)

    const result = await runCli(['test'], { env: { FAKE_MODE: 'die-by-sigterm' } })

    expect(report(result.stdout)?.marker).toBe('fake-project-cli')
    expect(result.signal).toBe('SIGTERM')
  })
})

describe('project with its own checkly install', () => {
  let sandbox: FixtureSandbox

  beforeAll(async () => {
    sandbox = await FixtureSandbox.create({})
    await fs.writeFile(sandbox.abspath('checkly.config.ts'), [
      'import { defineConfig } from \'checkly\'',
      'export default defineConfig({ projectName: \'P\', logicalId: \'p\', checks: { checkMatch: \'*.check.ts\' } })',
    ].join('\n'))
    await fs.writeFile(sandbox.abspath('home.check.ts'), [
      'import { ApiCheck } from \'checkly/constructs\'',
      'new ApiCheck(\'home\', { name: \'Home\', request: { url: \'https://example.com\', method: \'GET\' } })',
    ].join('\n'))
  })

  afterAll(async () => {
    await sandbox.destroy()
  })

  function parseProjectWithOtherInstall (env: Record<string, string> = {}) {
    // This package's own bin is a different install from the sandbox's
    // node_modules/checkly, like a global install would be.
    const childEnv: Record<string, string | undefined> = { ...process.env, CHECKLY_SKIP_AUTH: '1', ...env }
    if (!env[NO_DELEGATION_ENV]) {
      delete childEnv[NO_DELEGATION_ENV]
    }
    return sandbox.run(process.execPath, [CLI_BIN, 'debug', 'parse-project'], {
      env: childEnv,
      extendEnv: false,
    }).catch(err => err)
  }

  it('loads the project when run from another checkly install', async () => {
    const result = await parseProjectWithOtherInstall()

    expect(result.stdout).toContain('"logicalId": "home"')
    expect(result.stdout).not.toContain('outside a Checkly CLI project')
  })

  it(`cannot load the project with ${NO_DELEGATION_ENV}=1`, async () => {
    const result = await parseProjectWithOtherInstall({ [NO_DELEGATION_ENV]: '1' })

    expect(result.stdout).toContain('Unable to create a construct \'ApiCheck\' outside a Checkly CLI project.')
  })
})
