import fs from 'node:fs/promises'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FixtureSandbox } from '../../testing/fixture-sandbox.js'

// A CommonJS program generating code with the installed package, in an
// environment where reading credentials or writing a config store would
// fail: HOME cannot be written to, and no CHECKLY_ variable is set.
const SCRIPT = `\
'use strict'
const { generateConstructDiff, generateConstructFiles } = require('checkly/codegen')
const { files, failures } = generateConstructFiles({
  resources: [{
    type: 'check',
    logicalId: 'homepage',
    payload: {
      id: 'homepage',
      checkType: 'URL',
      name: 'Homepage',
      frequency: 10,
      groupId: 42,
      request: { url: 'https://www.example.com' },
    },
  }],
}, {
  referencedNames: { 'check-group': { 42: 'Backend' } },
})
const diff = generateConstructDiff({
  resource: {
    type: 'check',
    logicalId: 'homepage',
    payload: {
      id: 'homepage',
      checkType: 'URL',
      name: 'Homepage',
      frequency: 10,
      groupId: 42,
      request: { url: 'https://www.example.com' },
    },
  },
  deployed: {
    checkType: 'URL',
    name: 'Homepage',
    frequency: 10,
    groupId: { ref: 'old-group' },
    request: { url: 'https://www.example.com' },
  },
  changes: [{ path: '/groupId', before: { $ref: 'old-group' }, after: { $ref: 'backend' } }],
  redactions: [],
  references: [
    { type: 'check-group', logicalId: 'old-group', physicalId: 41, name: 'Old backend' },
    { type: 'check-group', logicalId: 'backend', physicalId: 42, name: 'Backend' },
  ],
})
process.stdout.write(JSON.stringify({ files, failures: failures.length, diff }))
`

describe('checkly/codegen from CommonJS', () => {
  let fixt: FixtureSandbox
  let home: string

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
    await fs.writeFile(fixt.abspath('generate.cjs'), SCRIPT)
    home = fixt.abspath('home')
    await fs.mkdir(home)
    await fs.chmod(home, 0o555)
  }, 180_000)

  afterAll(async () => {
    await fs.chmod(home, 0o755).catch(() => {})
    await fixt?.destroy()
  })

  it('generates a check with an unwritable HOME and no CHECKLY_ variables', async () => {
    const result = await fixt.run(process.execPath, ['generate.cjs'], {
      extendEnv: false,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, '.config'),
      },
      timeout: 60_000,
    })

    const { files, failures, diff } = JSON.parse(result.stdout)
    expect(failures).toEqual(0)
    expect(files).toEqual([{
      path: 'resources/url-monitors/homepage.check.ts',
      content: expect.stringContaining('  group: CheckGroupV2.fromId(42), // Backend\n'),
    }])
    expect(files[0].content).toContain('new UrlMonitor(\'homepage\', {')
    expect(diff.filter((line: { kind: string }) => line.kind === 'add' || line.kind === 'remove')).toEqual([
      { kind: 'remove', text: '  group: CheckGroupV2.fromId(41), // Old backend' },
      { kind: 'add', text: '  group: CheckGroupV2.fromId(42), // Backend' },
    ])
    expect(await fs.readdir(home)).toEqual([])
  }, 60_000)
})
