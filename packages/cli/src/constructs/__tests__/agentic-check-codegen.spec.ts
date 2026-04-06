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

    it('should not emit `locations` even when the backend returns one', async () => {
      // The backend forces a single location for agentic checks today and
      // the construct hardcodes it. Surfacing it in generated code would
      // break type-checking against `AgenticCheckProps`.
      const source = await renderResource(env, baseResource({
        locations: ['us-east-1'],
      }))

      expect(source).not.toContain('locations')
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

    it('should not emit `agentRuntime` when skills and env vars are both empty', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          skills: [],
          selectedEnvironmentVariables: [],
        },
      }))
      expect(source).not.toContain('agentRuntime')
    })

    it('should emit `agentRuntime.skills` when skills are present', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          skills: ['checkly/playwright-skill', 'checkly/http-skill'],
        },
      }))

      expect(source).toContain('agentRuntime: {')
      expect(source).toContain('skills: [')
      expect(source).toContain('\'checkly/playwright-skill\'')
      expect(source).toContain('\'checkly/http-skill\'')
      // No empty environmentVariables when none are selected.
      expect(source).not.toContain('environmentVariables')
    })

    it('should drop empty skill names', async () => {
      // Defensive — the backend should never store empty strings, but if it
      // ever does we don't want them in generated code.
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          skills: ['checkly/playwright-skill', ''],
        },
      }))

      expect(source).toContain('\'checkly/playwright-skill\'')
      expect(source).not.toMatch(/skills:\s*\[[^\]]*''/m)
    })

    it('should emit `agentRuntime.environmentVariables` for bare-string entries', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          selectedEnvironmentVariables: ['ENVIRONMENT_URL', 'API_KEY'],
        },
      }))

      expect(source).toContain('environmentVariables: [')
      expect(source).toContain('\'ENVIRONMENT_URL\'')
      expect(source).toContain('\'API_KEY\'')
      // Bare strings should not be expanded into objects. The only `name:`
      // we expect in the file is the top-level `name: 'Agentic Check'`.
      expect((source.match(/name:/g) ?? []).length).toEqual(1)
    })

    it('should reverse-translate `key` into `name` for object-form entries', async () => {
      // The backend stores selected env vars as `{ key, description? }` but
      // the construct exposes `{ name, description? }`. The codegen has to
      // translate on the way out so the generated file matches the construct
      // type.
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          selectedEnvironmentVariables: [
            { key: 'TEST_USER_EMAIL', description: 'Login email for the test account' },
          ],
        },
      }))

      expect(source).toContain('name: \'TEST_USER_EMAIL\'')
      expect(source).toContain('description: \'Login email for the test account\'')
      expect(source).not.toContain('key:')
    })

    it('should omit `description` when not provided on object-form entries', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          selectedEnvironmentVariables: [
            { key: 'PLAIN_KEY' },
          ],
        },
      }))

      expect(source).toContain('name: \'PLAIN_KEY\'')
      expect(source).not.toContain('description')
    })

    it('should support a mix of bare-string and object-form env vars', async () => {
      const source = await renderResource(env, baseResource({
        agenticCheckData: {
          selectedEnvironmentVariables: [
            'ENVIRONMENT_URL',
            { key: 'TEST_USER_EMAIL', description: 'Login email' },
          ],
        },
      }))

      expect(source).toContain('\'ENVIRONMENT_URL\'')
      expect(source).toContain('name: \'TEST_USER_EMAIL\'')
      expect(source).toContain('description: \'Login email\'')
    })

    it('should never emit `assertionRules`', async () => {
      // Assertion rules are agent-generated and preserved server-side. The
      // construct does not accept them, so generated code must not surface
      // them even if the backend includes them in `agenticCheckData`.
      const dataWithAssertions = {
        skills: ['checkly/playwright-skill'],
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
