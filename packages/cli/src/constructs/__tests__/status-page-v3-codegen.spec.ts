import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConstructCodegen, sortResources } from '../construct-codegen.js'
import { Context } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'
import type { StatusPageV3Resource } from '../status-page-v3-codegen.js'
import type { StatusPageV3ComponentResource } from '../status-page-v3-component-codegen.js'
import type { StatusPageV3AutomationRuleResource } from '../status-page-v3-automation-rule-codegen.js'

const PAGE_ID = '11111111-1111-4111-8111-111111111111'
const GROUP_ID = '22222222-2222-4222-8222-222222222222'
const SERVICE_ID = '33333333-3333-4333-8333-333333333333'
const RULE_ID = '44444444-4444-4444-8444-444444444444'
const FOREIGN_PAGE_ID = '55555555-5555-4555-8555-555555555555'
const FOREIGN_COMPONENT_ID = '66666666-6666-4666-8666-666666666666'

const page: StatusPageV3Resource = {
  id: PAGE_ID,
  version: 3,
  name: 'ACME Status',
  url: 'acme-status',
  description: 'All systems',
  defaultTheme: 'DARK',
  allowIndexing: false,
}

const group: StatusPageV3ComponentResource = {
  id: GROUP_ID,
  statusPageId: PAGE_ID,
  parentId: null,
  type: 'GROUP',
  name: 'Platform',
  displayOrder: 0,
}

const service: StatusPageV3ComponentResource = {
  id: SERVICE_ID,
  statusPageId: PAGE_ID,
  parentId: GROUP_ID,
  type: 'SERVICE',
  name: 'Public API',
  description: 'REST API',
  hidden: true,
  displayOrder: 1,
}

const rule: StatusPageV3AutomationRuleResource = {
  id: RULE_ID,
  statusPageId: PAGE_ID,
  name: 'API outage',
  enabled: false,
  firstUpdate: 'Investigating',
  lastUpdate: 'Resolved',
  notifySubscribers: false,
  tags: ['api', 'prod'],
  coolDownWindowMinutes: 10,
  components: [{ componentId: SERVICE_ID, targetImpact: 'MAJOR_OUTAGE' }],
}

async function generate (rootDirectory: string, resources: Array<{ type: any, logicalId: string, payload: any }>) {
  const program = new Program({
    rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const codegen = new ConstructCodegen(program)
  const context = new Context()

  sortResources(resources)
  for (const resource of resources) {
    codegen.prepare(resource.logicalId, resource, context)
  }
  for (const resource of resources) {
    codegen.gencode(resource.logicalId, resource, context)
  }
  await program.realize()

  const sources: Record<string, string> = {}
  for (const filePath of program.paths) {
    sources[path.relative(rootDirectory, filePath)] = await readFile(filePath, 'utf8')
  }
  return sources
}

describe('StatusPageV3 codegen', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'status-page-v3-codegen-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  it('generates a v3 page, nested components and an automation rule that reference each other', async () => {
    const sources = await generate(rootDirectory, [
      { type: 'status-page-automation-rule', logicalId: 'api-outage', payload: rule },
      { type: 'status-page-component', logicalId: 'public-api', payload: service },
      { type: 'status-page-component', logicalId: 'platform', payload: group },
      { type: 'status-page', logicalId: 'acme', payload: page },
    ])

    const pageSource = sources['resources/status-pages/acme-status.check.ts']
    expect(pageSource).toContain('import { StatusPageV3 } from \'checkly/constructs\'')
    expect(pageSource).toContain('export const acmeStatusPage = new StatusPageV3(\'acme\', {')
    expect(pageSource).toContain('description: \'All systems\'')
    expect(pageSource).toContain('defaultTheme: \'DARK\'')
    expect(pageSource).toContain('allowIndexing: false')
    expect(pageSource).not.toContain('cards')

    const groupSource = sources['resources/status-pages/components/platform.check.ts']
    expect(groupSource).toContain('import { acmeStatusPage } from \'../acme-status.check\'')
    expect(groupSource).toContain('export const platformComponent = new StatusPageV3Component(\'platform\', {')
    expect(groupSource).toContain('statusPage: acmeStatusPage')
    expect(groupSource).toContain('type: \'GROUP\'')
    expect(groupSource).toContain('displayOrder: 0')
    expect(groupSource).not.toContain('parent:')

    const serviceSource = sources['resources/status-pages/components/public-api.check.ts']
    expect(serviceSource).toContain('import { platformComponent } from \'./platform.check\'')
    expect(serviceSource).toContain('parent: platformComponent')
    expect(serviceSource).toContain('hidden: true')
    expect(serviceSource).toContain('description: \'REST API\'')
    // SERVICE is the default and is left implicit.
    expect(serviceSource).not.toContain('type: \'SERVICE\'')

    const ruleSource = sources['resources/status-pages/automation-rules/api-outage.check.ts']
    expect(ruleSource).toContain('new StatusPageV3AutomationRule(\'api-outage\', {')
    expect(ruleSource).toContain('statusPage: acmeStatusPage')
    expect(ruleSource).toContain('enabled: false')
    expect(ruleSource).toContain('notifySubscribers: false')
    expect(ruleSource).toContain('coolDownMinutes: 10')
    expect(ruleSource).toMatch(/tags: \[\s*'api',\s*'prod',?\s*\]/)
    expect(ruleSource).toContain('component: publicApiComponent')
    expect(ruleSource).toContain('targetImpact: \'MAJOR_OUTAGE\'')
  })

  it('falls back to fromId() references for resources outside the plan', async () => {
    const sources = await generate(rootDirectory, [
      {
        type: 'status-page-component',
        logicalId: 'orphan',
        payload: { ...service, statusPageId: FOREIGN_PAGE_ID, parentId: FOREIGN_COMPONENT_ID },
      },
    ])

    const source = sources['resources/status-pages/components/public-api.check.ts']
    expect(source).toContain(`statusPage: StatusPageV3.fromId('${FOREIGN_PAGE_ID}')`)
    expect(source).toContain(`parent: StatusPageV3Component.fromId('${FOREIGN_COMPONENT_ID}')`)
  })

  it('still generates v2 pages through the shared status-page type', async () => {
    const sources = await generate(rootDirectory, [
      {
        type: 'status-page',
        logicalId: 'legacy',
        payload: { id: PAGE_ID, version: 2, name: 'Legacy', url: 'legacy', cards: [] },
      },
    ])

    const source = sources['resources/status-pages/legacy.check.ts']
    expect(source).toContain('new StatusPage(\'legacy\', {')
    expect(source).toContain('cards: []')
  })

  it('describes each generation distinctly', () => {
    const codegen = new ConstructCodegen(new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    }))
    expect(codegen.describe({ type: 'status-page', logicalId: 'a', payload: page })).toBe('Status Page (v3): ACME Status')
    expect(codegen.describe({ type: 'status-page', logicalId: 'b', payload: { ...page, version: 2 } })).toBe('Status Page: ACME Status')
    expect(codegen.describe({ type: 'status-page-component', logicalId: 'c', payload: group })).toBe('Status Page Component: Platform')
    expect(codegen.describe({ type: 'status-page-automation-rule', logicalId: 'd', payload: rule })).toBe('Status Page Automation Rule: API outage')
  })
})
