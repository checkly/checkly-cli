import path from 'node:path'

import * as uuid from 'uuid'
import config from 'config'
import { describe, expect, beforeAll, afterAll, test } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('trigger', () => {
  const executionId = uuid.v4()

  beforeAll(async () => {
    await runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'trigger-project'),
      env: { EXECUTION_ID: executionId },
    })
  })

  afterAll(async () => {
    await runChecklyCli({
      args: ['destroy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'trigger-project'),
      env: { EXECUTION_ID: executionId },
    })
  })

  test('Should run checks successfully', async () => {
    const secretEnv = uuid.v4()
    const result = await runChecklyCli({
      args: [
        'trigger',
        '-e',
        `SECRET_ENV=${secretEnv}`,
        '--verbose',
        '--tags',
        `production,backend,${executionId}`,
        '--tags',
        `production,frontend,${executionId}`,
      ],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })

    expect(result.stdout).toContain(secretEnv)
    expect(result.stdout).toContain('Prod Backend Check')
    expect(result.stdout).toContain('Prod Frontend Check')
    expect(result.stdout).not.toContain('Staging Backend Check')
    expect(result.status).toBe(0)
  })

  test('Should return code 1 when no checks match', async () => {
    const result = await runChecklyCli({
      args: [
        'trigger',
        '--tags',
        'no-checks-match-this-tag',
      ],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })

    expect(result.stdout).toContain('No matching checks were found.')
    expect(result.status).toBe(1)
  })

  test('Should return code 1 when no checks match and the fail-on-no-match flag is set', async () => {
    const result = await runChecklyCli({
      args: [
        'trigger',
        '--tags',
        'no-checks-match-this-tag',
        '--fail-on-no-matching',
      ],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })

    expect(result.stdout).toContain('No matching checks were found.')
    expect(result.status).toBe(1)
  })

  test('Should return code - when no checks match and the no-fail-on-no-match flag is set', async () => {
    const result = await runChecklyCli({
      args: [
        'trigger',
        '--tags',
        'no-checks-match-this-tag',
        '--no-fail-on-no-matching',
      ],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })

    expect(result.stdout).toContain('No matching checks were found.')
    expect(result.status).toBe(0)
  })
})
