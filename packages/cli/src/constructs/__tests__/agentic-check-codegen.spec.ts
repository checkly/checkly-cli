import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { AgenticCheckCodegen, AgenticCheckResource } from '../agentic-check-codegen'
import { Context } from '../internal/codegen/context'
import { Program } from '../../sourcegen'

interface RenderEnv {
  rootDirectory: string
  cleanup: () => Promise<void>
}

async function createRenderEnv (): Promise<RenderEnv> {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'agentic-codegen-'))
  return {
    rootDirectory,
    cleanup: () => rm(rootDirectory, { recursive: true, force: true }),
  }
}

async function renderResource (env: RenderEnv, resource: AgenticCheckResource): Promise<string> {
  const program = new Program({
    rootDirectory: env.rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })

  const codegen = new AgenticCheckCodegen(program)
  const context = new Context()

  codegen.gencode(resource.id, resource, context)

  await program.realize()

  // The codegen registers exactly one generated file per call. Read it back.
  const [filePath] = program.paths
  if (filePath === undefined) {
    throw new Error('AgenticCheckCodegen did not register any generated files')
  }

  return readFile(filePath, 'utf8')
}

const baseResource = (overrides: Partial<AgenticCheckResource> = {}): AgenticCheckResource => ({
  id: 'agentic-check',
  checkType: 'AGENTIC',
  name: 'Agentic Check',
  prompt: 'Verify the homepage loads.',
  ...overrides,
})

describe('AgenticCheckCodegen', () => {
  let env: RenderEnv

  beforeEach(async () => {
    env = await createRenderEnv()
  })

  afterEach(async () => {
    await env.cleanup()
  })

  describe('describe()', () => {
    it('should describe the resource by name', () => {
      const program = new Program({
        rootDirectory: env.rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      const codegen = new AgenticCheckCodegen(program)
      expect(codegen.describe(baseResource({ name: 'Homepage Check' })))
        .toEqual('Agentic Check: Homepage Check')
    })
  })

  describe('gencode()', () => {
    it('should emit a minimal AgenticCheck with just a prompt', async () => {
      const source = await renderResource(env, baseResource())

      expect(source).toContain('import { AgenticCheck } from \'checkly/constructs\'')
      expect(source).toContain('new AgenticCheck(\'agentic-check\'')
      expect(source).toContain('name: \'Agentic Check\'')
      expect(source).toContain('prompt: \'Verify the homepage loads.\'')
    })

    it('should emit `locations` when the backend returns them', async () => {
      const source = await renderResource(env, baseResource({
        locations: ['us-east-1', 'eu-west-1'],
      }))

      expect(source).toContain('locations: [')
      expect(source).toContain('\'us-east-1\'')
      expect(source).toContain('\'eu-west-1\'')
    })

    it('should not emit `retryStrategy`', async () => {
      // `AgenticCheckProps` omits `retryStrategy`, so generated code must
      // never include it — not even the default `RetryStrategyBuilder.noRetries()`
      // that other check types fall back to.
      const source = await renderResource(env, baseResource({
        retryStrategy: {
          type: 'FIXED',
          baseBackoffSeconds: 60,
          maxRetries: 2,
          maxDurationSeconds: 600,
          sameRegion: true,
        },
      }))

      expect(source).not.toContain('retryStrategy')
      expect(source).not.toContain('RetryStrategyBuilder')
    })

    it('should not emit `agentRuntime` when `agenticCheckData` is missing', async () => {
      const source = await renderResource(env, baseResource())
      expect(source).not.toContain('agentRuntime')
    })

    it('should not emit `agentRuntime` when `agenticCheckData` is null', async () => {
      const source = await renderResource(env, baseResource({ agenticCheckData: null }))
      expect(source).not.toContain('agentRuntime')
    })

    it('should not emit `agentRuntime` when skills are empty', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          skills: [],
        },
      }))
      expect(source).not.toContain('agentRuntime')
    })

    it('should emit `agentRuntime.skills` when skills are present', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          skills: ['addyosmani/web-quality-skills', 'cost-optimization'],
        },
      }))

      expect(source).toContain('agentRuntime: {')
      expect(source).toContain('skills: [')
      expect(source).toContain('\'addyosmani/web-quality-skills\'')
      expect(source).toContain('\'cost-optimization\'')
    })

    it('should drop empty skill names', async () => {
      // Defensive — the backend should never store empty strings, but if it
      // ever does we don't want them in generated code.
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          skills: ['addyosmani/web-quality-skills', ''],
        },
      }))

      expect(source).toContain('\'addyosmani/web-quality-skills\'')
      expect(source).not.toMatch(/skills:\s*\[[^\]]*''/m)
    })

    it('should never emit `assertionRules`', async () => {
      // Assertion rules are agent-generated and preserved server-side. The
      // construct does not accept them, so generated code must not surface
      // them even if the backend includes them in `agenticCheckData`.
      const dataWithAssertions = {
        skills: ['addyosmani/web-quality-skills'],
        assertionRules: [{ id: '1', expression: 'response.status === 200' }],
      }
      const source = await renderResource(env, baseResource({
        // assertionRules is intentionally absent from the typed shape; we
        // want to verify the codegen ignores extras when the backend hands
        // them over.
        agenticCheckData: dataWithAssertions as AgenticCheckResource['agenticCheckData'],
      }))

      expect(source).not.toContain('assertionRules')
    })

    it('should preserve common check fields emitted by buildCheckProps', async () => {
      const source = await renderResource(env, baseResource({
        activated: true,
        muted: true,
        tags: ['app:webshop'],
        frequency: 60,
      }))

      expect(source).toContain('activated: true')
      expect(source).toContain('muted: true')
      expect(source).toContain('\'app:webshop\'')
      expect(source).toContain('frequency: ')
    })
  })
})
