import fs from 'node:fs'
import path from 'node:path'

import { nanoid } from 'nanoid'
import { ExecaError } from 'execa'
import { describe, beforeAll, afterAll, it, expect } from 'vitest'

import { FixtureSandbox } from '../../../src/testing/fixture-sandbox'
import { runCheckly } from '../../run-checkly'

describe('checkly env pull', () => {
  const executionId = nanoid(5)
  let fixt: FixtureSandbox

  // before testing add a new environment variable call envPullTest with value testvalue
  // additionally delete .envPullTest file if it exists
  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      template: 'bare',
      source: path.join(__dirname, '..', 'fixtures', 'check-parse-error'),
    })
    await runCheckly(fixt, ['env', 'add', `envPullTest-${executionId}`, 'testvalue'])

    // delete .envPullTest file if it exists
    const envPullTestPath = path.join(fixt.root, '.envPullTest')
    if (fs.existsSync(envPullTestPath)) {
      fs.unlinkSync(envPullTestPath)
    }
  }, 180_000)

  // after testing remove the environment variable envPullTest from checkly
  // additionally delete .envPullTest file if it exists
  afterAll(async () => {
    try {
      await runCheckly(fixt, ['env', 'rm', `envPullTest-${executionId}`, '--force'])
    } catch {
      // ignore cleanup errors
    }

    if (fixt) {
      const envPullTestPath = path.join(fixt.root, '.envPullTest')
      if (fs.existsSync(envPullTestPath)) {
        fs.unlinkSync(envPullTestPath)
      }
    }

    await fixt?.destroy()
  })

  // test that env pull .envPullTest creates a .envPullTest file with the correct content
  it('should create a .envPullTest file with the correct content', async () => {
    const { stdout } = await runCheckly(fixt, ['env', 'pull', '.envPullTest'])
    const filename = path.join(fixt.root, '.envPullTest')
    // expect that 'testenvvars' is in the output
    expect(fs.existsSync(filename)).toBe(true)
    expect(fs.readFileSync(filename, 'utf8')).toContain(`envPullTest-${executionId}=testvalue`)
    // result.stdout contains Success! ${filename} file
    expect(stdout).toContain('Success! Environment variables written to .envPullTest.')
  })

  it('should ask for permission to overwrite a .envPullTest file', async () => {
    // create .envPullTest file in directory
    fs.writeFileSync(path.join(fixt.root, '.envPullTest'), 'test=test')
    try {
      await runCheckly(fixt, ['env', 'pull', '.envPullTest'], {
        timeout: 5000,
      })
      expect.unreachable('Expected process to be killed by timeout')
    } catch (err) {
      if (err instanceof ExecaError) {
        // result.stdout contains 'Found existing file.'
        expect(err.stdout).toContain('Found existing file .envPullTest.')
      } else {
        throw err
      }
    }
  })

  it('should overwrite a .envPullTest file w/o asking for permission', async () => {
    // create .envPullTest file in directory
    fs.writeFileSync(path.join(fixt.root, '.envPullTest'), 'test=test')
    const { stdout } = await runCheckly(fixt, ['env', 'pull', '.envPullTest', '--force'])
    // result.stdout contains Success! ${filename} file
    expect(stdout).toContain('Success! Environment variables written to .envPullTest.')
  })
})
