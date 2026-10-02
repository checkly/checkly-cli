import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { PlaywrightCheckCodegen, PlaywrightCheckResource, unfoldTestCommand } from '../playwright-check-codegen.js'
import { PREVIEW_ONLY_CHECK_TYPES } from '../check-codegen.js'
import { CheckGroupCodegen, CheckGroupResource } from '../check-group-codegen.js'
import { Context } from '../internal/codegen/context.js'
import { Session } from '../session.js'
import { Program } from '../../sourcegen/index.js'

/**
 * The construct generated for a Playwright check suite: the test command
 * unfolded into the props it was built from, the suite's own props, the
 * shared check props, and never the props a suite does not have.
 */

const DEFAULT_TEST_COMMAND = Session.packageManager.execCommand(['playwright', 'test']).unsafeDisplayCommand

let rootDirectory: string

beforeAll(async () => {
  rootDirectory = await mkdtemp(path.join(tmpdir(), 'playwright-check-codegen-'))
})

afterAll(async () => {
  await rm(rootDirectory, { recursive: true, force: true })
})

afterEach(() => {
  Session.reset()
})

async function render (
  resource: PlaywrightCheckResource,
  prepare?: (program: Program, context: Context) => void,
): Promise<string> {
  const program = new Program({
    rootDirectory: await mkdtemp(path.join(rootDirectory, 'render-')),
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const context = new Context()
  prepare?.(program, context)
  new PlaywrightCheckCodegen(program).gencode(resource.id, resource, context)
  await program.realize()
  const constructFile = program.paths.find(file => file.includes('playwright-check-suites') && file.endsWith('.check.ts'))
  if (constructFile === undefined) {
    throw new Error('PlaywrightCheckCodegen did not register a construct file')
  }
  return readFile(constructFile, 'utf8')
}

/** A suite as the API describes it, bundle keys included. */
const suite = (overrides: Partial<PlaywrightCheckResource> = {}): PlaywrightCheckResource => ({
  id: 'suite-uuid',
  checkType: 'PLAYWRIGHT',
  name: 'Checkout flows',
  activated: true,
  muted: false,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['e2e'],
  frequency: 10,
  testCommand: `${DEFAULT_TEST_COMMAND} --config playwright.config.ts`,
  installCommand: null,
  engine: null,
  engineVersion: null,
  ...({
    codeBundlePath: 'bundles/suite.tar.gz',
    cacheHash: 'abc123',
    playwrightVersion: '1.59.1',
    browsers: ['chromium'],
    workingDir: '.',
    doubleCheck: false,
  } as Partial<PlaywrightCheckResource>),
  ...overrides,
})

describe('unfoldTestCommand', () => {
  it('splits the CLI-built command into the user command and the props', () => {
    expect(unfoldTestCommand('npx playwright test --config playwright.config.ts')).toEqual({
      command: 'npx playwright test',
      playwrightConfigPath: 'playwright.config.ts',
    })
    expect(unfoldTestCommand(
      'pnpm exec playwright test --config \'e2e/pw config.ts\' --project chromium \'Mobile Safari\' --grep \'@smoke|@checkout\'',
    )).toEqual({
      command: 'pnpm exec playwright test',
      playwrightConfigPath: 'e2e/pw config.ts',
      pwProjects: ['chromium', 'Mobile Safari'],
      pwTags: ['@smoke', '@checkout'],
    })
  })

  it('never reads a bare flag-like word as a value', () => {
    // A project named `--config` cannot be told from a user's trailing flag,
    // so the trailing flag reading wins: the user's part ends with it.
    expect(unfoldTestCommand('npx playwright test --config user.ts --project --config real.ts')).toEqual({
      command: 'npx playwright test --config user.ts --project',
      playwrightConfigPath: 'real.ts',
    })
  })

  it('drops a backslash-newline as a line continuation', () => {
    expect(unfoldTestCommand('npx playwright test \\\n  --config a.ts')).toEqual({
      command: 'npx playwright test',
      playwrightConfigPath: 'a.ts',
    })
  })

  it('reads the quoting forms shellQuote produces and the usual hand-written ones', () => {
    expect(unfoldTestCommand('npx playwright test --config \'it\'"\'"\'s.config.ts\'').playwrightConfigPath).toBe('it\'s.config.ts')
    expect(unfoldTestCommand('npx playwright test --config "a \\"b\\".ts" --project a\\ b')).toEqual({
      command: 'npx playwright test',
      playwrightConfigPath: 'a "b".ts',
      pwProjects: ['a b'],
    })
    // A backslash in double quotes escapes only what the shell would expand.
    expect(unfoldTestCommand('npx playwright test --config "e2e\\config.ts"').playwrightConfigPath).toBe('e2e\\config.ts')
  })

  it('keeps the user command as written and takes the last --config word as the boundary', () => {
    expect(unfoldTestCommand('FOO="x  y" npx  playwright test --config a.ts --config b.ts')).toEqual({
      command: 'FOO="x  y" npx  playwright test --config a.ts',
      playwrightConfigPath: 'b.ts',
    })
    // A tag pattern containing the text is a word, not a boundary.
    expect(unfoldTestCommand('npx playwright test --config a.ts --grep \'--config\'')).toEqual({
      command: 'npx playwright test',
      playwrightConfigPath: 'a.ts',
      pwTags: ['--config'],
    })
  })

  it('returns a command it cannot unfold whole', () => {
    for (const command of [
      'npx playwright test',
      'npx playwright test --config',
      '--config a.ts',
      'npx playwright test --config a.ts --workers 2',
      'npx playwright test --config a.ts --project',
      'npx playwright test --config a.ts --grep a --grep b',
      'npx playwright test --config a.ts --project a --project b',
      'npx playwright test --config \'unterminated',
    ]) {
      expect(unfoldTestCommand(command), command).toEqual({ command })
    }
  })
})

describe('PlaywrightCheckCodegen', () => {
  it('is a preview-only codegen, which checkly import refuses', () => {
    expect(PREVIEW_ONLY_CHECK_TYPES.get('PLAYWRIGHT')).toMatch(/cannot be imported/)
  })

  it('describes the suite', () => {
    const codegen = new PlaywrightCheckCodegen(new Program({
      rootDirectory: '.',
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    }))
    expect(codegen.describe(suite())).toBe('Playwright Check Suite: Checkout flows')
  })

  it('renders the suite props from the test command and the shared check props', async () => {
    const source = await render(suite({
      testCommand: `${DEFAULT_TEST_COMMAND} --config 'e2e/pw config.ts' --project chromium firefox --grep '@smoke|@checkout'`,
      installCommand: 'pnpm install --frozen-lockfile',
      engine: 'node',
      engineVersion: '22',
      groupId: 7,
      runtimeId: '2025.04',
      environmentVariables: [{ key: 'BASE_URL', value: 'https://example.com', locked: false }],
    }), (program, context) => {
      const group: CheckGroupResource = { id: 7, name: 'Checkout', concurrency: 1, useGlobalAlertSettings: true, alertSettings: {} }
      new CheckGroupCodegen(program).prepare('checkout', group, context)
    })
    expect(source).toContain('import { Engine, Frequency, PlaywrightCheck } from \'checkly/constructs\'')
    expect(source).toContain('new PlaywrightCheck(\'suite-uuid\', {')
    expect(source).toContain('name: \'Checkout flows\'')
    expect(source).toContain('playwrightConfigPath: \'e2e/pw config.ts\'')
    expect(source).toContain('pwProjects: [\n    \'chromium\',\n    \'firefox\',\n  ]')
    expect(source).toContain('pwTags: [\n    \'@smoke\',\n    \'@checkout\',\n  ]')
    expect(source).toContain('installCommand: \'pnpm install --frozen-lockfile\'')
    expect(source).toContain('engine: Engine.node(\'22\')')
    expect(source).toContain('locations: [\n    \'us-east-1\',\n    \'eu-west-1\',\n  ]')
    expect(source).toContain('tags: [\n    \'e2e\',\n  ]')
    expect(source).toContain('frequency: Frequency.EVERY_10M')
    expect(source).toContain('group: checkoutGroup')
    expect(source).toContain('runtimeId: \'2025.04\'')
    expect(source).toContain('key: \'BASE_URL\'')
    // The package manager's own command is what the construct fills in.
    expect(source).not.toContain('testCommand')
  })

  it('never prints the props a suite does not have, nor the bundle', async () => {
    const source = await render(suite({
      ...({
        retryStrategy: { type: 'LINEAR', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true },
        doubleCheck: true,
        aiAutoRepairEnabled: true,
      } as Partial<PlaywrightCheckResource>),
    }))
    for (const prop of [
      'retryStrategy', 'RetryStrategyBuilder', 'doubleCheck', 'aiAutoRepairEnabled',
      'codeBundlePath', 'codeBundleSha256', 'cacheHash', 'playwrightVersion', 'browsers', 'workingDir',
    ]) {
      expect(source, prop).not.toContain(prop)
    }
  })

  it('prints a custom test command as the user wrote it', async () => {
    const source = await render(suite({ testCommand: 'yarn e2e  --reporter=line --config playwright.config.ts' }))
    expect(source).toContain('testCommand: \'yarn e2e  --reporter=line\'')
    expect(source).toContain('playwrightConfigPath: \'playwright.config.ts\'')
  })

  it('prints a command it cannot unfold whole, without a config path', async () => {
    const source = await render(suite({ testCommand: 'npx playwright test --workers 2' }))
    expect(source).toContain('testCommand: \'npx playwright test --workers 2\'')
    expect(source).not.toContain('playwrightConfigPath')
  })

  it('leaves out an engine without a version', async () => {
    const source = await render(suite({ engine: 'node', engineVersion: null }))
    expect(source).not.toContain('engine')
  })

  it('prints an engine the construct does not offer as a plain object', async () => {
    const source = await render(suite({ engine: 'deno', engineVersion: '2' }))
    expect(source).toContain('engine: {\n    name: \'deno\',\n    version: \'2\',\n  }')
    expect(source).not.toContain('Engine')
  })
})
