import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  generateConstructFiles,
  ImportSafetyViolation,
  UnsupportedResourceTypeError,
  UnsupportedScriptError,
  type GenerateChanges,
  type GeneratedConstructFile,
} from '../index.js'
import { generateIntoProgram, type ImportChanges } from '../generate.js'
import type { ProjectDefaults } from '../../constructs/internal/codegen/index.js'
import type { ConstructExport } from '../../constructs/session.js'
import { ConstructCodegen, sortResources } from '../../constructs/construct-codegen.js'
import { Program } from '../../sourcegen/index.js'

const require = createRequire(import.meta.url)

// An API check with setup and teardown snippets (one requiring the other
// through `./snippets/`), a URL monitor subscribed to an alert channel and
// assigned to a private location (one of each inside the changes, one
// outside), a v3 status page with components and an automation rule, and a
// Playwright check suite.
const fixture = (): GenerateChanges => structuredClone(require('./fixtures/changes.json'))

const without = (changes: GenerateChanges, logicalId: string): GenerateChanges => ({
  ...changes,
  resources: changes.resources.filter(resource => resource.logicalId !== logicalId),
})

// The first error along the `cause` chain, the error itself included, that is an instance of `type`.
function causeOfType<T> (error: unknown, type: new (...args: any[]) => T): T | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof type) {
      return current
    }
  }
  return undefined
}

function file (files: GeneratedConstructFile[], filePath: string): string {
  const match = files.find(file => file.path === filePath)
  if (match === undefined) {
    throw new Error(`No file '${filePath}' among ${files.map(file => file.path).join(', ')}`)
  }
  return match.content
}

const API_CHECK = 'resources/api-checks/orders-api/orders-api.check.ts'
const URL_MONITOR = 'resources/url-monitors/homepage.check.ts'
const RULE = 'resources/status-pages/automation-rules/api-outage.check.ts'

describe('generateConstructFiles', () => {
  it('generates every file of the changes, with paths relative to the root', () => {
    const { files } = generateConstructFiles(fixture())
    expect(files.map(file => file.path).sort()).toEqual([
      'resources/alert-channels/email/ops.check.ts',
      'resources/api-checks/orders-api/orders-api.check.ts',
      'resources/api-checks/orders-api/setup-script.ts',
      'resources/api-checks/orders-api/snippets/auth-helper.ts',
      'resources/api-checks/orders-api/teardown-script.ts',
      'resources/private-locations/office.check.ts',
      'resources/status-pages/acme-status.check.ts',
      'resources/status-pages/automation-rules/api-outage.check.ts',
      'resources/status-pages/components/platform.check.ts',
      'resources/status-pages/components/public-api.check.ts',
      'resources/url-monitors/homepage.check.ts',
      'snippets/auth-helper.ts',
      'snippets/setup-login.ts',
      'snippets/snippets/auth-helper.ts',
    ])
  })

  it('writes snippets, the scripts that use them and the aliases for cross-snippet requires', () => {
    const { files } = generateConstructFiles(fixture())
    expect(file(files, 'snippets/auth-helper.ts')).toEqual('module.exports = { cleanup () {} }\n')
    expect(file(files, 'snippets/setup-login.ts'))
      .toEqual('const helper = require(\'./snippets/auth-helper\')\nhelper.cleanup()\n')
    // `setup-login` requires `./snippets/auth-helper`, which resolves through the alias.
    expect(file(files, 'snippets/snippets/auth-helper.ts'))
      .toContain('This file has been generated to help resolve cross-snippet imports.')
    expect(file(files, 'snippets/snippets/auth-helper.ts')).toContain('import \'../auth-helper\'\n')
    expect(file(files, 'resources/api-checks/orders-api/setup-script.ts'))
      .toEqual('import \'../../../snippets/setup-login\'\n')
    expect(file(files, 'resources/api-checks/orders-api/teardown-script.ts'))
      .toEqual('const helper = require(\'./snippets/auth-helper\')\nhelper.cleanup()')
    expect(file(files, 'resources/api-checks/orders-api/snippets/auth-helper.ts'))
      .toEqual('import \'../../../../snippets/auth-helper\'\n')
    expect(file(files, API_CHECK)).toContain([
      '  setupScript: {',
      '    entrypoint: \'./setup-script.ts\',',
      '  },',
      '  tearDownScript: {',
      '    entrypoint: \'./teardown-script.ts\',',
      '  },',
    ].join('\n'))
  })

  it('generates a v3 status page with its components and automation rules', () => {
    const { files } = generateConstructFiles(fixture())
    expect(file(files, 'resources/status-pages/acme-status.check.ts'))
      .toContain('export const acmeStatusPage = new StatusPageV3(\'status-page\', {')
    expect(file(files, 'resources/status-pages/components/public-api.check.ts')).toContain([
      'export const publicApiComponent = new StatusPageV3Component(\'api-component\', {',
      '  statusPage: acmeStatusPage,',
    ].join('\n'))
    expect(file(files, 'resources/status-pages/components/public-api.check.ts'))
      .toContain('  parent: platformComponent,\n')
    expect(file(files, RULE)).toContain('      component: publicApiComponent,\n')
    expect(file(files, RULE))
      .toContain('      component: StatusPageV3Component.fromId(\'cccccccc-0000-4000-8000-000000000099\'),\n')
  })

  it('refers to subscribed channels and assigned locations by variable, or by ID outside the changes', () => {
    const { files } = generateConstructFiles(fixture())
    const source = file(files, URL_MONITOR)
    expect(source).toContain('import { opsEmailAlert } from \'../alert-channels/email/ops.check\'\n')
    expect(source).toContain('import { officeLocation } from \'../private-locations/office.check\'\n')
    expect(source).toContain([
      '  privateLocations: [',
      '    officeLocation,',
      '    PrivateLocation.fromId(\'bbbbbbbb-0000-4000-8000-000000000002\'),',
      '  ],',
    ].join('\n'))
    expect(source).toContain([
      '  alertChannels: [',
      '    opsEmailAlert,',
      '    AlertChannel.fromId(8),',
      '  ],',
    ].join('\n'))
  })

  it('refers to a group outside the changes by ID', () => {
    const { files } = generateConstructFiles(fixture())
    expect(file(files, API_CHECK)).toContain('  group: CheckGroupV2.fromId(42),\n')
  })

  it('refuses a Playwright check suite and still generates the rest', () => {
    const { files, failures } = generateConstructFiles(fixture())
    expect(failures).toHaveLength(1)
    expect(failures[0].resource.logicalId).toEqual('playwright-suite')
    expect(failures[0].cause.message)
      .toEqual('Playwright check suites cannot be imported: their code bundle cannot be unpacked as source.')
    expect(files.some(file => file.content.includes('PlaywrightCheck'))).toBe(false)
    expect(files).toHaveLength(14)
  })

  it('tells the codegens\' failures apart by class', () => {
    const changes = fixture()
    changes.resources = [
      { type: 'not-a-resource', logicalId: 'unknown', payload: {} },
      {
        type: 'check-group',
        logicalId: 'group-with-snippet',
        payload: { id: 9, name: 'Group', setupSnippetId: 1 },
      },
      {
        type: 'check',
        logicalId: 'handlebars-check',
        payload: {
          id: 'h',
          checkType: 'API',
          name: 'Handlebars',
          localSetupScript: '{{> legacy }}',
          request: { url: 'https://example.com', method: 'GET' },
        },
      },
    ]
    const { failures } = generateConstructFiles(changes)
    const causes = Object.fromEntries(failures.map(({ resource, cause }) => [resource.logicalId, cause]))
    expect(causes.unknown).toBeInstanceOf(UnsupportedResourceTypeError)
    expect((causes.unknown as UnsupportedResourceTypeError).resourceType).toEqual('not-a-resource')
    expect(causes['group-with-snippet']).toBeInstanceOf(ImportSafetyViolation)
    // Raised inside the construct's expression, so wrapped once.
    expect(causes['handlebars-check']).not.toBeInstanceOf(UnsupportedScriptError)
    expect(causeOfType(causes['handlebars-check'], UnsupportedScriptError)?.message)
      .toEqual('Conversion from legacy handlebars syntax is not supported.')
    expect(causeOfType(causes.unknown, ImportSafetyViolation)).toBeUndefined()
  })

  it('leaves the caller\'s list of resources in its order', () => {
    const changes = fixture()
    const before = changes.resources.map(resource => resource.logicalId)
    generateConstructFiles(changes)
    expect(changes.resources.map(resource => resource.logicalId)).toEqual(before)
  })

  it('ignores friends, which only an import of a loaded project can resolve', () => {
    const changes = { ...fixture(), friends: [{ type: 'check-group', logicalId: 'backend', physicalId: 42 }] }
    const { files } = generateConstructFiles(changes)
    expect(file(files, API_CHECK)).toContain('  group: CheckGroupV2.fromId(42),\n')
  })

  it('returns nothing of a resource that failed part-way', () => {
    const changes: GenerateChanges = {
      resources: [{
        type: 'check',
        logicalId: 'b1',
        payload: { id: 'b1', checkType: 'BROWSER', name: 'B1', script: '{{> foo}}' },
      }],
    }
    const { files, failures } = generateConstructFiles(changes)
    expect(failures.map(failure => failure.resource.logicalId)).toEqual(['b1'])
    expect(files).toEqual([])
  })

  it('keeps what the other resources generate when one fails part-way', () => {
    const changes = fixture()
    changes.resources.push({
      type: 'check',
      logicalId: 'b1',
      physicalId: 'b1',
      payload: { id: 'b1', checkType: 'BROWSER', name: 'B1', script: '{{> foo}}' },
    })
    const { files, failures } = generateConstructFiles(changes)
    expect(failures.map(failure => failure.resource.logicalId).sort()).toEqual(['b1', 'playwright-suite'])
    expect(files.some(file => file.path.includes('browser-checks'))).toBe(false)
    expect(files).toHaveLength(14)
  })

  it('names a file after a resource\'s tag only while the name stays inside the root', () => {
    const names = [
      '../../escape', 'team/../../escape', '/abs', 'C:/abs', '\\\\server\\share', '..', '', 'a//b', 'a\0b',
      'team/orders', 'team\\billing',
    ]
    const changes: GenerateChanges = {
      resources: names.map((name, index) => ({
        type: 'check',
        logicalId: `url-${index}`,
        payload: {
          id: `url-${index}`,
          checkType: 'URL',
          name: `Monitor ${index}`,
          tags: [`checkly-import-filename:${name}`],
          request: { url: 'https://www.example.com' },
        },
      })),
    }
    const { files, failures } = generateConstructFiles(changes)
    expect(failures).toEqual([])
    expect(files.map(file => file.path).sort()).toEqual([
      'resources/url-monitors/monitor-0.check.ts',
      'resources/url-monitors/monitor-1.check.ts',
      'resources/url-monitors/monitor-2.check.ts',
      'resources/url-monitors/monitor-3.check.ts',
      'resources/url-monitors/monitor-4.check.ts',
      'resources/url-monitors/monitor-5.check.ts',
      'resources/url-monitors/monitor-6.check.ts',
      'resources/url-monitors/monitor-7.check.ts',
      'resources/url-monitors/monitor-8.check.ts',
      'resources/url-monitors/team/billing.check.ts',
      'resources/url-monitors/team/orders.check.ts',
    ])
  })

  it('treats a type named after an Object.prototype member as unsupported', () => {
    const types = ['constructor', 'toString', '__proto__', 'hasOwnProperty']
    const changes: GenerateChanges = {
      resources: [
        ...types.map(type => ({ type, logicalId: type, payload: {} })),
        ...fixture().resources.filter(resource => resource.logicalId === 'url-monitor'),
      ],
    }
    const { files, failures } = generateConstructFiles(changes)
    expect(failures.map(failure => failure.resource.logicalId).sort()).toEqual([...types].sort())
    for (const { cause } of failures) {
      expect(cause).toBeInstanceOf(UnsupportedResourceTypeError)
    }
    expect(files.map(file => file.path)).toEqual(['resources/url-monitors/homepage.check.ts'])
  })

  it('sorts a type named after an Object.prototype member like any unknown type', () => {
    const resources = [
      { type: 'constructor', logicalId: 'a', payload: {} },
      { type: 'check', logicalId: 'b', payload: {} },
      { type: 'toString', logicalId: 'c', payload: {} },
    ] as any[]
    expect(sortResources(resources).map(resource => resource.logicalId)).toEqual(['b', 'a', 'c'])
  })

  it('names a file after a plain file name from a resource\'s tags', () => {
    const changes: GenerateChanges = {
      resources: [{
        type: 'check',
        logicalId: 'url',
        payload: {
          id: 'url',
          checkType: 'URL',
          name: 'Homepage',
          tags: ['checkly-import-filename:front-page'],
          request: { url: 'https://www.example.com' },
        },
      }],
    }
    const { files } = generateConstructFiles(changes)
    expect(files.map(file => file.path)).toEqual(['resources/url-monitors/front-page.check.ts'])
  })

  describe('project defaults', () => {
    it('writes every prop a project default could fill in when none are given', () => {
      const { files } = generateConstructFiles(fixture())
      const source = file(files, URL_MONITOR)
      expect(source).toContain('  activated: true,\n')
      expect(source).toContain('  muted: false,\n')
      expect(source).toContain('  shouldFail: false,\n')
      expect(source).toContain('  locations: [],\n')
      expect(source).toContain('  tags: [],\n')
      const apiCheck = file(files, API_CHECK)
      expect(apiCheck).toContain('  privateLocations: [],\n')
      expect(apiCheck).toContain('  alertChannels: [],\n')
      expect(apiCheck).toContain('  environmentVariables: [],\n')
      expect(apiCheck).toContain('  runtimeId: \'2025.04\',\n')
    })

    it('leaves out what a project without defaults fills in by itself', () => {
      const { files } = generateConstructFiles(fixture(), { projectDefaults: {} })
      const source = file(files, URL_MONITOR)
      expect(source).not.toMatch(/activated|muted|shouldFail|locations: |tags/)
      const apiCheck = file(files, API_CHECK)
      expect(apiCheck).not.toMatch(/privateLocations|alertChannels|environmentVariables/)
      expect(apiCheck).toContain('  runtimeId: \'2025.04\',\n')
    })

    it('writes what differs from the given project defaults', () => {
      const { files } = generateConstructFiles(fixture(), {
        projectDefaults: { checks: { muted: true, tags: ['prod'] } },
      })
      const source = file(files, URL_MONITOR)
      expect(source).toContain('  muted: false,\n')
      expect(source).toContain('  tags: [],\n')
      expect(source).not.toMatch(/activated|shouldFail|locations: /)
    })
  })

  describe('referenced names', () => {
    const referencedNames = {
      'check-group': { 42: 'Backend' },
      'alert-channel': { 8: 'Pager\nduty' },
      'private-location': { 'bbbbbbbb-0000-4000-8000-000000000002': 'Rack 2' },
      'status-page-component': { 'cccccccc-0000-4000-8000-000000000099': 'Legacy API' },
    }

    it('names a resource referenced by ID in a trailing comment', () => {
      const { files } = generateConstructFiles(fixture(), { referencedNames })
      expect(file(files, API_CHECK)).toContain('  group: CheckGroupV2.fromId(42), // Backend\n')
      expect(file(files, URL_MONITOR)).toContain([
        '  privateLocations: [',
        '    officeLocation,',
        '    PrivateLocation.fromId(\'bbbbbbbb-0000-4000-8000-000000000002\'), // Rack 2',
        '  ],',
      ].join('\n'))
      expect(file(files, RULE)).toContain([
        '      component: StatusPageV3Component.fromId(\'cccccccc-0000-4000-8000-000000000099\'), // Legacy API',
        '      targetImpact: \'DEGRADED_PERFORMANCE\',',
      ].join('\n'))
    })

    it('keeps a name with a line break on the comment\'s line', () => {
      const { files } = generateConstructFiles(fixture(), { referencedNames })
      expect(file(files, URL_MONITOR)).toContain([
        '  alertChannels: [',
        '    opsEmailAlert,',
        '    AlertChannel.fromId(8), // Pager duty',
        '  ],',
      ].join('\n'))
    })

    it('adds no comment to a reference by variable, or to an ID without a name', () => {
      const { files } = generateConstructFiles(fixture(), {
        referencedNames: { 'alert-channel': { 7: 'Ops email' }, 'check-group': { 43: 'Other' } },
      })
      expect(file(files, URL_MONITOR)).toContain('    opsEmailAlert,\n')
      expect(file(files, URL_MONITOR)).toContain('    AlertChannel.fromId(8),\n')
      expect(file(files, API_CHECK)).toContain('  group: CheckGroupV2.fromId(42),\n')
    })
  })

  describe('compared with writing the program to disk', () => {
    let rootDirectory: string

    beforeEach(async () => {
      rootDirectory = await mkdtemp(path.join(tmpdir(), 'generate-construct-files-'))
    })

    afterEach(async () => {
      await rm(rootDirectory, { recursive: true, force: true })
    })

    it('renders what `checkly import` writes for the same changes', async () => {
      const changes = without(fixture(), 'playwright-suite')
      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      const failures = generateIntoProgram(changes, program, new ConstructCodegen(program), { projectDefaults: {} })
      expect(failures).toEqual([])
      await program.realize()

      const { files } = generateConstructFiles(changes, { projectDefaults: {} })
      for (const { path: filePath, content } of files) {
        expect(await readFile(path.join(rootDirectory, filePath), 'utf8')).toEqual(content)
      }
      expect(program.paths).toHaveLength(files.length)
    })

    // `import-golden.json` holds what the generation step of `checkly import`
    // wrote for `import-input.json` before it moved into `generateIntoProgram`:
    // friends from the loaded project, and project defaults for checks and
    // browser checks.
    it('writes what `checkly import` wrote for friends and project defaults', async () => {
      const input = structuredClone(require('./fixtures/import-input.json')) as {
        changes: ImportChanges
        projectDefaults: ProjectDefaults
        friendExports: Record<string, Record<string, ConstructExport>>
      }
      const golden: Record<string, string> = require('./fixtures/import-golden.json')

      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      // As `checkly import` calls it.
      const failures = generateIntoProgram(input.changes, program, new ConstructCodegen(program), {
        projectDefaults: input.projectDefaults,
        friendExport: (type, logicalId) => input.friendExports[type]?.[logicalId],
      })
      expect(failures).toEqual([])
      await program.realize()

      const written: Record<string, string> = {}
      for (const filePath of program.paths) {
        written[path.relative(rootDirectory, filePath).split(path.sep).join('/')] = await readFile(filePath, 'utf8')
      }
      expect(written).toEqual(golden)
    })

    it('reports a friend it was given no export for', () => {
      const changes: ImportChanges = {
        ...fixture(),
        friends: [{ type: 'check-group', logicalId: 'backend', physicalId: 42 }],
      }
      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      expect(() => generateIntoProgram(changes, program, new ConstructCodegen(program)))
        .toThrow('Received friend resource \'backend\' that was not requested for.')
    })

    it('reports a friend of a type it does not support before looking up its export', () => {
      const changes = {
        ...fixture(),
        friends: [{ type: 'dashboard', logicalId: 'board', physicalId: 1 }],
      } as unknown as ImportChanges
      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      expect(() => generateIntoProgram(changes, program, new ConstructCodegen(program)))
        .toThrow('Unable to process unsupported friend resource type \'dashboard\'.')
    })
  })
})
