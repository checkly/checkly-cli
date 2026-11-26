import { describe, expect, it } from 'vitest'

import type { DiffEntry } from '../../../rest/projects.js'
import { nodeVersionLines, type NodeVersionRequest } from '../node-versions.js'

const DEV_ENGINES = 'package.json devEngines.runtime'

function request (logicalId: string, version = '^26.13.0', source = DEV_ENGINES): NodeVersionRequest {
  return { logicalId, version, source }
}

function checkEntry (logicalId: string, extra: Partial<DiffEntry> = {}): DiffEntry {
  return { type: 'check', logicalId, action: 'UPDATE', ...extra }
}

describe('nodeVersionLines', () => {
  it('names the release from the check\'s diff entry', () => {
    expect(nodeVersionLines([request('suite')], [checkEntry('suite', { resolvedEngineVersion: '26.13.0' })]))
      .toEqual(['Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.'])
  })

  it('ends the line after the source when the entry has no release field', () => {
    expect(nodeVersionLines([request('suite')], [checkEntry('suite')]))
      .toEqual(['Node.js ^26.13.0 (package.json devEngines.runtime).'])
  })

  it('ends the line after the source when the release is null', () => {
    expect(nodeVersionLines([request('suite')], [checkEntry('suite', { resolvedEngineVersion: null })]))
      .toEqual(['Node.js ^26.13.0 (package.json devEngines.runtime).'])
  })

  it('ends the line after the source when the check has no diff entry', () => {
    expect(nodeVersionLines([request('suite')], []))
      .toEqual(['Node.js ^26.13.0 (package.json devEngines.runtime).'])
  })

  it('prints one line for checks that share the request, the source and the release', () => {
    const diff = [
      checkEntry('first', { resolvedEngineVersion: '26.13.0' }),
      checkEntry('second', { resolvedEngineVersion: '26.13.0', action: 'UNCHANGED' }),
    ]
    expect(nodeVersionLines([request('first'), request('second')], diff))
      .toEqual(['Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.'])
  })

  it('prints one line per distinct request, source and release, in the order of the checks', () => {
    const diff = [
      checkEntry('detected', { resolvedEngineVersion: '26.13.0' }),
      checkEntry('pinned', { resolvedEngineVersion: '24.11.0' }),
      checkEntry('other-release', { resolvedEngineVersion: '26.14.0' }),
    ]
    const requests = [
      request('pinned', '24.11.0', 'Engine.node() in __checks__/pinned.check.ts'),
      request('detected'),
      request('other-release'),
    ]
    expect(nodeVersionLines(requests, diff)).toEqual([
      'Node.js 24.11.0 (Engine.node() in __checks__/pinned.check.ts) runs 24.11.0.',
      'Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.',
      'Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.14.0.',
    ])
  })

  it('reads the release off the check entry, not another resource with the same logical id', () => {
    const diff = [
      { type: 'alert-channel', logicalId: 'suite', action: 'UPDATE', resolvedEngineVersion: '22.0.0' },
      checkEntry('suite', { resolvedEngineVersion: '26.13.0' }),
    ]
    expect(nodeVersionLines([request('suite')], diff))
      .toEqual(['Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.'])
  })

  it('prints nothing without a Node.js request', () => {
    expect(nodeVersionLines([], [checkEntry('suite', { resolvedEngineVersion: '26.13.0' })])).toEqual([])
  })
})
