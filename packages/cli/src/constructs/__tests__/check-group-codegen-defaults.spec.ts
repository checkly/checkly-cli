import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CheckGroupCodegen, CheckGroupResource } from '../check-group-codegen.js'
import { Context } from '../internal/codegen/context.js'
import { Program } from '../../sourcegen/index.js'

/**
 * What the group codegen generates for the values a group row carries as
 * defaults; see `check-codegen-defaults.spec.ts` for the rule it follows.
 */

interface RenderEnv {
  rootDirectory: string
  cleanup: () => Promise<void>
}

async function createRenderEnv (): Promise<RenderEnv> {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'check-group-codegen-defaults-'))
  return {
    rootDirectory,
    cleanup: () => rm(rootDirectory, { recursive: true, force: true }),
  }
}

async function renderResource (env: RenderEnv, resource: CheckGroupResource): Promise<string> {
  const program = new Program({
    rootDirectory: env.rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const codegen = new CheckGroupCodegen(program)
  const context = new Context()
  codegen.prepare(`group-${resource.id}`, resource, context)
  codegen.gencode(`group-${resource.id}`, resource, context)
  await program.realize()
  const [filePath] = program.paths
  if (filePath === undefined) {
    throw new Error('CheckGroupCodegen did not register any generated files')
  }
  return readFile(filePath, 'utf8')
}

const baseResource = (overrides: Partial<CheckGroupResource> = {}): CheckGroupResource => ({
  id: 7,
  name: 'Website Group',
  ...overrides,
})

const RUN_BASED = { escalationType: 'RUN_BASED' as const, runBasedEscalation: { failedRunThreshold: 3 } }

/** The `locations` a generated construct sets, in order, or `undefined` when it sets none. */
function generatedLocations (source: string): string[] | undefined {
  const match = /(?<![A-Za-z])locations: \[([^\]]*)\]/.exec(source)
  if (match === null) {
    return
  }
  return [...match[1].matchAll(/'([^']*)'/g)].map(([, location]) => location)
}

describe('CheckGroupCodegen defaults', () => {
  let env: RenderEnv

  beforeEach(async () => {
    env = await createRenderEnv()
  })

  afterEach(async () => {
    await env.cleanup()
  })

  describe('alert escalation policy', () => {
    it('names the global policy when the group uses it', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: {}, useGlobalAlertSettings: true }))
      expect(source).toContain('alertEscalationPolicy: \'global\'')
    })

    // The column defaults to `{}`; a group flagged as owning a policy may
    // hold none, and generating nothing lets its checks keep their own.
    it('generates no policy for empty settings under a false flag', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: {}, useGlobalAlertSettings: false }))
      expect(source).not.toContain('alertEscalationPolicy')
    })

    it('generates the policy a group owns', async () => {
      const source = await renderResource(
        env,
        baseResource({ alertSettings: RUN_BASED, useGlobalAlertSettings: false }),
      )
      expect(source).toContain('alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(3)')
    })

    it('generates nothing under a null flag, which leaves checks their own policies', async () => {
      const source = await renderResource(env, baseResource({ alertSettings: RUN_BASED, useGlobalAlertSettings: null }))
      expect(source).not.toContain('alertEscalationPolicy')
    })
  })

  it('generates concurrency whenever the row carries it', async () => {
    expect(await renderResource(env, baseResource({ concurrency: 3 }))).toContain('concurrency: 3')
    expect(await renderResource(env, baseResource({ concurrency: 1 }))).toContain('concurrency: 1')
    expect(await renderResource(env, baseResource())).not.toContain('concurrency')
  })

  /** `checkly import` must not write a location the CLI rejects. */
  describe('retired locations', () => {
    it('leaves a retired location out and keeps the others in order', async () => {
      const source = await renderResource(env, baseResource({ locations: ['me-south-1', 'eu-central-1'] }))
      expect(generatedLocations(source)).toEqual(['eu-central-1'])
      expect(source).not.toContain('me-south-1')

      const between = await renderResource(env, baseResource({ locations: ['eu-west-1', 'me-south-1', 'us-east-1'] }))
      expect(generatedLocations(between)).toEqual(['eu-west-1', 'us-east-1'])
    })

    it('generates no locations when the group holds only retired ones, or none', async () => {
      const source = await renderResource(env, baseResource({ locations: ['me-south-1'] }))
      expect(generatedLocations(source)).toBeUndefined()
      expect(source).not.toContain('me-south-1')
      expect(generatedLocations(await renderResource(env, baseResource({ locations: [] })))).toBeUndefined()
    })
  })

  it('keeps an API check default basic auth credential with one empty field', async () => {
    const withUser = await renderResource(env, baseResource({ apiCheckDefaults: { basicAuth: { username: 'svc', password: '' } } }))
    expect(withUser).toContain('username: \'svc\'')
    const empty = await renderResource(env, baseResource({ apiCheckDefaults: { basicAuth: { username: '', password: '' } } }))
    expect(empty).not.toContain('basicAuth')
  })
})
