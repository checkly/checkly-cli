import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AgenticCheckCodegen, AgenticCheckResource } from '../agentic-check-codegen.js'
import { ApiCheckCodegen, ApiCheckResource } from '../api-check-codegen.js'
import { projectDefaultsFor } from '../check-codegen.js'
import { Context } from '../internal/codegen/context.js'
import { EmailAlertChannel } from '../email-alert-channel.js'
import { PrivateLocation } from '../private-location.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { TcpMonitorCodegen, TcpMonitorResource } from '../tcp-monitor-codegen.js'
import { UrlMonitorCodegen, UrlMonitorResource } from '../url-monitor-codegen.js'
import { Codegen } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

/**
 * What `buildCheckProps` generates for the values a check row carries as
 * defaults: the codegen serves `checkly import` and the deploy preview, so a
 * value it skips must be one the construct fills in by itself, and a value it
 * cannot express must never throw.
 */

interface RenderEnv {
  rootDirectory: string
  cleanup: () => Promise<void>
}

async function createRenderEnv (): Promise<RenderEnv> {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'check-codegen-defaults-'))
  return {
    rootDirectory,
    cleanup: () => rm(rootDirectory, { recursive: true, force: true }),
  }
}

async function renderWith<T extends { id: string }> (
  env: RenderEnv,
  makeCodegen: (program: Program) => Codegen<T>,
  resource: T,
): Promise<string> {
  const program = new Program({
    rootDirectory: env.rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  makeCodegen(program).gencode(resource.id, resource, new Context())
  await program.realize()
  const [filePath] = program.paths
  if (filePath === undefined) {
    throw new Error('Codegen did not register any generated files')
  }
  return readFile(filePath, 'utf8')
}

const renderResource = (env: RenderEnv, resource: ApiCheckResource): Promise<string> =>
  renderWith(env, program => new ApiCheckCodegen(program), resource)

const baseResource = (overrides: Partial<ApiCheckResource> = {}): ApiCheckResource => ({
  id: 'api-check',
  checkType: 'API',
  name: 'API Check',
  request: { url: 'https://example.com/health', method: 'GET' },
  ...overrides,
})

const RUN_BASED = { escalationType: 'RUN_BASED' as const, runBasedEscalation: { failedRunThreshold: 3 } }

describe('buildCheckProps defaults', () => {
  let env: RenderEnv

  beforeEach(async () => {
    env = await createRenderEnv()
  })

  afterEach(async () => {
    await env.cleanup()
    Session.reset()
  })

  beforeEach(() => {
    Session.project = new Project('proj', { name: 'Project' })
  })

  describe('alert escalation policy', () => {
    // The column defaults to `{}`, which every check deployed on the global
    // policy carries; it must generate nothing rather than throw.
    it('generates no policy for the empty settings of a check on the global policy', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: {}, useGlobalAlertSettings: true }))
      expect(source).not.toContain('alertEscalationPolicy')
      expect(source).not.toContain('AlertEscalationBuilder')
    })

    it('generates no policy for empty settings even when the flag claims a policy of its own', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: {}, useGlobalAlertSettings: false }))
      expect(source).not.toContain('alertEscalationPolicy')
    })

    it('generates the policy a check owns', async () => {
      const source = await renderResource(
        env,
        baseResource({ alertSettings: RUN_BASED, useGlobalAlertSettings: false }),
      )
      expect(source).toContain('alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(3)')
    })

    it('generates no policy for a check on the global policy that still stores its last one', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: RUN_BASED, useGlobalAlertSettings: true }))
      expect(source).not.toContain('alertEscalationPolicy')
    })

    it('generates the policy when the flag is absent, as older responses report it', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: RUN_BASED }))
      expect(source).toContain('runBasedEscalation(3)')
    })

    it('generates nothing for null settings', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: null, useGlobalAlertSettings: false }))
      expect(source).not.toContain('alertEscalationPolicy')
    })
  })

  describe('props the construct fills in from the project config', () => {
    it('leaves out the backend defaults when the project sets none', async () => {
      const source = await renderResource(env, baseResource({
        activated: true, muted: false, shouldFail: false, tags: [], locations: [],
      }))
      expect(source).not.toContain('activated')
      expect(source).not.toContain('muted')
      expect(source).not.toContain('shouldFail')
      expect(source).not.toContain('tags')
      expect(source).not.toContain('locations')
    })

    it('generates a value that differs from the backend default', async () => {
      const source = await renderResource(env, baseResource({
        activated: false, muted: true, shouldFail: true, tags: ['prod'], locations: ['eu-west-1'],
      }))
      expect(source).toContain('activated: false')
      expect(source).toContain('muted: true')
      expect(source).toContain('shouldFail: true')
      expect(source).toContain('\'prod\'')
      expect(source).toContain('\'eu-west-1\'')
    })

    // With a project default in force, omitting the prop would hand the
    // check that default, so the row's own value is spelled out.
    it('generates the backend default explicitly when the project default differs', async () => {
      Session.checkDefaults = { muted: true, tags: ['prod'], locations: ['eu-west-1'], activated: false }
      const source = await renderResource(env, baseResource({
        activated: true, muted: false, tags: [], locations: [],
      }))
      expect(source).toContain('activated: true')
      expect(source).toContain('muted: false')
      expect(source).toContain('tags: []')
      expect(source).toContain('locations: []')
    })

    it('leaves out a value the project default reproduces', async () => {
      Session.checkDefaults = { muted: true, tags: ['prod'] }
      const source = await renderResource(env, baseResource({ muted: true, tags: ['prod'] }))
      expect(source).not.toContain('muted')
      expect(source).not.toContain('tags')
    })

    it('generates a list that differs from the project default in order', async () => {
      Session.checkDefaults = { tags: ['a', 'b'] }
      const source = await renderResource(env, baseResource({ tags: ['b', 'a'] }))
      expect(source).toContain('tags: [')
    })

    it('resolves the browser and multi-step sections before the shared one', () => {
      Session.checkDefaults = { activated: true, muted: true }
      Session.browserCheckDefaults = { activated: false }
      Session.multiStepCheckDefaults = { muted: false }
      const browser = projectDefaultsFor('BROWSER')
      expect([browser('activated'), browser('muted')]).toEqual([false, true])
      const multiStep = projectDefaultsFor('MULTI_STEP')
      expect([multiStep('activated'), multiStep('muted')]).toEqual([true, false])
      const api = projectDefaultsFor('API')
      expect([api('activated'), api('muted')]).toEqual([true, true])
    })

    it('generates an agentic check\'s empty locations, which the construct would fill with its own region', async () => {
      const agentic = (overrides: Partial<AgenticCheckResource> = {}): AgenticCheckResource => ({
        id: 'agentic',
        checkType: 'AGENTIC',
        name: 'Agentic',
        prompt: 'Verify the homepage loads.',
        ...overrides,
      })
      const render = (resource: AgenticCheckResource) =>
        renderWith(env, program => new AgenticCheckCodegen(program), resource)
      expect(await render(agentic({ locations: [] }))).toContain('locations: []')
      expect(await render(agentic({ locations: ['us-east-1'] }))).not.toContain('locations')
      Session.checkDefaults = { locations: ['eu-west-1'] }
      expect(await render(agentic({ locations: ['us-east-1'] }))).toContain('\'us-east-1\'')
    })
  })

  describe('lists the project config can fill', () => {
    it('leaves out empty relations and variables when the project sets none', async () => {
      const source = await renderResource(env, baseResource({ environmentVariables: [] }))
      expect(source).not.toContain('alertChannels')
      expect(source).not.toContain('privateLocations')
      expect(source).not.toContain('environmentVariables')
    })

    it('spells out empty relations and variables when the project default would fill them', async () => {
      Session.checkDefaults = {
        alertChannels: [new EmailAlertChannel('email', { address: 'ops@example.com' })],
        privateLocations: [new PrivateLocation('pl', { name: 'Office', slugName: 'office' })],
        environmentVariables: [{ key: 'REGION', value: 'eu' }],
      }
      const source = await renderResource(env, baseResource({ environmentVariables: [] }))
      expect(source).toContain('alertChannels: []')
      expect(source).toContain('privateLocations: []')
      expect(source).toContain('environmentVariables: []')
    })

    it('never generates the props an agentic check omits, whatever the row or the project sets', async () => {
      Session.checkDefaults = {
        shouldFail: true,
        privateLocations: [new PrivateLocation('pl', { name: 'Office', slugName: 'office' })],
      }
      const source = await renderWith(env, program => new AgenticCheckCodegen(program), {
        id: 'agentic', checkType: 'AGENTIC', name: 'Agentic', prompt: 'Verify.', shouldFail: false, runParallel: true,
      })
      expect(source).not.toContain('shouldFail')
      expect(source).not.toContain('privateLocations')
      expect(source).not.toContain('runParallel')
    })
  })

  describe('request values', () => {
    it('keeps a basic auth credential with one empty field', async () => {
      const source = await renderResource(env, baseResource({
        request: { url: 'https://example.com', method: 'GET', basicAuth: { username: 'svc', password: '' } },
      }))
      expect(source).toContain('username: \'svc\'')
      expect(source).toContain('password: \'\'')
    })

    it('leaves out the empty basic auth pair', async () => {
      const source = await renderResource(env, baseResource({
        request: { url: 'https://example.com', method: 'GET', basicAuth: { username: '', password: '' } },
      }))
      expect(source).not.toContain('basicAuth')
    })

    it('leaves out the IPv4 default on URL and TCP monitors like the other request codegens', async () => {
      const url: UrlMonitorResource = { id: 'u', checkType: 'URL', name: 'U', request: { url: 'https://example.com', ipFamily: 'IPv4' } }
      const tcp: TcpMonitorResource = { id: 't', checkType: 'TCP', name: 'T', request: { hostname: 'example.com', port: 443, ipFamily: 'IPv6' } }
      expect(await renderWith(env, program => new UrlMonitorCodegen(program), url)).not.toContain('ipFamily')
      expect(await renderWith(env, program => new TcpMonitorCodegen(program), tcp)).toContain('ipFamily: \'IPv6\'')
    })
  })
})
