import { beforeEach, describe, expect, it } from 'vitest'

import type { Resource } from '../../../constructs/construct-codegen.js'
import { Project } from '../../../constructs/project.js'
import { Session } from '../../../constructs/session.js'
import type { DiffChange } from '../../../rest/projects.js'
import { diffSides, type DiffSide, type RenderedLine } from '../construct-diff.js'
import { MASK } from '../import-shape.js'

/**
 * The construct diff core (`construct-diff.ts`) on its own: how a secret's
 * mark reads on each side, whatever labels the caller gives the sides.
 */

beforeEach(() => {
  Session.reset()
  Session.project = new Project('proj', { name: 'Project' })
})

const CHANGED = { $masked: 'changed' }

/** A check in the import format, its locked variable already masked. */
function check (overrides: Record<string, unknown> = {}): Resource {
  return {
    type: 'check',
    logicalId: 'api',
    payload: {
      id: 'check-uuid',
      checkType: 'API',
      name: 'API',
      activated: true,
      muted: false,
      locations: [],
      tags: [],
      degradedResponseTime: 5000,
      maxResponseTime: 20000,
      request: { url: 'https://example.com/health', method: 'GET', headers: [], queryParameters: [], assertions: [] },
      environmentVariables: [
        { key: 'TOKEN', value: MASK, locked: true, secret: false },
        { key: 'REGION', value: 'eu', locked: false, secret: false },
      ],
      ...overrides,
    },
  }
}

/** A rotation of the locked variable, marked as changed on both sides. */
const rotated: DiffChange = {
  path: '/environmentVariables',
  origin: 'remote',
  secret: true,
  before: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'eu', locked: false }],
  after: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'eu', locked: false }],
}

function side (resource: Resource, label: string, reported: (change: DiffChange) => unknown): DiffSide {
  return { resource, relations: [], markFrom: reported, label, textAt: () => undefined }
}

/** The construct lines with the marker a unified diff gives each one. */
function plain (lines: RenderedLine[]): string[] {
  return lines.map(line => {
    switch (line.kind) {
      case 'add': return `+${line.text}`
      case 'remove': return `-${line.text}`
      case 'context': return ` ${line.text}`
      case 'nested': return `  ${line.line.text}`
      case 'hunk': return '@@'
      default: return line.text
    }
  })
}

function run (input: {
  before: DiffSide
  after: DiffSide
  shown?: DiffChange[]
  context?: number
}): { lines: string[], marked: Set<DiffChange> } {
  const marked = new Set<DiffChange>()
  const lines = diffSides({
    type: 'check',
    shown: input.shown ?? [],
    secrets: [rotated],
    marked,
    before: input.before,
    after: input.after,
    render: { variableNames: undefined, spelledOut: undefined, projectDefaults: {} },
    originNote: () => '',
    context: input.context,
  })
  return { lines: plain(lines), marked }
}

const secretLines = (lines: string[]) => lines.filter(line => line.includes(`value: '${MASK}`))

describe('diffSides', () => {
  it('prints a bare mask on a side without a label and the label on the other', () => {
    const { lines, marked } = run({
      before: side(check(), '', change => change.before),
      after: side(check(), ' (changed)', change => change.after),
    })
    expect(secretLines(lines)).toEqual([
      `-      value: '${MASK}',`,
      `+      value: '${MASK} (changed)',`,
    ])
    expect(marked).toEqual(new Set([rotated]))
    expect(lines.join('\n')).not.toContain('#')
  })

  it('prints the same label on both sides as one unchanged line', () => {
    const renamed: DiffChange = { path: '/name', origin: 'remote', before: 'API', after: 'Renamed' }
    const { lines, marked } = run({
      before: side(check(), ' (changed)', change => change.before),
      after: side(check({ name: 'Renamed' }), ' (changed)', change => change.after),
      shown: [renamed],
      context: Infinity,
    })
    expect(secretLines(lines)).toEqual([`       value: '${MASK} (changed)',`])
    expect(lines).toContain('-  name: \'API\',')
    expect(lines).toContain('+  name: \'Renamed\',')
    expect(marked).toEqual(new Set([rotated]))
    expect(lines.join('\n')).not.toContain('#')
  })
})
