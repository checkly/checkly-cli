import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../testing/fixture-sandbox.js'
import { ParseProjectOutput } from '../../commands/debug/parse-project.js'

/**
 * A construct is attributed to the file that declares it, not to the check
 * file that happened to import that file first. The fixture keeps an alert
 * channel, a group, an API check, a browser check and a legacy group in
 * modules the check glob does not match, imported by two check files, plus
 * a factory helper, a group helper and a subclass.
 */

// Each parse spawns the packed CLI, parses and bundles the fixture.
const PARSE_TIMEOUT = 180_000

async function parseProject (fixt: FixtureSandbox, ...args: string[]): Promise<ParseProjectOutput> {
  const result = await fixt.run('pnpm', ['checkly', 'debug', 'parse-project', ...args]).catch(err => err)
  // The command reports an error it caught as `{ errors }` on stdout and
  // still exits 0, so a payload-less output is a failure too.
  const output = result.exitCode === 0 ? JSON.parse(result.stdout) : undefined
  if (result.exitCode !== 0 || !output?.diagnostics) {
    // eslint-disable-next-line no-console
    console.error('stderr', result.stderr)
    // eslint-disable-next-line no-console
    console.error('stdout', result.stdout)
  }
  expect(result.exitCode).toBe(0)
  expect(output).toHaveProperty('diagnostics')
  return output
}

/** Every resource's `sourceFile` by logical id, leaving out the ones without one. */
function sourceFiles (output: ParseProjectOutput): Record<string, string> {
  return Object.fromEntries(
    (output.payload?.resources ?? [])
      .filter(r => r.sourceFile !== undefined)
      .map(r => [r.logicalId, r.sourceFile!]),
  )
}

function payloadOf (output: ParseProjectOutput, logicalId: string): unknown {
  return output.payload?.resources.find(r => r.logicalId === logicalId)?.payload
}

describe('parseProject() source file attribution', () => {
  let fixt: FixtureSandbox
  let output: ParseProjectOutput

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'project-parser-fixtures', 'shared-constructs-project'),
    })
    // `sourceFile` is relative to the git repository root.
    await fs.mkdir(fixt.abspath('.git'))
    output = await parseProject(fixt)
  }, PARSE_TIMEOUT)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('names the module that declares each construct', () => {
    expect(output.diagnostics.fatal).toBe(false)
    expect(sourceFiles(output)).toEqual({
      'ops': 'src/shared/alerts.ts',
      'shared-group': 'src/shared/alerts.ts',
      'shared-api': 'src/shared/checks.ts',
      'shared-browser': 'src/shared/browser.ts',
      'legacy-shared': 'src/shared/legacy-group.ts',
      'src/shared/shared-home.test.ts': 'src/shared/legacy-group.ts',
      'a': 'src/a.check.ts',
      'b': 'src/b.check.ts',
      // Subscriptions are created by the check's constructor, so they belong
      // to the check's file.
      'check-alert-channel-subscription#a#ops': 'src/a.check.ts',
      'check-alert-channel-subscription#b#ops': 'src/b.check.ts',
      // A helper function declares what it creates; a subclass does not.
      'factory-browser': 'src/lib/factory.ts',
      'legacy': 'src/lib/groups.ts',
      'src/legacy-home.test.ts': 'src/lib/groups.ts',
      'team': 'src/team.check.ts',
    })
  })

  it('resolves a relative entrypoint next to the check file first, then next to the declaring module', () => {
    // The factory's entrypoint exists next to the calling check file.
    expect(payloadOf(output, 'factory-browser')).toMatchObject({ scriptPath: 'src/factory-home.test.ts' })
    // The shared module's entrypoint exists only next to the module.
    expect(payloadOf(output, 'shared-browser')).toMatchObject({ scriptPath: 'src/shared/homepage.test.ts' })
  })

  it('globs a testMatch next to the check file first, then next to the declaring module', () => {
    // The helper's testMatch matches next to the calling check file.
    expect(payloadOf(output, 'src/legacy-home.test.ts')).toMatchObject({ scriptPath: 'src/legacy-home.test.ts' })
    // The shared module's testMatch matches only next to the module.
    expect(payloadOf(output, 'src/shared/shared-home.test.ts')).toMatchObject({ scriptPath: 'src/shared/shared-home.test.ts' })
  })

  it('does not depend on which check file loads the shared modules first', async () => {
    const bOnly = await parseProject(fixt, '--config', 'checkly.b-only.config.ts')

    expect(bOnly.diagnostics.fatal).toBe(false)
    expect(sourceFiles(bOnly)).toMatchObject({
      'ops': 'src/shared/alerts.ts',
      'shared-group': 'src/shared/alerts.ts',
      'shared-api': 'src/shared/checks.ts',
      'shared-browser': 'src/shared/browser.ts',
      'legacy-shared': 'src/shared/legacy-group.ts',
      'b': 'src/b.check.ts',
    })
    expect(sourceFiles(bOnly)).not.toHaveProperty('a')
  }, PARSE_TIMEOUT)
})
