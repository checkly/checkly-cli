import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { PNpmDetector } from '../package-files/package-manager.js'
import {
  findUnrepairedPatchKeys,
  PatchConfigFile,
  planPatchFilter,
  readLockfilePatchHashes,
  readPatchedDependencies,
  rewriteYamlSection,
  verifyRewrite,
} from '../patched-dependencies.js'

const PNPM_PATCHED_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'pnpm-patched-workspace')

const MS_HASH = '8efb625dd8ccb88e78507bea1f647ed25671bcda20a8554ea02a4122021736bb'
const EE_FIRST_HASH = '90b918fd6167721e405a502ac35adb29ec15497947e9d3b032d6da16a460b4af'

const workspaceYaml = (entries: string[]): PatchConfigFile => ({
  archivePath: 'pnpm-workspace.yaml',
  kind: 'pnpm-workspace.yaml',
  content: [
    'packages:',
    '  - packages/*',
    'minimumReleaseAge: 2880',
    ...entries.length > 0 ? ['patchedDependencies:', ...entries] : [],
    '',
  ].join('\n'),
})

const packageJson = (entries: Record<string, string>): PatchConfigFile => ({
  archivePath: 'package.json',
  kind: 'package.json',
  content: JSON.stringify({
    name: 'fixture',
    private: true,
    pnpm: { patchedDependencies: entries },
  }, null, 2),
})

// A lockfile carrying both declarations in its section, but a `patch_hash=`
// marker only for `ms` — the shape a prune produces once the member consuming
// the other patched package has been pruned away.
const prunedLockfile = [
  `lockfileVersion: '9.0'`,
  ``,
  `patchedDependencies:`,
  `  ee-first@1.1.1:`,
  `    hash: ${EE_FIRST_HASH}`,
  `    path: patches/ee-first@1.1.1.patch`,
  `  ms@2.1.3:`,
  `    hash: ${MS_HASH}`,
  `    path: patches/ms@2.1.3.patch`,
  ``,
  `importers:`,
  ``,
  `  packages/used:`,
  `    dependencies:`,
  `      ms:`,
  `        specifier: 2.1.3`,
  `        version: 2.1.3(patch_hash=${MS_HASH})`,
  ``,
  `snapshots:`,
  ``,
  `  ms@2.1.3(patch_hash=${MS_HASH}): {}`,
  ``,
].join('\n')

// The same workspace before pruning: both patches applied to something.
const originalLockfile = prunedLockfile
  .replace('importers:\n', 'importers:\n\n  packages/absent:\n    dependencies:\n      ee-first:\n'
  + `        specifier: 1.1.1\n        version: 1.1.1(patch_hash=${EE_FIRST_HASH})\n`)

const bothEntries = [
  `  ms@2.1.3: patches/ms@2.1.3.patch`,
  `  ee-first@1.1.1: patches/ee-first@1.1.1.patch`,
]

describe('readPatchedDependencies()', () => {
  it('reads the top-level map from pnpm-workspace.yaml', () => {
    expect(readPatchedDependencies(workspaceYaml(bothEntries))).toEqual([
      { key: 'ms@2.1.3', patchPath: 'patches/ms@2.1.3.patch' },
      { key: 'ee-first@1.1.1', patchPath: 'patches/ee-first@1.1.1.patch' },
    ])
  })

  it('reads the pnpm field from package.json', () => {
    expect(readPatchedDependencies(packageJson({ 'ms@2.1.3': 'patches/ms@2.1.3.patch' }))).toEqual([
      { key: 'ms@2.1.3', patchPath: 'patches/ms@2.1.3.patch' },
    ])
  })

  it('reports no declarations when the config has no section', () => {
    expect(readPatchedDependencies(workspaceYaml([]))).toEqual([])
    expect(readPatchedDependencies({
      archivePath: 'package.json',
      kind: 'package.json',
      content: '{"name":"fixture"}',
    })).toEqual([])
  })

  it.each([['empty', ''], ['comment-only', '# nothing configured yet\n']])(
    'reads a %s pnpm-workspace.yaml as declaring nothing', (_label, content) => {
      expect(readPatchedDependencies({
        archivePath: 'pnpm-workspace.yaml',
        kind: 'pnpm-workspace.yaml',
        content,
      })).toEqual([])
    })

  it('declines an unparseable config', () => {
    expect(readPatchedDependencies({
      archivePath: 'package.json',
      kind: 'package.json',
      content: '{not json',
    })).toBeUndefined()
  })

  it('declines a declaration whose value is not a patch path', () => {
    expect(readPatchedDependencies({
      archivePath: 'pnpm-workspace.yaml',
      kind: 'pnpm-workspace.yaml',
      content: 'patchedDependencies:\n  ms@2.1.3:\n    path: patches/ms.patch\n',
    })).toBeUndefined()
  })
})

describe('readLockfilePatchHashes()', () => {
  it('reads the pnpm 10 object shape', () => {
    expect(readLockfilePatchHashes(prunedLockfile)).toEqual(new Map([
      ['ee-first@1.1.1', EE_FIRST_HASH],
      ['ms@2.1.3', MS_HASH],
    ]))
  })

  it('reads the pnpm 11 bare-hash shape', () => {
    const content = `lockfileVersion: '9.0'\n\npatchedDependencies:\n  ms@2.1.3: ${MS_HASH}\n`
    expect(readLockfilePatchHashes(content)).toEqual(new Map([['ms@2.1.3', MS_HASH]]))
  })

  it('reports an empty map when the lockfile records no patches', () => {
    expect(readLockfilePatchHashes(`lockfileVersion: '9.0'\n`)).toEqual(new Map())
  })

  // Every decline below must stay a decline: a caller that read one as "no
  // patches recorded" would classify every declaration as unused and strip
  // patches that are actually in force.
  it('declines an unparseable lockfile', () => {
    expect(readLockfilePatchHashes('\tbad: [yaml')).toBeUndefined()
  })

  it('declines a lockfile that is not a mapping', () => {
    expect(readLockfilePatchHashes('- a\n- b\n')).toBeUndefined()
  })

  it('declines a patchedDependencies section that is not a mapping', () => {
    expect(readLockfilePatchHashes(`patchedDependencies:\n  - ms@2.1.3\n`)).toBeUndefined()
  })

  it.each([
    ['no hash', `patchedDependencies:\n  ms@2.1.3:\n    path: patches/ms.patch\n`],
    ['an empty hash', `patchedDependencies:\n  ms@2.1.3:\n    hash: ''\n`],
  ])('declines an entry with %s', (_label, content) => {
    expect(readLockfilePatchHashes(content)).toBeUndefined()
  })
})

describe('verifyRewrite()', () => {
  // The safety net behind every rewrite: if a serializer ever dropped or
  // reshaped content the edit did not target, this is what catches it.
  it('rejects a rewrite that lost content the edit did not target', () => {
    expect(verifyRewrite('{"a":1,"b":2}', '{"a":1}', new Set(), JSON.parse)).toBeUndefined()
  })

  it('rejects a rewrite that changed an unrelated value', () => {
    expect(verifyRewrite('{"a":1}', '{"a":2}', new Set(), JSON.parse)).toBeUndefined()
  })

  it('accepts a rewrite that removed exactly the targeted keys', () => {
    const original = '{"patchedDependencies":{"ms@2.1.3":"p","ee@1":"q"},"other":true}'
    const rewritten = '{"patchedDependencies":{"ms@2.1.3":"p"},"other":true}'
    expect(verifyRewrite(original, rewritten, new Set(['ee@1']), JSON.parse)).toEqual(rewritten)
  })

  it('declines when the rewritten content cannot be reparsed', () => {
    expect(verifyRewrite('{"a":1}', '{not json', new Set(), JSON.parse)).toBeUndefined()
  })
})

describe('rewriteYamlSection()', () => {
  it('declines unparseable YAML rather than returning it unchanged', () => {
    expect(rewriteYamlSection('\tbad: [yaml', new Set(['ms@2.1.3']))).toBeUndefined()
  })

  it('declines a patchedDependencies section that is not a mapping', () => {
    expect(rewriteYamlSection(`patchedDependencies: notamap\n`, new Set(['ms@2.1.3'])))
      .toBeUndefined()
  })

  it('leaves a document without the section untouched', () => {
    const content = `lockfileVersion: '9.0'\n`
    expect(rewriteYamlSection(content, new Set(['ms@2.1.3']))).toEqual(content)
  })
})

describe('planPatchFilter()', () => {
  const plan = (configs: PatchConfigFile[], overrides: Partial<{
    originalLockfileContent: string
    prunedLockfileContent: string
  }> = {}) => planPatchFilter({
    configs,
    originalLockfileContent: originalLockfile,
    prunedLockfileContent: prunedLockfile,
    ...overrides,
  })

  it('drops the declaration whose patch no longer applies and keeps the one that does', () => {
    const result = plan([workspaceYaml(bothEntries)])

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual(['patches/ee-first@1.1.1.patch'])
    expect(result?.rewrittenConfig.archivePath).toEqual('pnpm-workspace.yaml')
    expect(result?.rewrittenConfig.content).toContain('ms@2.1.3: patches/ms@2.1.3.patch')
    expect(result?.rewrittenConfig.content).not.toContain('ee-first')
    expect(result?.lockfileContent).toContain(`ms@2.1.3:`)
    expect(result?.lockfileContent).not.toContain('ee-first')
  })

  it('preserves unrelated config content around the edit', () => {
    const result = plan([workspaceYaml(bothEntries)])

    expect(result?.rewrittenConfig.content).toContain('minimumReleaseAge: 2880')
    expect(result?.rewrittenConfig.content).toContain('- packages/*')
  })

  it('removes the section entirely when its last entry goes', () => {
    const onlyUnused = [`  ee-first@1.1.1: patches/ee-first@1.1.1.patch`]
    const result = plan([workspaceYaml(onlyUnused)])

    expect(result?.rewrittenConfig.content).not.toContain('patchedDependencies')
    expect(result?.rewrittenConfig.content).toContain('minimumReleaseAge: 2880')
  })

  it('edits the package.json site when that is where the patches are declared', () => {
    const result = plan([
      workspaceYaml([]),
      packageJson({
        'ms@2.1.3': 'patches/ms@2.1.3.patch',
        'ee-first@1.1.1': 'patches/ee-first@1.1.1.patch',
      }),
    ])

    expect(result?.rewrittenConfig.archivePath).toEqual('package.json')
    expect(JSON.parse(result!.rewrittenConfig.content).pnpm.patchedDependencies)
      .toEqual({ 'ms@2.1.3': 'patches/ms@2.1.3.patch' })
  })

  it.each([
    ['a version range', 'ee-first@^1.1.0'],
    ['a bare name', 'ee-first'],
    ['a scoped name', '@fixture/ee-first@1.1.1'],
  ])('matches %s key verbatim, exactly as the lockfile records it', (_label, key) => {
    const configs = [workspaceYaml([`  '${key}': patches/ee-first@1.1.1.patch`])]
    const withKey = (content: string) => content
      .replace('  ee-first@1.1.1:', `  '${key}':`)

    const result = planPatchFilter({
      configs,
      originalLockfileContent: withKey(originalLockfile),
      prunedLockfileContent: withKey(prunedLockfile),
    })

    expect(result?.unusedKeys).toEqual([key])
  })

  it('leaves the bundle alone when more than one config declares patches', () => {
    // pnpm picks one site and ignores the other wholesale, and which one wins
    // depends on the major, so neither can be edited safely.
    expect(plan([
      workspaceYaml(bothEntries),
      packageJson({ 'ms@2.1.3': 'patches/ms@2.1.3.patch' }),
    ])).toBeUndefined()
  })

  it('keeps a declaration the original lockfile never recorded', () => {
    // The pnpm that wrote the lockfile may not read the site the key was
    // declared in, so its absence is no evidence that the patch is unused.
    const withoutEeFirst = originalLockfile
      .replace(`  ee-first@1.1.1:\n    hash: ${EE_FIRST_HASH}\n    path: patches/ee-first@1.1.1.patch\n`, '')

    expect(plan([workspaceYaml(bothEntries)], { originalLockfileContent: withoutEeFirst }))
      .toBeUndefined()
  })

  it('does nothing when every declared patch still applies', () => {
    expect(plan([workspaceYaml(bothEntries)], { prunedLockfileContent: originalLockfile }))
      .toBeUndefined()
  })

  it('keeps a patch file a surviving declaration still references', () => {
    const shared = [
      `  ms@2.1.3: patches/shared.patch`,
      `  ee-first@1.1.1: patches/shared.patch`,
    ]
    const result = plan([workspaceYaml(shared)])

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual([])
  })

  it.each([
    ['the survivor spells the shared path differently', './patches/shared.patch', 'patches/shared.patch'],
    ['the dropped key spells it differently', 'patches/shared.patch', './patches/shared.patch'],
    ['a spelling needs normalizing', 'patches/sub/../shared.patch', 'patches/shared.patch'],
  ])('keeps a shared patch file when %s', (_label, keptPath, unusedPath) => {
    // Both declarations name one file; comparing the raw spellings rather than
    // the archive paths would delete a file the surviving declaration needs.
    const result = plan([workspaceYaml([
      `  ms@2.1.3: ${keptPath}`,
      `  ee-first@1.1.1: ${unusedPath}`,
    ])])

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual([])
  })

  it('drops no patch file at all when a surviving declaration points outside the bundle root', () => {
    // An escaping path cannot be compared against the in-root candidates, so
    // it might alias one of them; the declarations still go.
    const result = plan([workspaceYaml([
      `  ms@2.1.3: ../outside/shared.patch`,
      `  ee-first@1.1.1: patches/ee-first@1.1.1.patch`,
    ])])

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual([])
  })

  it('declines when any bundled config cannot be parsed', () => {
    // Filtering on the readable site alone would delete patch files the
    // unreadable one may still declare. A UTF-8 BOM is enough to make
    // JSON.parse reject a manifest that fs.readFile happily returned.
    expect(plan([
      { archivePath: 'package.json', kind: 'package.json', content: '\uFEFF{"name":"fixture"}' },
      workspaceYaml(bothEntries),
    ])).toBeUndefined()
  })

  it('declines when a config has duplicate keys', () => {
    expect(plan([{
      archivePath: 'pnpm-workspace.yaml',
      kind: 'pnpm-workspace.yaml',
      content: 'packages:\n  - a\npackages:\n  - b\n',
    }, packageJson({ 'ee-first@1.1.1': 'patches/ee-first@1.1.1.patch' })])).toBeUndefined()
  })

  it('drops nothing when the original lockfile shows no patch applied anywhere', () => {
    // A lockfile this module cannot read markers out of must degrade to
    // dropping nothing, never to dropping every declaration at once.
    const markerless = originalLockfile.replace(/\(patch_hash=[^)]*\)/g, '')
    expect(plan([workspaceYaml(bothEntries)], { originalLockfileContent: markerless }))
      .toBeUndefined()
  })

  it.each([
    ['an empty path', `  ee-first@1.1.1: ''`],
    ['a directory path', `  ee-first@1.1.1: patches/`],
    ['a Windows-drive path', `  ee-first@1.1.1: 'E:\\proj\\patches\\ee.patch'`],
    ['an absolute path', `  ee-first@1.1.1: /tmp/patches/ee.patch`],
    ['a path that traverses out and back', `  ee-first@1.1.1: patches/sub/../../package.json`],
  ])('never lists %s among the files to drop', (_label, entry) => {
    const result = plan([workspaceYaml([`  ms@2.1.3: patches/ms@2.1.3.patch`, entry])])

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual([])
  })

  it('declines when the pruned lockfile cannot be parsed', () => {
    // Treating an unreadable lockfile as "records no patches" would mark every
    // declaration unused and silently unpatch every dependency.
    expect(plan([workspaceYaml(bothEntries)], { prunedLockfileContent: '\tbad: [yaml' }))
      .toBeUndefined()
  })

  it('declines when the original lockfile cannot be parsed', () => {
    expect(plan([workspaceYaml(bothEntries)], { originalLockfileContent: '\tbad: [yaml' }))
      .toBeUndefined()
  })

  it('never drops a patch file that resolves outside the bundle root', () => {
    const escaping = [`  ee-first@1.1.1: ../outside/ee-first.patch`]
    const result = plan([workspaceYaml(escaping)])

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual([])
  })

  it('repairs the config but spares a patch the sectionless lockfile still marks as applied', () => {
    // A lockfile that lost the section but kept its `patch_hash=` markers still
    // pins that patch; dropping its declaration and file would leave the
    // lockfile pinning a patch nothing declares.
    const sectionless = prunedLockfile
      .replace(/patchedDependencies:\n(?: {2}\S[^\n]*\n(?: {4}[^\n]*\n)*)+/, '')
    const result = plan([workspaceYaml(bothEntries)], { prunedLockfileContent: sectionless })

    expect(result?.unusedKeys).toEqual(['ee-first@1.1.1'])
    expect(result?.droppedPatchPaths).toEqual(['patches/ee-first@1.1.1.patch'])
    expect(result?.lockfileContent).toEqual(sectionless)
    expect(result?.rewrittenConfig.content).toContain('ms@2.1.3')
    expect(result?.rewrittenConfig.content).not.toContain('ee-first')
  })
})

describe('findUnrepairedPatchKeys()', () => {
  it('reports a declaration the shipped lockfile no longer records', () => {
    const shipped = prunedLockfile
      .replace(`  ee-first@1.1.1:\n    hash: ${EE_FIRST_HASH}\n    path: patches/ee-first@1.1.1.patch\n`, '')

    expect(findUnrepairedPatchKeys({
      configs: [workspaceYaml(bothEntries)],
      originalLockfileContent: originalLockfile,
      shippedLockfileContent: shipped,
    })).toEqual(['ee-first@1.1.1'])
  })

  it('stays silent once the declaration has been filtered out of both', () => {
    const result = planPatchFilter({
      configs: [workspaceYaml(bothEntries)],
      originalLockfileContent: originalLockfile,
      prunedLockfileContent: prunedLockfile,
    })

    expect(findUnrepairedPatchKeys({
      configs: [{ ...workspaceYaml(bothEntries), content: result!.rewrittenConfig.content }],
      originalLockfileContent: originalLockfile,
      shippedLockfileContent: result!.lockfileContent,
    })).toEqual([])
  })

  it('stays silent for a declaration the original lockfile never recorded', () => {
    const withoutSection = originalLockfile
      .replace(/patchedDependencies:\n(?: {2}\S[^\n]*\n(?: {4}[^\n]*\n)*)+/, '')

    expect(findUnrepairedPatchKeys({
      configs: [workspaceYaml(bothEntries)],
      originalLockfileContent: withoutSection,
      shippedLockfileContent: withoutSection,
    })).toEqual([])
  })
})

// The whole design rests on a hand-applied YAML edit producing exactly the
// bytes pnpm itself would write for a config that never declared the patch. If
// a future pnpm changes its lockfile formatting, this fails rather than letting
// the CLI ship a subtly different lockfile.
describe('rewriteYamlSection() against real pnpm', () => {
  const tempDirs: string[] = []

  afterAll(async () => {
    await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })))
  })

  // Materializes what the pruner feeds its temp-dir install: the bundle's real
  // manifests, dependency-free placeholders for the members it omits, and the
  // patch files (pnpm hashes every declared patch during resolution).
  const materialize = async (declaredPatches: string[]): Promise<string> => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'patched-deps-spec-')))
    tempDirs.push(dir)

    await fs.mkdir(path.join(dir, 'packages/used'), { recursive: true })
    await fs.mkdir(path.join(dir, 'packages/shimmed'), { recursive: true })
    await fs.mkdir(path.join(dir, 'packages/absent'), { recursive: true })
    await fs.mkdir(path.join(dir, 'patches'), { recursive: true })

    for (const file of ['package.json', 'pnpm-lock.yaml', 'packages/used/package.json']) {
      await fs.copyFile(path.join(PNPM_PATCHED_FIXTURE_ROOT, file), path.join(dir, file))
    }
    for (const name of ['@fixture/shimmed', '@fixture/absent']) {
      const target = name === '@fixture/shimmed' ? 'packages/shimmed' : 'packages/absent'
      await fs.writeFile(
        path.join(dir, target, 'package.json'),
        JSON.stringify({ name, version: '1.0.0' }),
      )
    }
    for (const patch of declaredPatches) {
      await fs.copyFile(
        path.join(PNPM_PATCHED_FIXTURE_ROOT, 'patches', patch),
        path.join(dir, 'patches', patch),
      )
    }

    const entries = declaredPatches.map(patch => `  ${patch.replace(/\.patch$/, '')}: patches/${patch}`)
    await fs.writeFile(
      path.join(dir, 'pnpm-workspace.yaml'),
      ['packages:', '  - packages/*', 'patchedDependencies:', ...entries, ''].join('\n'),
    )

    // The production command, not a copy of it: this test's whole point is that
    // the bytes pnpm writes under the flags the pruner actually passes can be
    // reproduced by editing, so it must break if those flags change.
    const runnable = new PNpmDetector().lockfileOnlyInstallCommand()
    const install = spawnSync(runnable.executable, runnable.args,
      { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' })
    expect(install.status, install.stderr ?? '').toEqual(0)

    return await fs.readFile(path.join(dir, 'pnpm-lock.yaml'), 'utf8')
  }

  it('reproduces the lockfile pnpm writes when the unused patch is not declared', async () => {
    const withUnused = await materialize(['ms@2.1.3.patch', 'ee-first@1.1.1.patch'])
    // Guards the comparison below from passing vacuously: pnpm must actually
    // have kept the now-unused declaration in the section for the edit to have
    // anything to remove.
    expect(withUnused).toContain('ee-first@1.1.1:')
    expect(withUnused).not.toContain(`patch_hash=${EE_FIRST_HASH}`)

    const edited = rewriteYamlSection(withUnused, new Set(['ee-first@1.1.1']))
    const authentic = await materialize(['ms@2.1.3.patch'])

    expect(edited).toEqual(authentic)
  }, 120_000)
})
