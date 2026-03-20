import path from 'node:path'

import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { FixtureSandbox } from '../../testing/fixture-sandbox'
import { ParseProjectOutput } from '../../commands/debug/parse-project'

async function parseProject (fixt: FixtureSandbox, ...args: string[]): Promise<ParseProjectOutput> {
  const result = await fixt.run('npx', [
    'checkly',
    'debug',
    'parse-project',
    ...args,
  ])

  if (result.exitCode !== 0) {
    // eslint-disable-next-line no-console
    console.error('stderr', result.stderr)
    // eslint-disable-next-line no-console
    console.error('stdout', result.stdout)
  }

  expect(result.exitCode).toBe(0)

  const output: ParseProjectOutput = JSON.parse(result.stdout)

  return output
}

const DEFAULT_TEST_TIMEOUT = 30_000

describe('AgenticCheck', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'agentic-check'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should create a basic agentic check with prompt', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-basic/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'homepage-health',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              checkType: 'AGENTIC',
              name: 'Homepage Health Check',
              prompt: 'Navigate to https://example.com and verify the page loads correctly.',
              activated: true,
              frequency: 30,
              locations: ['us-east-1', 'eu-west-1'],
              runParallel: true,
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should apply default check settings', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-check-defaults/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'check-should-have-defaults',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              tags: ['default tags'],
            }),
          }),
          expect.objectContaining({
            logicalId: 'check-should-not-have-defaults',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              tags: ['not default tags'],
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should support setting groups with `group`', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-group-mapping/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'test-group',
            type: 'check-group',
            member: true,
          }),
          expect.objectContaining({
            logicalId: 'check',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              groupId: {
                ref: 'test-group',
              },
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should fail validation when prompt is empty', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-validation-missing-prompt/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: true,
        observations: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('"prompt" is required'),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should fail validation when prompt exceeds 10000 characters', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-validation-prompt-too-long/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: true,
        observations: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('"prompt" must be at most 10000 characters'),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should fail validation when frequency is less than 30', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-validation-frequency-too-low/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: true,
        observations: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('"frequency" must be at least 30'),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)
})
