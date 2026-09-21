import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AgenticCheckCodegen, AgenticCheckResource } from '../agentic-check-codegen.js'
import { ApiCheckCodegen, ApiCheckResource } from '../api-check-codegen.js'
import { CheckGroupCodegen, CheckGroupResource } from '../check-group-codegen.js'
import { IncidentioAlertChannelCodegen, IncidentioAlertChannelResource } from '../incidentio-alert-channel-codegen.js'
import { PlaywrightCheckCodegen, PlaywrightCheckResource } from '../playwright-check-codegen.js'
import { Context, MASKED_VALUE } from '../internal/codegen/index.js'
import { Session } from '../session.js'
import { Program } from '../../sourcegen/index.js'

/**
 * The generated constructs must type-check against the constructs they
 * import, not only read as expected text: a codegen that spells a value the
 * construct cannot take (a private constructor, a prop of the wrong shape)
 * produces a file `checkly import` writes and `checkly deploy` then refuses.
 * The cases below are the edge values the codegens' default handling covers;
 * they are generated into one directory and checked in one TypeScript program
 * with `checkly/constructs` resolved to this package's sources, and only
 * diagnostics inside the generated files count. Resolving to the sources
 * keeps the spec free of a build step; a symbol missing from the built
 * package's entry or failing declaration emit is not caught here.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

describe('generated code compiles', () => {
  let rootDirectory: string

  beforeAll(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'generated-code-compiles-'))
  })

  afterAll(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
    Session.reset()
  })

  it('type-checks the generated constructs for the edge values the codegen defaults cover', async () => {
    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const context = new Context({ maskedValues: new Set([MASKED_VALUE]) })

    const apiCheck: ApiCheckResource = {
      id: 'api',
      checkType: 'API',
      name: 'Custom schedule and retries',
      request: { url: 'https://example.com', method: 'GET', basicAuth: { username: 'svc', password: '' } },
      frequency: 7,
      frequencyOffset: 23,
      retryStrategy: { type: 'LINEAR', baseBackoffSeconds: 0, maxRetries: 2, maxDurationSeconds: 0, sameRegion: false },
      alertSettings: {},
      useGlobalAlertSettings: true,
      activated: false,
      tags: [],
    }
    const subMinute: ApiCheckResource = {
      id: 'sub-minute',
      checkType: 'API',
      name: 'Odd offset',
      request: { url: 'https://example.com', method: 'GET' },
      frequency: 0,
      frequencyOffset: 15,
    }
    // A project default the agentic construct's props cannot take must not
    // make its way into the generated file.
    Session.checkDefaults = { shouldFail: true }
    const agentic: AgenticCheckResource = {
      id: 'agentic',
      checkType: 'AGENTIC',
      name: 'Agentic',
      prompt: 'Verify the homepage loads.',
      locations: [],
      shouldFail: false,
    }
    // A Playwright suite's props are unfolded from its test command; the
    // engine is spelled as the construct's own `Engine` for the engines it
    // offers and as a plain object otherwise. A command that cannot be
    // unfolded leaves the required `playwrightConfigPath` out and is not
    // expected to compile, so it is not part of this program.
    const suite: PlaywrightCheckResource = {
      id: 'suite',
      checkType: 'PLAYWRIGHT',
      name: 'Suite',
      testCommand: 'npx playwright test --config playwright.config.ts --project chromium --grep \'@smoke|@checkout\'',
      installCommand: 'npm ci',
      engine: 'node',
      engineVersion: '22',
      locations: ['us-east-1'],
      tags: ['e2e'],
      frequency: 10,
    }
    const suiteOnUnknownEngine: PlaywrightCheckResource = {
      id: 'suite-deno',
      checkType: 'PLAYWRIGHT',
      name: 'Suite on Deno',
      testCommand: 'deno task e2e --config playwright.config.ts',
      engine: 'deno',
      engineVersion: '2',
    }
    const group: CheckGroupResource = {
      id: 7,
      name: 'Group',
      concurrency: 1,
      useGlobalAlertSettings: false,
      alertSettings: {},
      apiCheckDefaults: { basicAuth: { username: '', password: 'p' } },
    }
    const channel: IncidentioAlertChannelResource = {
      id: 9,
      type: 'WEBHOOK',
      config: {
        name: 'Incidents',
        webhookType: 'WEBHOOK_INCIDENTIO',
        url: MASKED_VALUE,
        method: 'POST',
        headers: [{ key: 'authorization', value: MASKED_VALUE, locked: false }],
        queryParameters: [],
        webhookSecret: MASKED_VALUE,
      },
      sendRecovery: true,
      sendFailure: true,
      sendDegraded: false,
      sslExpiry: false,
      sslExpiryThreshold: 30,
    }

    const groupCodegen = new CheckGroupCodegen(program)
    groupCodegen.prepare('group', group, context)
    const channelCodegen = new IncidentioAlertChannelCodegen(program)
    channelCodegen.prepare('incidents', channel, context)
    new ApiCheckCodegen(program).gencode('api', apiCheck, context)
    new ApiCheckCodegen(program).gencode('sub-minute', subMinute, context)
    new AgenticCheckCodegen(program).gencode('agentic', agentic, context)
    new PlaywrightCheckCodegen(program).gencode('suite', suite, context)
    new PlaywrightCheckCodegen(program).gencode('suite-deno', suiteOnUnknownEngine, context)
    groupCodegen.gencode('group', group, context)
    channelCodegen.gencode('incidents', channel, context)
    await program.realize()

    const generated = program.paths.filter(file => file.endsWith('.ts'))
    expect(generated.length).toBeGreaterThanOrEqual(7)
    // TypeScript reports file names with forward slashes on every platform.
    const generatedNames = new Set(generated.map(file => file.replaceAll('\\', '/')))

    const compiler = ts.createProgram(generated, {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      // An import a generated file does not use is a defect too: a project
      // that lints or type-checks for unused locals refuses the file.
      noUnusedLocals: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['node'],
      typeRoots: [path.join(packageRoot, 'node_modules/@types')],
      paths: { 'checkly/constructs': [path.join(packageRoot, 'src/constructs/index.ts')] },
    })
    const ownDiagnostics = ts.getPreEmitDiagnostics(compiler)
      .filter(diagnostic => diagnostic.file !== undefined && generatedNames.has(diagnostic.file.fileName))
      .map(diagnostic => {
        const file = diagnostic.file as ts.SourceFile
        const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
        return `${path.relative(rootDirectory, file.fileName)}:${line + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
      })
    expect(ownDiagnostics).toEqual([])
  }, 120_000)
})
