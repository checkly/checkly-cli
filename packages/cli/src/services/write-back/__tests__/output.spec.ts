import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../../../constructs/api-check.js'
import { CheckGroupV2 } from '../../../constructs/check-group-v2.js'
import { Project } from '../../../constructs/project.js'
import { Session } from '../../../constructs/session.js'
import { formatWriteBackSkipped, formatWriteBackUpdated } from '../output.js'
import type { WriteBackPlan } from '../plan.js'

/**
 * What `checkly deploy` prints after writing the changes made in Checkly into
 * the code (`output.ts`). Asserted without colour, which chalk drops under a
 * test runner anyway.
 */

// eslint-disable-next-line no-control-regex
const uncoloured = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '')

const cwd = path.resolve('/home/user/repo')

let project: Project

const empty: WriteBackPlan = { files: [], applied: [], constructs: [], skipped: [], imports: [] }

beforeEach(() => {
  Session.reset()
  Session.project = new Project('proj', { name: 'Website' })
  project = Session.project
  Session.checkFileAbsolutePath = path.join(cwd, 'src', 'groups.ts')
  new CheckGroupV2('grp', { name: 'Website Group' })
  Session.checkFileAbsolutePath = path.join(cwd, 'src', 'api.check.ts')
  new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
  Session.checkFileAbsolutePath = undefined
})

describe('formatWriteBackUpdated', () => {
  it('prints each construct under the plan\'s header, as a diff of its source', () => {
    const writeBack: WriteBackPlan = {
      ...empty,
      files: [{ path: path.join(cwd, 'src', 'api.check.ts'), text: '', original: '' }],
      applied: [
        { file: 'src/api.check.ts', type: 'check', logicalId: 'api', property: 'frequency', previous: 'Frequency.EVERY_5M', rendered: 'Frequency.EVERY_2M', replacesLocalEdit: false },
        { file: 'src/api.check.ts', type: 'check', logicalId: 'api', property: 'degradedResponseTime', previous: '5000', rendered: '3500', replacesLocalEdit: false },
      ],
      constructs: [{
        file: 'src/api.check.ts',
        type: 'check',
        logicalId: 'api',
        before: 'new ApiCheck(\'api\', {\n  frequency: Frequency.EVERY_5M,\n  degradedResponseTime: 5000,\n})',
        after: 'new ApiCheck(\'api\', {\n  frequency: Frequency.EVERY_2M,\n  degradedResponseTime: 3500,\n})',
      }],
    }
    expect(uncoloured(formatWriteBackUpdated({ writeBack, project, cwd }))).toBe([
      'Updated your code · 2 properties in 1 file',
      '',
      '~ ApiCheck api  src/api.check.ts',
      '    new ApiCheck(\'api\', {',
      '  -   frequency: Frequency.EVERY_5M,',
      '  -   degradedResponseTime: 5000,',
      '  +   frequency: Frequency.EVERY_2M,',
      '  +   degradedResponseTime: 3500,',
      '    })',
      '',
    ].join('\n'))
  })

  it('shows a change inside a multi-line helper call in its surrounding lines, and a gap between distant changes', () => {
    const filler = Array.from({ length: 8 }, (_, index) => `  tag${index}: true,`)
    const source = (name: string, retries: number) => [
      'new ApiCheck(\'api\', {',
      `  name: '${name}',`,
      ...filler,
      '  retryStrategy: RetryStrategyBuilder.fixedStrategy({',
      '    baseBackoffSeconds: 60,',
      `    maxRetries: ${retries},`,
      '    sameRegion: true,',
      '  }),',
      '})',
    ].join('\n')
    const writeBack: WriteBackPlan = {
      ...empty,
      files: [{ path: path.join(cwd, 'src', 'api.check.ts'), text: '', original: '' }],
      applied: [
        { file: 'src/api.check.ts', type: 'check', logicalId: 'api', property: 'name', previous: '\'API\'', rendered: '\'API v2\'', replacesLocalEdit: false },
        { file: 'src/api.check.ts', type: 'check', logicalId: 'api', property: 'retryStrategy', previous: '…', rendered: '…', replacesLocalEdit: true },
      ],
      constructs: [{ file: 'src/api.check.ts', type: 'check', logicalId: 'api', before: source('API', 2), after: source('API v2', 3) }],
      imports: [{ file: 'src/api.check.ts', names: ['RetryStrategyBuilder'] }],
    }
    const text = uncoloured(formatWriteBackUpdated({ writeBack, project, cwd }))
    expect(text).toContain([
      '  -   name: \'API\',',
      '  +   name: \'API v2\',',
    ].join('\n'))
    expect(text).toContain([
      '      tag2: true,',
      // The gap sits where the plan prints it.
      '    ⋯',
      '      tag7: true,',
      '      retryStrategy: RetryStrategyBuilder.fixedStrategy({',
      '        baseBackoffSeconds: 60,',
      '  -     maxRetries: 2,',
      '  +     maxRetries: 3,',
      '        sameRegion: true,',
      '      }),',
      '    })',
      // What a diff cannot say follows it.
      '  ~ retryStrategy: replaced a local edit',
      '  ~ imported RetryStrategyBuilder from \'checkly/constructs\'',
      '',
    ].join('\n'))
    // The first hunk is not introduced by a gap.
    expect(text.split('\n')[3]).toBe('    new ApiCheck(\'api\', {')
  })

  it('counts files and properties in the plural, and names a file\'s import once, under its last construct', () => {
    const construct = (file: string, type: string, logicalId: string) =>
      ({ file, type, logicalId, before: 'name: \'a\',', after: 'name: \'b\',' })
    const line = (file: string, type: string, logicalId: string) =>
      ({ file, type, logicalId, property: 'name', previous: '\'a\'', rendered: '\'b\'', replacesLocalEdit: false })
    const writeBack: WriteBackPlan = {
      ...empty,
      files: [
        { path: path.join(cwd, 'src', 'groups.ts'), text: '', original: '' },
        { path: path.join(cwd, 'src', 'api.check.ts'), text: '', original: '' },
      ],
      applied: [line('src/groups.ts', 'check-group', 'grp'), line('src/api.check.ts', 'check', 'api')],
      constructs: [construct('src/groups.ts', 'check-group', 'grp'), construct('src/api.check.ts', 'check', 'api')],
      imports: [{ file: 'src/groups.ts', names: ['Frequency'] }],
    }
    const text = uncoloured(formatWriteBackUpdated({ writeBack, project, cwd }))
    expect(text).toContain('Updated your code · 2 properties in 2 files')
    expect(text).toContain([
      '~ CheckGroupV2 grp  src/groups.ts',
      '  - name: \'a\',',
      '  + name: \'b\',',
      '  ~ imported Frequency from \'checkly/constructs\'',
      '',
      '~ ApiCheck api  src/api.check.ts',
      '  - name: \'a\',',
      '  + name: \'b\',',
      '',
    ].join('\n'))
  })
})

describe('formatWriteBackUpdated without a diff to show', () => {
  it('lists each property with its old and new source', () => {
    const unchanged = 'new ApiCheck(\'api\', {})'
    const writeBack: WriteBackPlan = {
      ...empty,
      files: [{ path: path.join(cwd, 'src', 'api.check.ts'), text: '', original: '' }],
      applied: [
        { file: 'src/api.check.ts', type: 'check', logicalId: 'api', property: 'name', previous: '\'API\'', rendered: '\'API v2\'', replacesLocalEdit: false },
        { file: 'src/api.check.ts', type: 'check', logicalId: 'api', property: 'tags', rendered: '[\n  \'a\',\n]', replacesLocalEdit: false },
      ],
      constructs: [{ file: 'src/api.check.ts', type: 'check', logicalId: 'api', before: unchanged, after: unchanged }],
    }
    expect(uncoloured(formatWriteBackUpdated({ writeBack, project, cwd }))).toBe([
      'Updated your code · 2 properties in 1 file',
      '',
      '~ ApiCheck api  src/api.check.ts',
      '    name: \'API\' → \'API v2\'',
      // A value written over several lines is shown on one.
      '    tags: not set → [ \'a\', ]',
      '',
    ].join('\n'))
  })
})

describe('formatWriteBackSkipped', () => {
  it('groups what was not written by resource, each property with its reason', () => {
    const writeBack: WriteBackPlan = {
      ...empty,
      skipped: [
        { type: 'check-group', logicalId: 'grp', property: '/alertChannels/7', reason: 'references another resource' },
        { type: 'check', logicalId: 'api', property: 'tags', reason: 'your code also changed it since the last deploy; merge by hand' },
        { type: 'check-group', logicalId: 'grp', property: 'name', reason: 'name is the variable title, not a plain literal' },
        // A reason about the whole resource has no property.
        { type: 'check', logicalId: 'api', reason: 'src/api.check.ts: its options are not a plain object literal' },
        // A resource the project does not declare is named by its type.
        { type: 'dashboard', logicalId: 'gone', reason: 'not found in the project' },
      ],
    }
    expect(uncoloured(formatWriteBackSkipped({ writeBack, project, cwd }))).toBe([
      'Not updated · edit these by hand',
      '',
      '! CheckGroupV2 grp  src/groups.ts',
      // A path Checkly reports is shown dotted, like a property of the code.
      `    ${'alertChannels.7'.padEnd(15)}  references another resource`,
      `    ${'name'.padEnd(15)}  name is the variable title, not a plain literal`,
      '',
      '! ApiCheck api  src/api.check.ts',
      '    tags  your code also changed it since the last deploy; merge by hand',
      '    src/api.check.ts: its options are not a plain object literal',
      '',
      '! Dashboard gone',
      '    not found in the project',
      '',
    ].join('\n'))
  })
})
