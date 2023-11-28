import * as path from 'path'
import * as uuid from 'uuid'
import config from 'config'
import * as fs from 'fs'
import { runChecklyCli } from '../run-checkly'

describe('test', () => {
  it('Test project should run successfully', async () => {
    const secretEnv = uuid.v4()
    const result = await runChecklyCli({
      args: ['test', '-e', `SECRET_ENV=${secretEnv}`, '--verbose'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
      timeout: 120000, // 2 minutes
    })
    expect(result.stdout).not.toContain('File extension type example')
    expect(result.stdout).toContain(secretEnv)
    expect(result.status).toBe(0)
  }, 130000)

  it('Should include only one check', async () => {
    const result = await runChecklyCli({
      args: ['test', 'secret.check.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Show SECRET_ENV value')
    expect(result.stdout).toContain('1 passed, 1 total')
    expect(result.status).toBe(0)
  })

  it('Should use different config file', async () => {
    const result = await runChecklyCli({
      args: ['test', 'secret.check.ts', '--config', 'checkly.staging.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Show SECRET_ENV value')
    expect(result.stdout).toContain('1 passed, 1 total')
    expect(result.status).toBe(0)
  })

  it('Should fail with config file not found', async () => {
    const result = await runChecklyCli({
      args: ['test', 'secret.check.ts', '--config', 'checkly.notfound.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.status).toBe(1)
  })

  it('Should fail with bad dependency reference', async () => {
    const result = await runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-bad-reference-project', 'e2e'),
    })
    expect(result.stderr).toContain('Error: You cannot reference a dependency file above the Checkly config')
    expect(result.stderr).toContain('location folder. Please, modify')
    expect(result.stderr).toContain('"../common/__test-utils__/playwright/index.ts" path.')
    expect(result.status).toBe(1)
  })

  it('Should terminate when no checks are found', async () => {
    const result = await runChecklyCli({
      args: ['test', 'does-not-exist.js'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Unable to find checks to run using [FILEARGS]=\'')
    expect(result.status).toBe(0)
  })

  it('Should list checks and not execute them with `--list`', async () => {
    const result = await runChecklyCli({
      args: ['test', '--list'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Listing all checks')
    expect(result.status).toBe(0)
  })

  it('Should terminate with error when JS/TS throws error', async () => {
    const result = await runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-parse-error'),
    })
    expect(result.stderr).toContain('Error loading file')
    expect(result.stderr).toContain('Error: Big bang!')
    expect(result.status).toBe(1)
  })

  it('Should terminate with error when duplicated logicalId', async () => {
    const result = await runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-duplicated-groups'),
    })
    expect(result.stderr.replace(/(\n {4})/gm, ''))
      .toContain("Error: Resource of type 'check-group' with logical id 'my-check-group' already exists.")
    expect(result.status).toBe(1)
  })

  it('Should include a testOnly check', async () => {
    const result = await runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-only-project'),
      env: { PROJECT_LOGICAL_ID: 'test-only-project', TEST_ONLY: 'true' },
    })
    expect(result.stdout).toContain('TestOnly=false (default) Check')
    expect(result.stdout).toContain('TestOnly=false Check')
    expect(result.stdout).toContain('TestOnly=true Check')
    expect(result.status).toBe(0)
  })

  it('Should use Github reporter and show test-session link', async () => {
    const reportFilename = './reports/checkly-summary.md'
    try {
      fs.unlinkSync(reportFilename)
    } catch {
    }
    const result = await runChecklyCli({
      args: ['test', '--record', '--reporter', 'github'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
      env: { CHECKLY_REPORTER_GITHUB_OUTPUT: reportFilename },
      timeout: 120000, // 2 minutes
    })
    expect(result.stdout).toContain('Github summary saved in')
    expect(result.stdout).toContain('Detailed session summary at')
    expect(result.stdout).toContain('https://chkly.link/l')
    expect(fs.existsSync(path.join(__dirname, 'fixtures', 'test-project', reportFilename))).toBe(true)
    expect(result.status).toBe(0)
  })

  it('Should report timeouts correctly', async () => {
    const result = await runChecklyCli({
      args: ['test', 'homepage.test.ts', '--timeout', '0'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Reached timeout of 0 seconds waiting for check result.')
  })

  it('ESModule project should run successfully', async () => {
    const secretEnv = uuid.v4()
    const result = await runChecklyCli({
      args: ['test', '-e', `SECRET_ENV=${secretEnv}`, '--verbose'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'esm-module'),
      timeout: 120000, // 2 minutes
    })
    expect(result.stdout).not.toContain('File extension type example')
    expect(result.stdout).toContain(secretEnv)
    expect(result.status).toBe(0)
  })

  it('Should run snapshot tests', async () => {
    const secretEnv = uuid.v4()
    const result = await runChecklyCli({
      args: ['test', '-e', `SECRET_ENV=${secretEnv}`, '--verbose'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'snapshot-project'),
      env: { PROJECT_LOGICAL_ID: `snapshot-project-${uuid.v4()}` },
    })
    expect(result.stdout).toContain(secretEnv)
    expect(result.status).toBe(0)
  })

  it('Should create snapshots when using --update-snapshots', async () => {
    const snapshotDir = path.join(__dirname, 'fixtures', 'snapshot-project-missing-snapshots', 'snapshot-test.spec.ts-snapshots')
    try {
      const result = await runChecklyCli({
        args: ['test', '--update-snapshots'],
        apiKey: config.get('apiKey'),
        accountId: config.get('accountId'),
        directory: path.join(__dirname, 'fixtures', 'snapshot-project-missing-snapshots'),
        env: { PROJECT_LOGICAL_ID: `snapshot-project-${uuid.v4()}` },
      })
      expect(result.status).toBe(0)
      expect(fs.readdirSync(snapshotDir)).toEqual([
        'Danube-Snapshot-Test-1-chromium-linux.png',
      ])
    } finally {
      // Clean up the snapshots for future runs
      fs.rmSync(snapshotDir, { recursive: true })
    }
  })
})
