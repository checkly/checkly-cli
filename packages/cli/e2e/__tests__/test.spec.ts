import path from 'node:path'
import fs from 'node:fs'

import * as uuid from 'uuid'
import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { FixtureSandbox, RunOptions } from '../../src/testing/fixture-sandbox'
import { ExecaError } from 'execa'

async function runTest (fixt: FixtureSandbox, args: string[], options?: RunOptions) {
  const result = await fixt.run('npx', [
    'checkly',
    'test',
    ...args,
  ], {
    timeout: 120_000,
    ...options,
    env: {
      CHECKLY_CLI_VERSION: '4.8.0',
      ...options?.env,
    },
  })

  if (result.exitCode !== 0) {
    // eslint-disable-next-line no-console
    console.error('stderr', result.stderr)
    // eslint-disable-next-line no-console
    console.error('stdout', result.stdout)
  }

  expect(result.exitCode).toBe(0)

  return result
}

describe('test', { timeout: 45000 }, () => {
  describe('test-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-project'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Test project should run successfully', async () => {
      const secretEnv = uuid.v4()
      const result = await runTest(fixt, ['-e', `SECRET_ENV=${secretEnv}`, '--verbose'])
      expect(result.stdout).not.toContain('File extension type example')
      expect(result.stdout).toContain(secretEnv)
    }, 130_000)

    it('Should include only one check', async () => {
      const result = await runTest(fixt, ['secret.check.ts'])
      expect(result.stdout).toContain('Show SECRET_ENV value')
      expect(result.stdout).toContain('1 passed, 1 total')
    })

    it('Should use different config file', async () => {
      const result = await runTest(fixt, ['secret.check.ts', '--config', 'checkly.staging.config.ts'])
      expect(result.stdout).toContain('Show SECRET_ENV value')
      expect(result.stdout).toContain('1 passed, 1 total')
    })

    it('Should fail with config file not found', async () => {
      expect.assertions(1)
      try {
        await runTest(fixt, ['secret.check.ts', '--config', 'checkly.notfound.config.ts'])
      } catch (err) {
        if (err instanceof ExecaError) {
          expect(err.exitCode).toBe(1)
        } else {
          throw err
        }
      }
    })

    it('Should terminate when no checks are found', async () => {
      const result = await runTest(fixt, ['does-not-exist.js'])
      expect(result.stdout).toContain('Unable to find checks to run using [FILEARGS]=\'')
    })

    it('Should list checks and not execute them with `--list`', async () => {
      const result = await runTest(fixt, ['--list'])
      expect(result.stdout).toContain('Listing all checks')
    })

    it('Should use Github reporter and show test-session link', async () => {
      const reportFilename = fixt.abspath('./reports/checkly-summary.md')
      try {
        fs.unlinkSync(reportFilename)
      } catch {
        // No-op
      }
      const result = await runTest(fixt, ['--record', '--reporter', 'github'], {
        env: {
          CHECKLY_REPORTER_GITHUB_OUTPUT: reportFilename,
        },
      })
      expect(result.stdout).toContain('Github summary saved in')
      expect(result.stdout).toContain('Detailed session summary at')
      expect(result.stdout).toContain('https://chkly.link/l')
      expect(fs.existsSync(reportFilename)).toBe(true)
    })

    it('Should report timeouts correctly', async () => {
      expect.assertions(2)
      try {
        await runTest(fixt, ['homepage.test.ts', '--timeout', '0'])
      } catch (err) {
        if (err instanceof ExecaError) {
          expect(err.stdout).toContain('Reached timeout of 0 seconds waiting for check result.')
          expect(err.exitCode).toEqual(1)
        }
      }
    })
  })

  describe('test-parse-error', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-parse-error'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should terminate with error when JS/TS throws error', async () => {
      expect.assertions(3)
      try {
        await runTest(fixt, [])
      } catch (err) {
        if (err instanceof ExecaError) {
          expect(err.stderr).toContain('Error loading file')
          expect(err.stderr).toContain('Error: Big bang!')
          expect(err.exitCode).toBe(1)
        } else {
          throw err
        }
      }
    })
  })

  describe('test-duplicated-groups', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-duplicated-groups'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should terminate with error when duplicated logicalId', async () => {
      expect.assertions(2)
      try {
        await runTest(fixt, [])
      } catch (err) {
        if (err instanceof ExecaError) {
          expect((err.stderr as unknown as string).replace(/(\n {4})/gm, ''))
            .toContain('Error: Resource of type \'check-group\' with logical id \'my-check-group\' already exists.')
          expect(err.exitCode).toBe(1)
        } else {
          throw err
        }
      }
    })
  })

  describe('test-only-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-only-project'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should include a testOnly check', async () => {
      const result = await runTest(fixt, [], {
        env: {
          PROJECT_LOGICAL_ID: 'test-only-project',
          TEST_ONLY: 'true',
        },
      })
      expect(result.stdout).toContain('TestOnly=false (default) Check')
      expect(result.stdout).toContain('TestOnly=false Check')
      expect(result.stdout).toContain('TestOnly=true Check')
    })
  })

  describe('esm-module', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'esm-module'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('ESModule project should run successfully', async () => {
      const secretEnv = uuid.v4()
      const result = await runTest(fixt, ['-e', `SECRET_ENV=${secretEnv}`, '--verbose'])
      expect(result.stdout).not.toContain('File extension type example')
      expect(result.stdout).toContain(secretEnv)
    })
  })

  describe('snapshot-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'snapshot-project'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should run snapshot tests', async () => {
      const secretEnv = uuid.v4()
      const result = await runTest(fixt, ['-e', `SECRET_ENV=${secretEnv}`, '--verbose', '--record'], {
        env: {
          PROJECT_LOGICAL_ID: `snapshot-project-${uuid.v4()}`,
        },
      })
      expect(result.stdout).toContain(secretEnv)
    })
  })

  describe('snapshot-project-missing-snapshots', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'snapshot-project-missing-snapshots'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should create snapshots when using --update-snapshots', async () => {
      const snapshotDir = fixt.abspath('snapshot-test.spec.ts-snapshots')
      await runTest(fixt, ['--update-snapshots'], {
        env: {
          PROJECT_LOGICAL_ID: `snapshot-project-${uuid.v4()}`,
        },
      })
      expect(fs.readdirSync(snapshotDir)).toEqual([
        'Danube-Snapshot-Test-1-chromium-linux.png',
      ])
    })
  })

  describe('retry-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'retry-project'),
      })
    }, 120_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should execute retries', async () => {
      expect.assertions(1)
      try {
        await runTest(fixt, ['--retries=3'])
      } catch (err) {
        if (err instanceof ExecaError) {
          // The failing check result will have "Failing Check Result" in the output.
          // We expect the check to be run 4 times.
          expect((err.stdout as unknown as string).match(/Failing Check Result/g)).toHaveLength(4)
        } else {
          throw err
        }
      }
    }, 120_000)
  })
})
