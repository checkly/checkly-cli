import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CheckGroupV1 } from '../../../constructs/check-group-v1.js'
import { CheckGroupV2 } from '../../../constructs/check-group-v2.js'
import { EmailAlertChannel } from '../../../constructs/email-alert-channel.js'
import { Project } from '../../../constructs/project.js'
import { type ConstructExport, Session } from '../../../constructs/session.js'
import { idKey } from '../import-shape.js'
import { constructVariableNames } from '../variable-names.js'

/**
 * The name each referenceable construct has in the user's code
 * (`variable-names.ts`): the export name, else the declaration in the file
 * that creates the construct, else none.
 */

let project: Project
let directory: string

beforeEach(() => {
  Session.reset()
  Session.project = new Project('proj', { name: 'Project' })
  project = Session.project
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'variable-names-'))
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

/** A group with the logical id `grp`, attributed to a file holding `source`. */
function groupDeclaredIn (fileName: string, source: string): { group: CheckGroupV2, filePath: string } {
  const filePath = path.join(directory, fileName)
  fs.writeFileSync(filePath, source)
  const group = new CheckGroupV2('grp', { name: 'Website Group' })
  group.checkFileAbsolutePath = filePath
  return { group, filePath }
}

const nameOfGroup = (exports: ConstructExport[]) =>
  constructVariableNames(project, exports).get(idKey('check-group', 'grp'))

describe('constructVariableNames', () => {
  it('reads the name of an exported declaration in a module that is not a check file', () => {
    groupDeclaredIn('groups.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      export const websiteTeam = new CheckGroupV2('grp', { name: 'Website Group' })
    `)
    expect(nameOfGroup([])).toBe('websiteTeam')
  })

  it('reads the name of a declaration that is not exported', () => {
    groupDeclaredIn('api.check.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      const local = new CheckGroupV2('grp', { name: 'Website Group' })
    `)
    expect(nameOfGroup([])).toBe('local')
  })

  it('reads a JavaScript file, and a class imported under another name', () => {
    groupDeclaredIn('groups.js', `
      const { CheckGroupV2: Group } = require('checkly/constructs')
      const websiteTeam = new Group('grp', { name: 'Website Group' })
      module.exports = { websiteTeam }
    `)
    expect(nameOfGroup([])).toBe('websiteTeam')
  })

  it('tells the constructs of one file apart by logical id', () => {
    const { filePath } = groupDeclaredIn('groups.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      export const first = new CheckGroupV2('grp', { name: 'Website Group' })
      export const second = new CheckGroupV2('other', { name: 'Other' })
    `)
    const other = new CheckGroupV2('other', { name: 'Other' })
    other.checkFileAbsolutePath = filePath
    const names = constructVariableNames(project, [])
    expect(names.get(idKey('check-group', 'grp'))).toBe('first')
    expect(names.get(idKey('check-group', 'other'))).toBe('second')
  })

  it('reads a declaration that uses another name checkly exports the class by', () => {
    const filePath = path.join(directory, 'groups.ts')
    fs.writeFileSync(filePath, `
      import { CheckGroup } from 'checkly/constructs'
      export const legacy = new CheckGroup('legacy', { name: 'Legacy' })
    `)
    const group = new CheckGroupV1('legacy', { name: 'Legacy' })
    group.checkFileAbsolutePath = filePath
    expect(constructVariableNames(project, []).get(idKey('check-group', 'legacy'))).toBe('legacy')
  })

  it('prefers the declaration to a name another check file passes the construct on by', () => {
    groupDeclaredIn('groups.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      export const websiteTeam = new CheckGroupV2('grp', { name: 'Website Group' })
    `)
    const elsewhere = path.join(directory, 'api.check.ts')
    expect(nameOfGroup([{ type: 'check-group', logicalId: 'grp', filePath: elsewhere, exportName: 'team' }]))
      .toBe('websiteTeam')
  })

  it('prefers the name the construct is exported by', () => {
    const { filePath } = groupDeclaredIn('api.check.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      const local = new CheckGroupV2('grp', { name: 'Website Group' })
      export { local as websiteTeam }
    `)
    const exports = [{ type: 'check-group', logicalId: 'grp', filePath, exportName: 'websiteTeam' }]
    expect(nameOfGroup(exports)).toBe('websiteTeam')
  })

  it('settles several exports of the declaring file with the name the declaration uses', () => {
    const { filePath } = groupDeclaredIn('api.check.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      export const websiteTeam = new CheckGroupV2('grp', { name: 'Website Group' })
      export { websiteTeam as group }
    `)
    expect(nameOfGroup([
      { type: 'check-group', logicalId: 'grp', filePath, exportName: 'group' },
      { type: 'check-group', logicalId: 'grp', filePath, exportName: 'websiteTeam' },
    ])).toBe('websiteTeam')
  })

  it('uses an export name where no declaration can be read: a construct made by a function', () => {
    const { filePath } = groupDeclaredIn('api.check.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      const make = (id: string) => new CheckGroupV2(id, { name: 'Website Group' })
      export const websiteTeam = make('grp')
    `)
    expect(nameOfGroup([])).toBeUndefined()
    const exports = [{ type: 'check-group', logicalId: 'grp', filePath, exportName: 'websiteTeam' }]
    expect(nameOfGroup(exports)).toBe('websiteTeam')
  })

  it('does not take a default export or another type\'s export for a name', () => {
    const { filePath } = groupDeclaredIn('api.check.ts', `
      import { CheckGroupV2 } from 'checkly/constructs'
      export default make()
    `)
    expect(nameOfGroup([
      { type: 'check-group', logicalId: 'grp', filePath, exportName: 'default' },
      { type: 'alert-channel', logicalId: 'grp', filePath, exportName: 'channel' },
    ])).toBeUndefined()
  })

  it.each([
    ['inside a function', `
      import { CheckGroupV2 } from 'checkly/constructs'
      export function make () {
        const inner = new CheckGroupV2('grp', { name: 'Website Group' })
        return inner
      }
    `],
    ['declared twice', `
      import { CheckGroupV2 } from 'checkly/constructs'
      const one = new CheckGroupV2('grp', { name: 'Website Group' })
      const two = new CheckGroupV2('grp', { name: 'Website Group' })
    `],
    ['destructured', `
      import { CheckGroupV2 } from 'checkly/constructs'
      const { logicalId } = new CheckGroupV2('grp', { name: 'Website Group' })
    `],
    ['of a class that is not checkly\'s', `
      import { CheckGroupV2 } from './my-constructs'
      const mine = new CheckGroupV2('grp', { name: 'Website Group' })
    `],
    ['in a file that does not parse', `
      const broken = new CheckGroupV2('grp', {
    `],
  ])('names nothing for a construct %s', (_case, source) => {
    groupDeclaredIn('groups.ts', source)
    expect(nameOfGroup([])).toBeUndefined()
  })

  it('names nothing for a construct whose file cannot be read, or that has none', () => {
    const group = new CheckGroupV2('grp', { name: 'Website Group' })
    group.checkFileAbsolutePath = path.join(directory, 'missing.ts')
    const email = new EmailAlertChannel('email', { address: 'ops@example.com' })
    email.checkFileAbsolutePath = undefined
    expect(constructVariableNames(project, []).size).toBe(0)
  })

  it('leaves out a reference construct', () => {
    const filePath = path.join(directory, 'groups.ts')
    fs.writeFileSync(filePath, `
      import { CheckGroupV2 } from 'checkly/constructs'
      export const existing = CheckGroupV2.fromId(4242)
    `)
    const reference = CheckGroupV2.fromId(4242)
    const exports = [{ type: 'check-group', logicalId: reference.logicalId, filePath, exportName: 'existing' }]
    expect(constructVariableNames(project, exports).size).toBe(0)
  })
})
