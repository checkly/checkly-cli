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
}

async function bundle (root: string, patterns: string[], options: BundleOptions = {}): Promise<PhysicalFile[]> {
  const { ignore = [], cwd = root, bundleRoot = root } = options

  const matchedPaths = await findFilesWithPattern(cwd, patterns, ignore)

  const files = await resolveBundleFiles({
    matchedPaths,
    bundleRoot,
    ignoreCwd: cwd,
    ignorePatterns: ignore,
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

  it('should keep a workspace link and bundle the package it points at', async () => {
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
    it('should bundle the contents of an out-of-root link, without a symlink entry', async () => {
      const outer = await makeSandbox({
        'external/pkg/index.js': 'pkg',
        'project/node_modules/pkg': link('../../external/pkg'),
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')

      const files = await bundle(root, ['node_modules/pkg/**', 'package.json'], { bundleRoot: root })

      // The target cannot be named inside the archive, so a symlink entry would
      // dangle after extraction. Copy the bytes to where the link sits instead.
      expect(entries(files)).toEqual([
        'node_modules/pkg/index.js',
        'package.json',
      ])
      expect(files.filter(file => file.symlinkTarget !== undefined)).toEqual([])
    })

    it('should not leave a symlink with entries beneath it when two links share a target', async () => {
      // Two links to one directory, and a pattern that matches files through
      // both. glob traverses a symlinked directory for `**/*` (it does not for a
      // bare `**`), so files arrive under both link paths — and if the second
      // link is archived as a symlink to the first, those files sit beneath a
      // symlink entry. That is exactly the archive tar cannot extract.
      const outer = await makeSandbox({
        'external/pkg/index.js': 'pkg',
        'external/other/o.js': 'other',
        'external/pkg/aliasA': link('../other'),
        'external/pkg/aliasB': link('../other'),
        'project/node_modules/pkg': link('../../external/pkg'),
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')

      const files = await bundle(root, ['node_modules/pkg/**/*'], { bundleRoot: root })

      expectNoSymlinkHasChildren(files)
      expect(entries(files)).toEqual(expect.arrayContaining([
        'node_modules/pkg/aliasA/o.js',
        'node_modules/pkg/index.js',
      ]))
    })

    it('should dereference symlinks nested inside an out-of-root tree', async () => {
      const outer = await makeSandbox({
        'external/pkg/index.js': 'pkg',
        'external/pkg/vendor': link('../vendored'),
        'external/vendored/lib.js': 'lib',
        'project/node_modules/pkg': link('../../external/pkg'),
        'project/package.json': '{}',
      })
      const root = path.join(outer, 'project')

      const files = await bundle(root, ['node_modules/pkg/**'], { bundleRoot: root })

      expect(entries(files)).toEqual([
        'node_modules/pkg/index.js',
        'node_modules/pkg/vendor/lib.js',
      ])
      expect(files.filter(file => file.symlinkTarget !== undefined)).toEqual([])
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

  it('should copy an out-of-root directory once, however many links reach it', async () => {
    // Each level fans out to the next by two links, so the number of distinct
    // routes through the tree is exponential in its depth while the number of
    // directories is not.
    const spec: TreeSpec = { 'project/package.json': '{}' }
    const depth = 12
    for (let i = 0; i < depth; i++) {
      spec[`external/l${i}/file.js`] = `l${i}`
      if (i + 1 < depth) {
        spec[`external/l${i}/a`] = link(`../l${i + 1}`)
        spec[`external/l${i}/b`] = link(`../l${i + 1}`)
      }
    }
    spec['project/node_modules/pkg'] = link('../../external/l0')
    const outer = await makeSandbox(spec)
    const root = path.join(outer, 'project')

    const files = await bundle(root, ['node_modules/pkg/**'], { bundleRoot: root })

    // Each level's file is copied exactly once; the second route to a directory
    // becomes a link to the first copy rather than another copy of it.
    for (let i = 0; i < depth; i++) {
      const copies = entries(files).filter(entry => entry.endsWith(`/file.js`) && entry.includes(`l${i}`) === false)
      expect(copies.length).toBeLessThanOrEqual(depth)
    }
    expect(files.length).toBeLessThan(depth * 4)
  }, 20_000)

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
