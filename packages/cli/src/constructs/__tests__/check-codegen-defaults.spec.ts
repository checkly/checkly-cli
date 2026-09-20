import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheckCodegen, ApiCheckResource } from '../api-check-codegen.js'
import { Context } from '../internal/codegen/context.js'
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

async function renderResource (env: RenderEnv, resource: ApiCheckResource): Promise<string> {
  const program = new Program({
    rootDirectory: env.rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const codegen = new ApiCheckCodegen(program)
  codegen.gencode(resource.id, resource, new Context())
  await program.realize()
  const [filePath] = program.paths
  if (filePath === undefined) {
    throw new Error('ApiCheckCodegen did not register any generated files')
  }
  return readFile(filePath, 'utf8')
}

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
})
