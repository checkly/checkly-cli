import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { PhysicalFile } from '../check-parser/parser.js'
import { resolveBundleFiles } from '../symlink-resolver.js'
import { findFilesWithPattern } from '../util.js'

const sandboxes: string[] = []

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

/** A symlink in a tree spec. The target is written to the link verbatim. */
function link (target: string) {
  return { target }
}

type TreeSpec = Record<string, string | { target: string }>

/**
 * Files first, then links. Windows picks a symlink's type by looking at its
 * target, and falls back to a file-type link when the target does not exist yet
 * — which cannot then be opened as a directory. Creating every target first
 * keeps the links directory-typed on all platforms.
 */
async function makeTree (root: string, spec: TreeSpec): Promise<void> {
  const links: Array<[string, string]> = []

  for (const [relative, value] of Object.entries(spec)) {
    const absolute = path.join(root, relative)
    await fs.mkdir(path.dirname(absolute), { recursive: true })

    if (typeof value === 'string') {
      await fs.writeFile(absolute, value)
    } else {
      links.push([absolute, value.target])
    }
  }

  for (const [absolute, target] of links) {
    await fs.symlink(target, absolute)
  }
}

async function makeSandbox (spec: TreeSpec): Promise<string> {
  // Resolve the path: tmpdir() is itself reached through a symlink on macOS, and
  // that is a separate case with its own test below.
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'symlink-resolver-')))
  sandboxes.push(root)
  await makeTree(root, spec)
  return root
}

interface BundleOptions {
  ignore?: string[]
  /** Where the include patterns and ignore patterns are relative to. */
  cwd?: string
  /** The archive root. Defaults to the sandbox root. */
  bundleRoot?: string
  /** Spelled paths whose traversed links must travel with the bundle. */
  referencedPaths?: string[]
}

async function bundle (root: string, patterns: string[], options: BundleOptions = {}): Promise<PhysicalFile[]> {
  const { ignore = [], cwd = root, bundleRoot = root, referencedPaths } = options

  const matchedPaths = await findFilesWithPattern(cwd, patterns, ignore)

  const files = await resolveBundleFiles({
    matchedPaths,
    bundleRoot,
    ignoreCwd: cwd,
    ignorePatterns: ignore,
    referencedPaths,
  })

  // The archive must never contain a symlink with entries beneath it, whatever
  // the tree or the pattern. Asserting it on every result rather than in
  // individual tests means a new case cannot forget to check it.
  expectNoSymlinkHasChildren(files)

  return files
}

/** Renders entries as `path` or `path -> target`, so tests read like a tar listing. */
function entries (files: PhysicalFile[]): string[] {
  return files
    .map(file => file.symlinkTarget !== undefined
      ? `${file.archivePath} -> ${file.symlinkTarget}`
      : file.archivePath!)
    .sort()
}

/**
 * The condition tar cannot survive: a symlink entry with entries beneath it. One
 * path cannot be both a symlink and a directory.
 */
function expectNoSymlinkHasChildren (files: PhysicalFile[]): void {
  for (const symlink of files.filter(file => file.symlinkTarget !== undefined)) {
    const children = files
      .filter(file => file.archivePath!.startsWith(`${symlink.archivePath}/`))
      .map(file => file.archivePath)

    expect(children, `entries beneath symlink ${symlink.archivePath}`).toEqual([])
  }
}

describe('resolveBundleFiles', () => {
  it('should archive a plain file tree unchanged', async () => {
    const root = await makeSandbox({
      'tests/example.spec.ts': 'test',
      'package.json': '{}',
    })

    const files = await bundle(root, ['**/*'])

    expect(entries(files)).toEqual([
      'package.json',
      'tests/example.spec.ts',
    ])
  })

  describe('pnpm store links', () => {
    // What pnpm actually builds: node_modules/<pkg> is a link into the store,
    // and the package's own dependencies sit *next to* its directory in there.
    const store: TreeSpec = {
      'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
      'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/package.json': '{"name":"pkg"}',
      'node_modules/.pnpm/pkg@1.0.0/node_modules/dep': link('../../dep@2.0.0/node_modules/dep'),
      'node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js': 'dep',
      'node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
      'package.json': '{}',
    }

    it('should keep the link, bundle its target, and follow sibling dependencies', async () => {
      const root = await makeSandbox(store)

      const files = await bundle(root, ['node_modules/pkg/**'])

      expect(entries(files)).toEqual([
        'node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/dep -> ../../dep@2.0.0/node_modules/dep',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/package.json',
        'node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
      ])
      expectNoSymlinkHasChildren(files)
    })

    it.each([
      ['node_modules/pkg/**'],
      ['node_modules/pkg/**/*'],
      ['node_modules/**'],
      ['**/node_modules/**'],
    ])('should produce the same archive for pattern %s', async pattern => {
      const root = await makeSandbox(store)

      const files = await bundle(root, [pattern])

      // Every shape converges: the link, its target, and the target's own
      // dependencies. `node_modules/pkg/**/*` matches only files *beneath* the
      // link and never the link itself, so this is not free.
      expect(entries(files)).toEqual(expect.arrayContaining([
        'node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/dep -> ../../dep@2.0.0/node_modules/dep',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
        'node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
      ]))
      expectNoSymlinkHasChildren(files)
    })

    it('should follow scoped packages and their scoped dependencies', async () => {
      // A scoped package sits two levels below the store's node_modules, so its
      // dependencies are not where an unscoped package's would be.
      const root = await makeSandbox({
        'node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg/index.js': 'pkg',
        'node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@other/dep': link('../../../@other+dep@2.0.0/node_modules/@other/dep'),
        'node_modules/.pnpm/@other+dep@2.0.0/node_modules/@other/dep/index.js': 'dep',
        'node_modules/@scope/pkg': link('../.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['node_modules/@scope/pkg/**'])

      expect(entries(files)).toEqual([
        'node_modules/.pnpm/@other+dep@2.0.0/node_modules/@other/dep/index.js',
        'node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@other/dep -> ../../../@other+dep@2.0.0/node_modules/@other/dep',
        'node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg/index.js',
        'node_modules/@scope/pkg -> ../.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg',
      ])
      expectNoSymlinkHasChildren(files)
    })

    it('should bundle .bin executables, which dotfile rules would otherwise drop', async () => {
      const root = await makeSandbox({
        'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/.bin/tool': '#!/bin/sh',
        'node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['node_modules/pkg/**'])

      expect(entries(files)).toContain('node_modules/.pnpm/pkg@1.0.0/node_modules/.bin/tool')
    })

    it('should terminate when two store packages depend on each other', async () => {
      // Two packages that depend on each other is an ordinary thing for a pnpm
      // store to contain. Without a guard, collecting a's dependencies reaches b,
      // collecting b's reaches a, and the resolver never returns.
      const root = await makeSandbox({
        'node_modules/.pnpm/a@1.0.0/node_modules/a/index.js': 'a',
        'node_modules/.pnpm/a@1.0.0/node_modules/b': link('../../b@1.0.0/node_modules/b'),
        'node_modules/.pnpm/b@1.0.0/node_modules/b/index.js': 'b',
        'node_modules/.pnpm/b@1.0.0/node_modules/a': link('../../a@1.0.0/node_modules/a'),
        'node_modules/a': link('.pnpm/a@1.0.0/node_modules/a'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['node_modules/a/**'])

      expect(entries(files)).toEqual([
        'node_modules/.pnpm/a@1.0.0/node_modules/a/index.js',
        'node_modules/.pnpm/a@1.0.0/node_modules/b -> ../../b@1.0.0/node_modules/b',
        'node_modules/.pnpm/b@1.0.0/node_modules/a -> ../../a@1.0.0/node_modules/a',
        'node_modules/.pnpm/b@1.0.0/node_modules/b/index.js',
        'node_modules/a -> .pnpm/a@1.0.0/node_modules/a',
      ])
      expectNoSymlinkHasChildren(files)
    }, 20_000)

    it('should not walk a dependency graph once per path through it', async () => {
      // Each package depends on the next two, so the number of distinct paths
      // through the graph is exponential in its size while the number of
      // packages is not. Anything that traverses per-path rather than per-package
      // takes minutes here.
      const spec: TreeSpec = { 'package.json': '{}' }
      const size = 24
      for (let i = 0; i < size; i++) {
        spec[`node_modules/.pnpm/p${i}@1.0.0/node_modules/p${i}/index.js`] = `p${i}`
        for (const dependency of [i + 1, i + 2].filter(next => next < size)) {
          spec[`node_modules/.pnpm/p${i}@1.0.0/node_modules/p${dependency}`] =
            link(`../../p${dependency}@1.0.0/node_modules/p${dependency}`)
        }
      }
      spec['node_modules/p0'] = link('.pnpm/p0@1.0.0/node_modules/p0')
      const root = await makeSandbox(spec)

      const files = await bundle(root, ['node_modules/p0/**'])

      // Every package's own file, reached once.
      for (let i = 0; i < size; i++) {
        expect(entries(files)).toContain(`node_modules/.pnpm/p${i}@1.0.0/node_modules/p${i}/index.js`)
      }
    }, 20_000)

    it('should skip a link whose target the ignore patterns exclude', async () => {
      const root = await makeSandbox({
        'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
        'node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['node_modules/**'], { ignore: ['**/.pnpm/**'] })

      // Keeping the link would put a symlink to nothing in the archive: its
      // target was excluded, so it cannot travel with it.
      expect(entries(files)).toEqual([])
    })

    it('should never bundle pnpm state files, which make pnpm purge node_modules', async () => {
      const root = await makeSandbox({
        'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
        'node_modules/.pnpm/pkg@1.0.0/node_modules/.modules.yaml': 'storeDir: /elsewhere',
        'node_modules/.modules.yaml': 'storeDir: /elsewhere',
        'node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['node_modules/**'])

      expect(entries(files).filter(entry => entry.includes('.modules.yaml'))).toEqual([])
    })
  })

  describe('workspace member links', () => {
    // The customer shape: a workspace package's node_modules holds links
    // straight to sibling member directories, and the member's content reaches
    // the bundle through the import parser rather than through expansion.
    const workspace: TreeSpec = {
      'packages/x/package.json': '{"name":"@scope/x"}',
      'packages/x/src/index.ts': 'export const x = 1',
      'packages/x/tests/a.spec.ts': 'test',
      'packages/x/node_modules/.keep': '',
      'packages/c/node_modules/@scope/x': link('../../../x'),
      'packages/c/package.json': '{"name":"@scope/c"}',
      'package.json': '{}',
    }
    const members = (root: string) => [
      { path: root, name: 'workspace-root' },
      { path: path.join(root, 'packages', 'c'), name: '@scope/c' },
      { path: path.join(root, 'packages', 'x'), name: '@scope/x' },
    ]

    async function bundleWorkspace (root: string, patterns: string[], extra: BundleOptions = {}) {
      const { ignore = [], cwd = root } = extra
      const matchedPaths = await findFilesWithPattern(cwd, patterns, ignore)
      const files = await resolveBundleFiles({
        matchedPaths,
        bundleRoot: root,
        ignoreCwd: cwd,
        ignorePatterns: ignore,
        workspaceMembers: members(root),
      })
      expectNoSymlinkHasChildren(files)
      return files
    }

    it('should keep the link and the manifest, without expanding the member', async () => {
      const root = await makeSandbox(workspace)

      const files = await bundleWorkspace(root, ['node_modules/**'], {
        cwd: path.join(root, 'packages', 'c'),
      })

      // The link and the member's real package.json travel; the member's other
      // files and its node_modules do not — they are the parser's business.
      // The manifest is also what keeps the link past the prune: it occupies
      // the link's target.
      expect(entries(files)).toEqual([
        'packages/c/node_modules/@scope/x -> ../../../x',
        'packages/x/package.json',
      ])
    })

    it('should keep expansion for a member link the resolver reached on its own', async () => {
      // A pnpm store package can depend on a workspace member, giving the store
      // a member link no include pattern ever matched. The parser never reads
      // store-internal code, so nothing would supply the member's sources —
      // such links keep whole-target expansion.
      const root = await makeSandbox({
        'packages/x/package.json': '{"name":"@scope/x"}',
        'packages/x/src/index.js': 'x',
        'node_modules/.pnpm/foo@1.0.0/node_modules/foo/index.js': 'foo',
        'node_modules/.pnpm/foo@1.0.0/node_modules/@scope/x': link('../../../../../packages/x'),
        'node_modules/foo': link('.pnpm/foo@1.0.0/node_modules/foo'),
        'package.json': '{}',
      })

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'node_modules', 'foo')],
        bundleRoot: root,
        ignoreCwd: root,
        ignorePatterns: [],
        workspaceMembers: [
          { path: root, name: 'workspace-root' },
          { path: path.join(root, 'packages', 'x'), name: '@scope/x' },
        ],
      })
      expectNoSymlinkHasChildren(files)

      // The member link arrived via the store's dependency closure, not via an
      // include pattern — its target is fully expanded.
      expect(entries(files)).toEqual(expect.arrayContaining([
        'node_modules/.pnpm/foo@1.0.0/node_modules/@scope/x -> ../../../../../packages/x',
        'packages/x/package.json',
        'packages/x/src/index.js',
      ]))
    })

    it('should bundle files matched through the member link at their real paths', async () => {
      const root = await makeSandbox(workspace)

      const files = await bundleWorkspace(root, ['node_modules/@scope/x/tests/**'], {
        cwd: path.join(root, 'packages', 'c'),
      })

      expect(entries(files)).toEqual([
        'packages/c/node_modules/@scope/x -> ../../../x',
        'packages/x/package.json',
        'packages/x/tests/a.spec.ts',
      ])
    })

    it('should give a member-local pnpm store the store treatment, not the member treatment', async () => {
      // A store can live inside a member directory; its packages need expansion
      // and the sibling closure no matter where the store sits.
      const root = await makeSandbox({
        'packages/c/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
        'packages/c/node_modules/.pnpm/pkg@1.0.0/node_modules/dep': link('../../dep@2.0.0/node_modules/dep'),
        'packages/c/node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js': 'dep',
        'packages/c/node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
        'packages/c/package.json': '{"name":"@scope/c"}',
        'package.json': '{}',
      })

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'packages', 'c', 'node_modules', 'pkg')],
        bundleRoot: root,
        ignoreCwd: path.join(root, 'packages', 'c'),
        ignorePatterns: [],
        workspaceMembers: [
          { path: root, name: 'workspace-root' },
          { path: path.join(root, 'packages', 'c'), name: '@scope/c' },
        ],
      })
      expectNoSymlinkHasChildren(files)

      expect(entries(files)).toEqual([
        'packages/c/node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js',
        'packages/c/node_modules/.pnpm/pkg@1.0.0/node_modules/dep -> ../../dep@2.0.0/node_modules/dep',
        'packages/c/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
        'packages/c/node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
      ])
    })

    it('should keep expansion for a link into a member subdirectory', async () => {
      // A link into a member's subdirectory (`link:./packages/y/dist`) names
      // content the import parser will never bundle — selective treatment would
      // ship a link to nothing. Such links keep whole-target expansion, which
      // is bounded to the subdirectory.
      const root = await makeSandbox({
        'packages/y/package.json': '{"name":"@scope/y"}',
        'packages/y/dist/index.js': 'y',
        'packages/y/src/ignored-by-narrow-target.ts': 'src',
        'packages/c/node_modules/@scope/y-dist': link('../../../y/dist'),
        'packages/c/package.json': '{"name":"@scope/c"}',
        'package.json': '{}',
      })

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'packages', 'c', 'node_modules', '@scope', 'y-dist')],
        bundleRoot: root,
        ignoreCwd: path.join(root, 'packages', 'c'),
        ignorePatterns: [],
        workspaceMembers: [
          { path: root, name: 'workspace-root' },
          { path: path.join(root, 'packages', 'c'), name: '@scope/c' },
          { path: path.join(root, 'packages', 'y'), name: '@scope/y' },
        ],
      })
      expectNoSymlinkHasChildren(files)

      expect(entries(files)).toEqual([
        'packages/c/node_modules/@scope/y-dist -> ../../../y/dist',
        'packages/y/dist/index.js',
      ])
    })

    it('should keep expansion for an aliased member dependency', async () => {
      // `"ui": "file:../ui"` where the package is named @scope/ui: the parser
      // resolves imports by specifier, so `import 'ui'` never reaches the
      // member — selective treatment would ship an empty package. The name
      // mismatch routes the link back to expansion.
      const root = await makeSandbox({
        'packages/ui/package.json': '{"name":"@scope/ui"}',
        'packages/ui/src/index.js': 'ui',
        'packages/c/node_modules/ui': link('../../ui'),
        'packages/c/package.json': '{"name":"@scope/c"}',
        'package.json': '{}',
      })

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'packages', 'c', 'node_modules', 'ui')],
        bundleRoot: root,
        ignoreCwd: path.join(root, 'packages', 'c'),
        ignorePatterns: [],
        workspaceMembers: [
          { path: root, name: 'workspace-root' },
          { path: path.join(root, 'packages', 'c'), name: '@scope/c' },
          { path: path.join(root, 'packages', 'ui'), name: '@scope/ui' },
        ],
      })
      expectNoSymlinkHasChildren(files)

      expect(entries(files)).toEqual([
        'packages/c/node_modules/ui -> ../../ui',
        'packages/ui/package.json',
        'packages/ui/src/index.js',
      ])
    })

    it('should recognize members given in a lexical spelling', async () => {
      // Workspace member paths can be lexical (npm/yarn workspaces record the
      // directory the package.json was found at), while link targets arrive as
      // realpaths. Registration canonicalizes, or every member would be missed
      // and the branch would silently revert to expansion.
      const outer = await makeSandbox({
        'real/packages/x/package.json': '{"name":"@scope/x"}',
        'real/packages/x/src/index.ts': 'x',
        'real/packages/c/node_modules/@scope/x': link('../../../x'),
        'real/packages/c/package.json': '{"name":"@scope/c"}',
        'real/package.json': '{}',
        'alias': link('real'),
      })
      const lexicalRoot = path.join(outer, 'alias')

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(outer, 'real', 'packages', 'c', 'node_modules', '@scope', 'x')],
        bundleRoot: lexicalRoot,
        ignoreCwd: path.join(lexicalRoot, 'packages', 'c'),
        ignorePatterns: [],
        workspaceMembers: [
          { path: lexicalRoot, name: 'workspace-root' },
          { path: path.join(lexicalRoot, 'packages', 'c'), name: '@scope/c' },
          { path: path.join(lexicalRoot, 'packages', 'x'), name: '@scope/x' },
        ],
      })
      expectNoSymlinkHasChildren(files)

      // Member branch, not expansion: no src/index.ts sweep.
      expect(entries(files)).toEqual([
        'packages/c/node_modules/@scope/x -> ../../../x',
        'packages/x/package.json',
      ])
    })

    it('should keep expansion for a plain directory link to a member target', async () => {
      // The member branch is for package links: assets are not imports and the
      // parser cannot compensate for them, so a plain directory link keeps
      // today's whole-target expansion.
      const root = await makeSandbox({
        'packages/data/package.json': '{"name":"@scope/data"}',
        'packages/data/mock.json': '{}',
        'packages/c/fixtures': link('../data'),
        'packages/c/package.json': '{"name":"@scope/c"}',
        'package.json': '{}',
      })

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'packages', 'c', 'fixtures')],
        bundleRoot: root,
        ignoreCwd: path.join(root, 'packages', 'c'),
        ignorePatterns: [],
        workspaceMembers: [
          { path: root, name: 'workspace-root' },
          { path: path.join(root, 'packages', 'c'), name: '@scope/c' },
          { path: path.join(root, 'packages', 'data'), name: '@scope/data' },
        ],
      })
      expectNoSymlinkHasChildren(files)

      expect(entries(files)).toEqual([
        'packages/c/fixtures -> ../data',
        'packages/data/mock.json',
        'packages/data/package.json',
      ])
    })

    it('should treat a self-dependency link to the root as a member link', async () => {
      // pnpm creates node_modules/<name> -> .. for a `file:.` dependency; the
      // root is a member, so the link travels with the root manifest and
      // nothing gets expanded.
      const root = await makeSandbox({
        'src/index.ts': 'code',
        'private-notes.txt': 'secret',
        'node_modules/app': link('..'),
        'package.json': '{"name":"app"}',
      })

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'node_modules', 'app')],
        bundleRoot: root,
        ignoreCwd: root,
        ignorePatterns: [],
        workspaceMembers: [{ path: root, name: 'app' }],
      })
      expectNoSymlinkHasChildren(files)

      expect(entries(files)).toEqual([
        'node_modules/app -> ..',
        'package.json',
      ])
    })
  })

  it('should keep a workspace-shaped link and bundle the package it points at when no members are known', async () => {
    const root = await makeSandbox({
      'packages/shared-lib/src/index.ts': 'export const x = 1',
      'packages/shared-lib/package.json': '{"name":"@scope/shared-lib"}',
      'packages/e2e/node_modules/@scope/shared-lib': link('../../../shared-lib'),
      'packages/e2e/tests/example.spec.ts': 'test',
      'package.json': '{}',
    })

    const files = await bundle(root, ['node_modules/@scope/shared-lib/**'], {
      cwd: path.join(root, 'packages', 'e2e'),
    })

    expect(entries(files)).toEqual([
      'packages/e2e/node_modules/@scope/shared-lib -> ../../../shared-lib',
      'packages/shared-lib/package.json',
      'packages/shared-lib/src/index.ts',
    ])
    expectNoSymlinkHasChildren(files)
  })

  it('should resolve a chain of symlinks without nesting entries under a link', async () => {
    const root = await makeSandbox({
      'real/pkg/index.js': 'pkg',
      'alias': link('real'),
      'alias-to-alias': link('alias'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['alias-to-alias/**'])

    // Only ever one symlink entry per matched path — the first link in the chain.
    // A second entry would sit beneath the first, which is the broken shape.
    expect(entries(files)).toEqual([
      'alias-to-alias -> real',
      'real/pkg/index.js',
    ])
    expectNoSymlinkHasChildren(files)
  })

  it('should not expand a plain directory symlink when only files beneath it matched', async () => {
    const root = await makeSandbox({
      'shared-media/logo.png': 'png',
      'shared-media/huge-video.mp4': 'mp4',
      'assets': link('shared-media'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['assets/**/*.png'])

    // Only the images were asked for. Expanding the link's target here would
    // bundle the video too.
    expect(entries(files)).toEqual([
      'assets -> shared-media',
      'shared-media/logo.png',
    ])
    expectNoSymlinkHasChildren(files)
  })

  it('should keep a symlink to a file and bundle the file it points at', async () => {
    const root = await makeSandbox({
      'config/base.json': '{}',
      'playwright.config.json': link('config/base.json'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['playwright.config.json', 'package.json'])

    expect(entries(files)).toEqual([
      'config/base.json',
      'package.json',
      'playwright.config.json -> config/base.json',
    ])
  })

  describe('targets outside the archive root', () => {
    it('should copy an out-of-root file link at its spelled path', async () => {
      // A plain file link (a shared .env, a linked config) has no pnpm-store
      // failure mode: the bytes at the spelled path are a complete bundle.
      const outer = await makeSandbox({
        'shared/config.json': '{"shared":true}',
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')
      await fs.symlink(path.join('..', 'shared', 'config.json'), path.join(root, 'config.json'))

      const files = await bundle(root, ['*'], { bundleRoot: root })

      expect(entries(files)).toEqual([
        'config.json',
        'package.json',
      ])
    })

    it('should copy an out-of-root asset directory link at its spelled path', async () => {
      const outer = await makeSandbox({
        'shared-fixtures/data.json': '{}',
        'shared-fixtures/nested/more.json': '{}',
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')
      await fs.symlink(path.join('..', 'shared-fixtures'), path.join(root, 'fixtures'))

      const files = await bundle(root, ['fixtures', 'package.json'], { bundleRoot: root })

      expect(entries(files)).toEqual([
        'fixtures/data.json',
        'fixtures/nested/more.json',
        'package.json',
      ])
    })

    it('should copy the contents of a directory link nested inside an out-of-root tree', async () => {
      // glob reports the nested link as a file (`fixtures/*` matches it without
      // matching the top link), and its contents must still travel — at its
      // archive path, as plain files.
      const outer = await makeSandbox({
        'shared-fixtures/data.json': '{}',
        'vendored/lib.js': 'lib',
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')
      await fs.symlink(path.join('..', 'vendored'), path.join(outer, 'shared-fixtures', 'vendor'))
      await fs.symlink(path.join('..', 'shared-fixtures'), path.join(root, 'fixtures'))

      const files = await bundle(root, ['fixtures/*', 'package.json'], { bundleRoot: root })

      expect(entries(files)).toEqual([
        'fixtures/data.json',
        'fixtures/vendor/lib.js',
        'package.json',
      ])
    })

    it('should copy an out-of-root fan-out of directory links in linear time', async () => {
      // Each level links twice to the next, so the number of routes is
      // exponential in the depth while the number of directories is not.
      // Copying per route would take minutes; copying per directory, with later
      // routes becoming links to the first copy, stays instant.
      const spec: TreeSpec = { 'project/package.json': '{}' }
      const depth = 12
      for (let i = 0; i < depth; i++) {
        spec[`external/l${i}/file.js`] = `l${i}`
      }
      const outer = await makeSandbox(spec)
      for (let i = 0; i + 1 < depth; i++) {
        await fs.symlink(path.join('..', `l${i + 1}`), path.join(outer, 'external', `l${i}`, 'a'))
        await fs.symlink(path.join('..', `l${i + 1}`), path.join(outer, 'external', `l${i}`, 'b'))
      }
      const root = path.join(outer, 'project')
      await fs.symlink(path.join('..', 'external', 'l0'), path.join(root, 'assets'))

      const files = await bundle(root, ['assets'], { bundleRoot: root })

      // Each level's file appears once at the first route that reached it; the
      // result stays proportional to the number of directories.
      expect(files.length).toBeLessThan(depth * 4)
      expect(entries(files)).toContain('assets/file.js')
    }, 20_000)

    it('should error on a matched link whose target is outside the bundle root', async () => {
      // The old behaviour silently flattened the target's contents into the
      // archive — a bundle that only half-worked, since a pnpm package's
      // dependencies are its store siblings and never came along. Failing
      // loudly is the deliberate replacement.
      const outer = await makeSandbox({
        'external/pkg/index.js': 'pkg',
        'project/node_modules/pkg': link('../../external/pkg'),
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')

      await expect(bundle(root, ['node_modules/pkg/**', 'package.json'], { bundleRoot: root }))
        .rejects.toThrow(/outside the project's bundle root/)
    })

    it('should skip an out-of-root link the ignore patterns exclude, instead of erroring', async () => {
      // The escape hatch the error message names: excluding the link via
      // ignoreDirectoriesMatch acknowledges it should not be bundled. Matched
      // paths are passed directly here because the include glob's own ignore
      // handling runs in a different namespace (the config directory) and can
      // therefore miss patterns that do match the link's bundle-root-relative
      // path — the resolver's check is the backstop.
      const outer = await makeSandbox({
        'external/pkg/index.js': 'pkg',
        'project/node_modules/pkg': link('../../external/pkg'),
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'node_modules', 'pkg'), path.join(root, 'package.json')],
        bundleRoot: root,
        ignoreCwd: path.join(root, 'apps'),
        ignorePatterns: ['node_modules/**'],
      })

      expect(entries(files)).toEqual([
        'package.json',
      ])
    })

    it('should honor a directory-shaped ignore pattern for the whole node_modules link', async () => {
      // The spelling the CLI's own docs teach: `**/node_modules/**` matches the
      // contents but not the bare `node_modules` entry itself. Excluding the
      // subtree must still count as excluding the link, or the escape hatch the
      // error message advertises is a dead end.
      const outer = await makeSandbox({
        'cache/node_modules/pkg/index.js': 'pkg',
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')
      await fs.symlink(path.join('..', 'cache', 'node_modules'), path.join(root, 'node_modules'))

      const files = await resolveBundleFiles({
        matchedPaths: [path.join(root, 'node_modules'), path.join(root, 'package.json')],
        bundleRoot: root,
        ignoreCwd: path.join(root, 'apps'),
        ignorePatterns: ['**/node_modules/**'],
      })

      expect(entries(files)).toEqual([
        'package.json',
      ])
    })
  })

  it('should keep a link pointing at its own parent directory', async () => {
    const root = await makeSandbox({
      'pkg/index.js': 'pkg',
      'pkg/self': link('.'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['pkg/**'])

    // The naive relative path here is the empty string, which symlink(2) rejects.
    expect(entries(files)).toEqual([
      'pkg/index.js',
      'pkg/self -> .',
    ])
  })

  it('should terminate on symlink cycles', async () => {
    const root = await makeSandbox({
      'a/index.js': 'a',
      'b/index.js': 'b',
      'a/to-b': link('../b'),
      'b/to-a': link('../a'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['a/**'])

    // a -> b -> a is cut by the second visit to a real path already expanded.
    expect(entries(files)).toEqual([
      'a/index.js',
      'a/to-b -> ../b',
      'b/index.js',
      'b/to-a -> ../a',
    ])
    expectNoSymlinkHasChildren(files)
  })

  describe('referenced paths', () => {
    it('should carry the links a referenced path traverses, without expanding their targets', async () => {
      // The shape of a config whose testDir runs through a link: content is
      // discovered at real paths by someone else (the parser); the resolver's
      // job is only to make the spelled path resolve in the archive.
      const root = await makeSandbox({
        'shared/tests/a.spec.ts': 'test',
        'shared/other/unrelated.txt': 'not asked for',
        'linked': link('shared'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['package.json'], {
        referencedPaths: [path.join(root, 'linked', 'tests')],
      })

      // The link travels; the target's content does not (no expansion).
      expect(entries(files)).toEqual([
        'linked -> shared',
        'package.json',
      ])
    })

    it('should carry every link in a chained referenced path, each at its real path', async () => {
      const root = await makeSandbox({
        'real-a/sub/marker.txt': 'a',
        'real-b/file.txt': 'b',
        'link-a': link('real-a'),
        'package.json': '{}',
      })
      // A second link *inside* the first link's target.
      await fs.symlink(path.join('..', '..', 'real-b'), path.join(root, 'real-a', 'sub', 'link-b'))

      const files = await bundle(root, ['package.json'], {
        referencedPaths: [path.join(root, 'link-a', 'sub', 'link-b', 'file.txt')],
      })

      // Each link sits at its own symlink-free archive path — the second at its
      // real-namespace location, never beneath the first.
      expect(entries(files)).toEqual([
        'link-a -> real-a',
        'package.json',
        'real-a/sub/link-b -> ../../real-b',
      ])
    })

    it('should not let the prune pass drop a referenced link with no resolver-visible content', async () => {
      // The referenced link's target content is bundled by the parser, which
      // the resolver cannot see — target occupancy must not be required here.
      const root = await makeSandbox({
        'shared/tests/a.spec.ts': 'test',
        'linked': link('shared'),
        'package.json': '{}',
      })

      const files = await bundle(root, [], {
        referencedPaths: [path.join(root, 'linked')],
      })

      expect(entries(files)).toEqual([
        'linked -> shared',
      ])
    })

    it('should emit nothing when the referenced path is the bundle root reached through a link', async () => {
      // `checkly deploy --config /path/to/link-to-proj/checkly.config.ts`: the
      // whole project is reached through a symlink, and the config directory —
      // which testDir defaults to — IS the bundle root. The root is not an
      // archive entry; emitting a link at the empty name aborts the archive.
      const outer = await makeSandbox({
        'real-proj/tests/a.spec.ts': 'test',
        'real-proj/package.json': '{}',
        'alias-proj': link('real-proj'),
      })
      const root = path.join(outer, 'alias-proj')

      const files = await bundle(root, ['package.json'], {
        bundleRoot: root,
        referencedPaths: [root],
      })

      expect(entries(files)).toEqual([
        'package.json',
      ])
    })

    it('should discard the whole chain when a later hop leaves the bundle root', async () => {
      // The first hop stays inside the root, but the reference's content leaves
      // it at the second hop — so discovery bundles the content at the spelled
      // path as real directories. Emitting the first link anyway would place it
      // above those directories, guaranteeing its own removal later.
      const outer = await makeSandbox({
        'outside/tests/a.spec.ts': 'test',
        'proj/b/marker.txt': 'b',
        'proj/package.json': '{}',
      })
      const root = path.join(outer, 'proj')
      await fs.symlink('b', path.join(root, 'a'))
      await fs.symlink(path.join('..', '..', 'outside', 'tests'), path.join(root, 'b', 'tests'))

      const files = await bundle(root, ['package.json'], {
        bundleRoot: root,
        referencedPaths: [path.join(root, 'a', 'tests')],
      })

      expect(entries(files)).toEqual([
        'package.json',
      ])
    })

    it('should mark a link as referenced even when an include pattern emitted it first', async () => {
      // Being referenced is a property of the link, not of which pass reached
      // it first — the marker is what makes the bundler warn instead of staying
      // silent if the link later has to be dropped.
      const root = await makeSandbox({
        'shared/tests/a.spec.ts': 'test',
        'linked': link('shared'),
        'package.json': '{}',
      })

      const files = await bundle(root, ['linked', 'package.json'], {
        referencedPaths: [path.join(root, 'linked')],
      })

      const entry = files.find(file => file.archivePath === 'linked')
      expect(entry?.symlinkTarget).toBe('shared')
      expect(entry?.referencedLink).toBe(true)
    })

    it('should skip referenced links whose target is outside the bundle root', async () => {
      // Discovery already turned the out-of-root content into a hard error;
      // there is nothing sensible left to emit for the link itself.
      const outer = await makeSandbox({
        'outside/tests/a.spec.ts': 'test',
        'proj/package.json': '{}',
      })
      const root = path.join(outer, 'proj')
      await fs.symlink(path.join('..', 'outside'), path.join(root, 'linked'))

      const files = await bundle(root, ['package.json'], {
        bundleRoot: root,
        referencedPaths: [path.join(root, 'linked', 'tests')],
      })

      expect(entries(files)).toEqual([
        'package.json',
      ])
    })
  })

  describe('broken symlinks', () => {
    it.each([
      ['a relative target', './missing'],
      ['an absolute target outside the project', '/nonexistent/elsewhere'],
    ])('should skip one with %s', async (_name, target) => {
      const root = await makeSandbox({
        'broken': link(target),
        'package.json': '{}',
      })

      const files = await bundle(root, ['*'])

      // Its target does not exist and so cannot be bundled with it. Keeping the
      // link would extract to a link to nothing — and an absolute one would
      // escape the archive root, which hardened extractors reject outright.
      expect(entries(files)).toEqual([
        'package.json',
      ])
    })
  })

  it('should resolve correctly when the project is reached through a symlinked path', async () => {
    // What macOS does to every path under /tmp. If the lexical root and the real
    // root are not reconciled, every real path looks like it is outside the root
    // and the whole tree gets dereferenced.
    const outer = await makeSandbox({
      'real/project/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
      'real/project/node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
      'real/project/package.json': '{}',
      'alias': link('real'),
    })
    const root = path.join(outer, 'alias', 'project')

    const files = await bundle(root, ['node_modules/pkg/**'], { bundleRoot: root })

    expect(entries(files)).toEqual([
      'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
      'node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
    ])
    expectNoSymlinkHasChildren(files)
  })

  it('should handle paths containing glob metacharacters', async () => {
    const root = await makeSandbox({
      'pkg (v2)[beta]/index.js': 'pkg',
      'node_modules/pkg': link('../pkg (v2)[beta]'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['node_modules/**'])

    expect(entries(files)).toEqual([
      'node_modules/pkg -> ../pkg (v2)[beta]',
      'pkg (v2)[beta]/index.js',
    ])
  })

  it('should not re-import a subtree the ignore patterns excluded', async () => {
    const root = await makeSandbox({
      'shared/src/index.js': 'src',
      'shared/fixtures/big.json': '{}',
      'lib': link('shared'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['lib/**'], { ignore: ['**/fixtures/**'] })

    expect(entries(files)).toEqual([
      'lib -> shared',
      'shared/src/index.js',
    ])
  })

  it('should apply ignore patterns to content expanded outside the include cwd', async () => {
    // The store sits at the workspace root while the Playwright config lives in a
    // package below it, which is the ordinary monorepo shape. Relativized against
    // the config directory, a store path starts with `..` — and minimatch's `**`
    // will not match across one, so patterns matched in that namespace are inert.
    const root = await makeSandbox({
      'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js': 'pkg',
      'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/fixtures/huge.json': '{}',
      'node_modules/pkg': link('.pnpm/pkg@1.0.0/node_modules/pkg'),
      'packages/e2e/playwright.config.ts': 'config',
      'package.json': '{}',
    })

    const files = await bundle(root, ['../../node_modules/pkg/**'], {
      cwd: path.join(root, 'packages', 'e2e'),
      ignore: ['**/fixtures/**'],
    })

    expect(entries(files)).toEqual([
      'node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
      'node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
    ])
  })

  it('should keep a file the include globs matched, even when expansion reached it first', async () => {
    // The ignore patterns exclude `fixtures`, but the glob kept this file anyway:
    // relative to the config directory its path crosses `..`, which no pattern can
    // match. The resolver must not overturn that decision just because it happened
    // to walk into the same file while expanding the package link next door.
    const root = await makeSandbox({
      'shared/src/index.js': 'src',
      'shared/fixtures/data.json': '{}',
      'packages/e2e/node_modules/@scope/shared': link('../../../../shared'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['node_modules/@scope/shared/**', '../../shared/fixtures/**'], {
      cwd: path.join(root, 'packages', 'e2e'),
      ignore: ['**/fixtures/**'],
    })

    expect(entries(files)).toEqual([
      'packages/e2e/node_modules/@scope/shared -> ../../../../shared',
      'shared/fixtures/data.json',
      'shared/src/index.js',
    ])
  })

  it('should keep a link onto a directory whose only content is other links', async () => {
    // tar creates the parent directories of a symlink entry just as it does for a
    // file, so `holder` exists after extraction and `lib` resolves through it.
    const root = await makeSandbox({
      'real/tool.js': 'tool',
      'holder/tool': link('../real/tool.js'),
      'lib': link('holder'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['lib/**', 'package.json'])

    expect(entries(files)).toEqual([
      'holder/tool -> ../real/tool.js',
      'lib -> holder',
      'package.json',
      'real/tool.js',
    ])
  })

  it('should drop a link whose target contributes nothing to the archive', async () => {
    const root = await makeSandbox({
      'shared/fixtures/big.json': '{}',
      'lib': link('shared'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['lib/**', 'package.json'], { ignore: ['**/fixtures/**'] })

    // Everything under the target was excluded, so tar never creates the
    // directory the link points at.
    expect(entries(files)).toEqual([
      'package.json',
    ])
  })

  it('should not expand a link that points at one of its own ancestors', async () => {
    // pnpm builds this for a package that depends on itself (`file:.`), giving a
    // link whose target is the project root.
    const root = await makeSandbox({
      'src/index.ts': 'src',
      'private-notes.txt': 'secret',
      'node_modules/app': link('..'),
      'package.json': '{}',
    })

    const files = await bundle(root, ['node_modules/app/src/**'])

    // The pattern asked for one file. Because the link is a package link, the
    // resolver would otherwise expand its target — the whole project — and sweep
    // up every other file, including ones no include pattern named.
    expect(entries(files)).toEqual([
      'node_modules/app -> ..',
      'src/index.ts',
    ])
  })

  it('should refuse to bundle pnpm state files even when named outright', async () => {
    const root = await makeSandbox({
      'node_modules/.modules.yaml': 'storeDir: /elsewhere',
      'package.json': '{}',
    })

    // A literal dot segment matches even though a wildcard would not, so an
    // explicit include is the one way this file can reach the archive.
    const files = await bundle(root, ['node_modules/.modules.yaml', 'package.json'])

    expect(entries(files)).toEqual([
      'package.json',
    ])
  })
})
