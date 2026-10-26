import path from 'node:path'
import fs from 'node:fs'

import * as uuid from 'uuid'
import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { FixtureSandbox, RunOptions } from '../../src/testing/fixture-sandbox'
import { checklyEnv } from '../run-checkly'
import { ExecaError } from 'execa'

async function runTest (fixt: FixtureSandbox, args: string[], options?: RunOptions) {
  const result = await fixt.run('pnpm', [
    'checkly',
    'test',
    ...args,
  ], {
    timeout: 120_000,
    ...options,
    env: {
      ...checklyEnv(),
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
        template: 'playwright',
      })
    }, 180_000)

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

    it('Should fail when no checks are found', async () => {
      expect.assertions(2)
      try {
        await runTest(fixt, ['does-not-exist.js'])
      } catch (err) {
        if (err instanceof ExecaError) {
          expect(err.exitCode).toBe(1)
          // An error, not an empty result: stderr.
          expect(err.stderr).toContain('Unable to find checks to run using [FILEARGS]=\'')
        } else {
          throw err
        }
      }
    })

    it('Should terminate successfully when no checks are found and --no-fail-on-no-matching is set', async () => {
      const result = await runTest(fixt, ['does-not-exist.js', '--no-fail-on-no-matching'])
      expect(result.stdout).toContain('Unable to find checks to run using [FILEARGS]=\'')
    })

    it('Should list checks and not execute them with `--list`', async () => {
      const result = await runTest(fixt, ['--list'])
      expect(result.stdout).toContain('Listing all checks')
    })

    it('Should terminate successfully with `--list` when no checks are found', async () => {
      const result = await runTest(fixt, ['does-not-exist.js', '--list'])
      expect(result.stdout).toContain('Unable to find checks to run using [FILEARGS]=\'')
    })

    it('Should use the ci reporter when asked to', async () => {
      // The default reporter follows the CLI mode, which the e2e harness forces
      // to interactive, so the ci reporter is only exercised when named.
      const result = await runTest(fixt, ['secret.check.ts', '--reporter', 'ci'])
      expect(result.stdout).toContain('Finished running all checks:')
      expect(result.stdout).toContain('1 passed, 1 total')
    })

    it('Should use Github reporter and show test-session link', async () => {
      const reportFilename = fixt.abspath('./reports/checkly-summary.md')
      try {
        fs.unlinkSync(reportFilename)
      } catch {
        // No-op
      }
      // Keep this reporter test scoped to one stable check. The GitHub assertions below do not
      // need the whole fixture project, and unrelated remote checks can make this fail first.
      const result = await runTest(fixt, ['secret.check.ts', '--record', '--reporter', 'github'], {
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
        template: 'playwright',
      })
    }, 180_000)

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
        template: 'playwright',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should terminate with error when duplicated logicalId', async () => {
      expect.assertions(2)
      try {
        await runTest(fixt, [])
      } catch (err) {
        if (err instanceof ExecaError) {
          // A duplicate logicalId is reported as a fatal validation
          // diagnostic (printed to stderr) rather than a thrown error.
          expect((err.stderr as unknown as string).replace(/(\n {4})/gm, ''))
            .toContain('A check-group with logicalId "my-check-group" already exists.')
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
        template: 'playwright',
      })
    }, 180_000)

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
        template: 'playwright',
      })
    }, 180_000)

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
        template: 'playwright',
      })
    }, 180_000)

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
        template: 'playwright',
      })
    }, 180_000)

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
        template: 'playwright',
      })
    }, 180_000)

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

  describe('max-failures-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'max-failures-project'),
        template: 'playwright',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    // The slow check passes only after 90 seconds. The test's own timeout is
    // longer than that, so a run that waits for it fails the elapsed-time
    // assertion rather than timing out.
    it('Should stop waiting for the remaining checks once the limit is reached', async () => {
      expect.assertions(5)
      const startedAt = Date.now()
      try {
        await fixt.run('pnpm', ['checkly', 'test', '--max-failures=1', '--reporter=json'], {
          timeout: 140_000,
          env: checklyEnv(),
        })
      } catch (err) {
        if (!(err instanceof ExecaError)) {
          throw err
        }
        expect(err.exitCode).toBe(1)
        expect(Date.now() - startedAt).toBeLessThan(80_000)
        const report = JSON.parse(fs.readFileSync(path.join(fixt.root, 'checkly-json-report.json'), 'utf8'))
        expect(report.stoppedEarly).toEqual({ reason: 'maxFailures', maxFailures: 1 })
        expect(report.checks.find((check: any) => check.name === 'Failing check').result).toBe('Fail')
        expect(report.checks.find((check: any) => check.name === 'Slow passing check').result).toBe('Not finished')
      }
    }, 150_000)
  })

  describe('shared-constructs-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        // The parser's sandbox spec covers the same fixture; it lives with the
        // parser fixtures so there is one copy.
        source: path.join(
          __dirname, '..', '..', 'src', 'services', '__tests__', 'project-parser-fixtures', 'shared-constructs-project',
        ),
        template: 'playwright',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should list a check under the module that declares it, not under the check file importing it', async () => {
      const result = await runTest(fixt, ['--list', 'shared/checks'])
      expect(result.stdout).toContain('src/shared/checks.ts')
      expect(result.stdout).toContain('Shared API')
      expect(result.stdout).not.toContain('src/b.check.ts')
    })

    it('Should select a check made by a helper when naming the check file that called it', async () => {
      const result = await runTest(fixt, ['--list', 'factory.check'])
      expect(result.stdout).toContain('src/lib/factory.ts')
      expect(result.stdout).toContain('factory-browser')
    })

    it('Should select the checks a check file loads from imported modules, listed under their own files', async () => {
      const result = await runTest(fixt, ['--list', 'b.check'])
      expect(result.stdout).toContain('src/b.check.ts')
      expect(result.stdout).toContain('src/shared/checks.ts')
      expect(result.stdout).toContain('Shared API')
    })

    it('Should not select checks from modules the named check file does not load', async () => {
      const result = await runTest(fixt, ['--list', 'a.check'])
      expect(result.stdout).toContain('src/a.check.ts')
      expect(result.stdout).not.toContain('Shared API')
      expect(result.stdout).not.toContain('Shared browser')
    })
  })
})
