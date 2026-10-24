import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Config, Flags, Parser } from '@oclif/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { FixtureSandbox } from '../../testing/fixture-sandbox.js'
import {
  booleanShortFlags,
  childNodeOptions,
  findConfigFlag,
  findProjectCli,
  findProjectCliHandOff,
  NO_DELEGATION_ENV,
} from '../project-cli.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..')
const CLI_BIN = path.join(CLI_PACKAGE_ROOT, 'bin', 'run.cjs')
// The notice shows the install's path with the platform's separators.
const nodeModulesCheckly = path.join('node_modules', 'checkly')

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

// This package, as the invoked CLI.
const self = { root: CLI_PACKAGE_ROOT, version: '10.0.0' }

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

describe('findConfigFlag', () => {
  const cases: Array<[string[], string | undefined]> = [
    [['--config', 'a.ts'], 'a.ts'],
    [['--config=a.ts'], 'a.ts'],
    [['-c', 'a.ts'], 'a.ts'],
    [['-c=a.ts'], 'a.ts'],
    [['-ca.ts'], 'a.ts'],
    [['-pc', 'a.ts'], 'a.ts'],
    [['-poca.ts'], 'a.ts'],
    [['-pc=a.ts'], 'a.ts'],
    [['-vp', '-c', 'a.ts'], 'a.ts'],
    [['-gca.ts'], undefined],
    [['test', 'home', '--grep', 'x', '-c', 'a.ts'], 'a.ts'],
    [['--config', 'a.ts', '--config', 'b.ts'], 'a.ts'],
    [['--', '--config', 'a.ts'], undefined],
    [['--configure', 'a.ts'], undefined],
    [['--config'], undefined],
    [['--config='], undefined],
    [[], undefined],
  ]

  it.each(cases)('reads %j', (args, expected) => {
    expect(findConfigFlag(args)).toBe(expected)
  })

  it('reads the value oclif parses', async () => {
    for (const [args, expected] of cases) {
      const { flags } = await Parser.parse(args, {
        flags: {
          config: Flags.string({ char: 'c' }),
          grep: Flags.string({ char: 'g' }),
          preview: Flags.boolean({ char: 'p' }),
          output: Flags.boolean({ char: 'o' }),
          verbose: Flags.boolean({ char: 'v' }),
        },
        args: {},
        strict: false,
      }).catch(() => ({ flags: { config: undefined } }))
      // oclif rejects a repeated flag; reading the first one is enough. An
      // empty value means the working directory either way.
      if (flags.config !== undefined || expected === undefined) {
        expect(flags.config || undefined).toBe(expected)
      }
    }
  })

  describe('matches every command', () => {
    let config: Config

    beforeAll(async () => {
      config = await Config.load(CLI_PACKAGE_ROOT)
    })

    it('-c is always the config file', () => {
      const shortC = config.commands.flatMap(command =>
        Object.entries(command.flags)
          .filter(([, flag]) => flag.char === 'c')
          .map(([name]) => `${command.id} --${name}`))

      expect(shortC.length).toBeGreaterThan(0)
      for (const flag of shortC) {
        // Other checkly installs rely on this to find the project.
        expect(flag).toMatch(/ --config$/)
      }
    })

    it('booleanShortFlags are exactly the boolean short flags of commands with -c', () => {
      const booleans = new Set<string>()
      const values = new Set<string>()
      for (const command of config.commands) {
        if (command.flags.config?.char !== 'c') {
          continue
        }
        for (const flag of Object.values(command.flags)) {
          if (flag.char && flag.char !== 'c') {
            (flag.type === 'boolean' ? booleans : values).add(flag.char)
          }
        }
      }

      expect([...booleans].sort()).toEqual([...booleanShortFlags].sort())
      // A letter that takes a value on one of these commands would end a
      // group there, which the scan cannot tell apart.
      expect([...values].filter(char => booleanShortFlags.has(char))).toEqual([])
    })
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
  it('hands off to a different install', async () => {
    const dir = await writeFakeInstall(tempDir)

    expect((await findProjectCliHandOff(self, tempDir))?.dir).toBe(dir)
  })

  it('keeps the command when the project resolves to this very install', async () => {
    const dir = await writeFakeInstall(tempDir)
    // Through a symlink, as with pnpm's node_modules layout.
    const link = path.join(tempDir, 'link')
    await fs.symlink(dir, link, 'dir')

    expect(await findProjectCliHandOff({ root: link, version: '10.0.0' }, tempDir)).toBeUndefined()
  })

  it('keeps the command without a project install', async () => {
    expect(await findProjectCliHandOff(self, tempDir)).toBeUndefined()
  })

  it('does not hand off again to the install a hand-off started', async () => {
    const dir = await writeFakeInstall(tempDir)
    try {
      process.env.CHECKLY_HANDED_OFF_TO = dir
      expect(await findProjectCliHandOff(self, tempDir)).toBeUndefined()

      // A checkly started for another project still hands off.
      process.env.CHECKLY_HANDED_OFF_TO = path.join(tempDir, 'elsewhere')
      expect((await findProjectCliHandOff(self, tempDir))?.dir).toBe(dir)
    } finally {
      delete process.env.CHECKLY_HANDED_OFF_TO
    }
  })

  it(`is disabled by ${NO_DELEGATION_ENV}=1`, async () => {
    await writeFakeInstall(tempDir)
    process.env[NO_DELEGATION_ENV] = '1'

    expect(await findProjectCliHandOff(self, tempDir)).toBeUndefined()
  })
})

// These run the real launcher, so they need a built dist/. Each hand-off case
// asserts on the fake install's marker, so it cannot pass by running the
// command in-process.
describe('launcher hand-off', () => {
  interface RunCliOptions {
    cwd?: string
    env?: Record<string, string>
    onStdout?: (stdout: string, child: ReturnType<typeof spawn>) => void
  }

  function runCli (args: string[], options: RunCliOptions = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env, CHECKLY_SKIP_AUTH: '1', ...options.env }
    delete env[NO_DELEGATION_ENV]
    if (options.env?.[NO_DELEGATION_ENV]) {
      env[NO_DELEGATION_ENV] = options.env[NO_DELEGATION_ENV]
    }
    const child = spawn(process.execPath, [CLI_BIN, ...args], { cwd: options.cwd ?? tempDir, env })
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
      `Using checkly 1.2.3 from this project (${nodeModulesCheckly}) instead of checkly 0.0.1-dev.\n`,
    )
  })

  it('suggests installing the invoked version when the project install is older', async () => {
    await writeFakeInstall(tempDir, { version: '0.0.0' })

    const result = await runCli(['test'])

    expect(report(result.stdout)?.marker).toBe('fake-project-cli')
    expect(result.stderr).toContain(
      `Using checkly 0.0.0 from this project (${nodeModulesCheckly}) instead of checkly 0.0.1-dev. `
      + 'To use 0.0.1-dev, install it in this project.',
    )
  })

  it('says nothing when the project install is the same version', async () => {
    await writeFakeInstall(tempDir, { version: '0.0.1-dev' })

    const result = await runCli(['test'])

    expect(report(result.stdout)?.marker).toBe('fake-project-cli')
    expect(result.stderr).not.toContain('Using checkly')
  })

  it('hands off every invocation, from subdirectories too', async () => {
    await writeFakeInstall(tempDir)
    const nested = path.join(tempDir, 'checks')
    await fs.mkdir(nested)

    for (const args of [['whoami'], ['--version'], ['test', '--help'], []]) {
      expect(report((await runCli(args)).stdout)?.argv).toEqual(args)
    }
    expect(report((await runCli(['deploy'], { cwd: nested })).stdout)?.argv).toEqual(['deploy'])
  })

  it('looks for the install from the directory of --config', async () => {
    const otherProject = path.join(tempDir, 'packages', 'checks')
    await fs.mkdir(otherProject, { recursive: true })
    const dir = await writeFakeInstall(otherProject)

    const result = await runCli(['deploy', '-c', 'packages/checks/checkly.config.ts'])

    expect(report(result.stdout)).toMatchObject({ handedOffTo: dir })
  })

  it(`runs the command itself with ${NO_DELEGATION_ENV}=1`, async () => {
    await writeFakeInstall(tempDir)

    const result = await runCli(['--version'], { env: { [NO_DELEGATION_ENV]: '1' } })

    expect(report(result.stdout)).toBeUndefined()
    expect(result.stdout).toContain('checkly/0.0.1-dev')
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
    // Both installs explain it, so it must only be said once.
    expect(result.stdout.split('Constructs only register with the checkly install').length).toBe(2)
    expect(result.stdout).toContain(`${NO_DELEGATION_ENV}=1 is set`)
  })
})
