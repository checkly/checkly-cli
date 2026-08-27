import { describe, it, expect } from 'vitest'

import {
  DEPENDENCY_CLASSES,
  normalizePackagePrune,
  prunePackageJson,
  verifyPrunedManifest,
} from '../package-prune.js'
import { InvalidPackageNamePatternError } from '../../embedded-packages/spec.js'

const manifest = (extra: object = {}): string => JSON.stringify({
  name: 'fixture',
  version: '1.0.0',
  dependencies: {
    '@acme/utils': '^1.0.0',
    'left-pad': '^1.3.0',
  },
  devDependencies: {
    '@acme/eslint-config': '^2.0.0',
    'typescript': '^5.4.0',
  },
  peerDependencies: {
    '@acme/heavy-icons': '^6.0.0',
    'react': '^18.0.0',
  },
  peerDependenciesMeta: {
    '@acme/heavy-icons': { optional: false },
    'react': { optional: true },
  },
  optionalDependencies: {
    '@acme/native-helper': '^1.0.0',
    'fsevents': '^2.3.0',
  },
  scripts: {
    build: 'tsc',
  },
  ...extra,
}, null, 2)

describe('normalizePackagePrune()', () => {
  it('returns undefined for undefined', () => {
    expect(normalizePackagePrune(undefined)).toBeUndefined()
  })

  it('returns undefined for an empty array', () => {
    expect(normalizePackagePrune([])).toBeUndefined()
  })

  it('normalizes the array shape to every dependency class', () => {
    const normalized = normalizePackagePrune(['@acme/*', 'left-pad'])
    expect(normalized).toBeDefined()
    for (const dependencyClass of DEPENDENCY_CLASSES) {
      const patterns = normalized?.[dependencyClass]
      expect(patterns).not.toBe(true)
      expect(patterns).toHaveLength(2)
    }
  })

  it('passes true through per class', () => {
    expect(normalizePackagePrune({ peerDependencies: true })).toEqual({
      peerDependencies: true,
    })
  })

  it('parses per-class pattern arrays', () => {
    const normalized = normalizePackagePrune({
      peerDependencies: ['@acme/*'],
      devDependencies: true,
    })
    expect(normalized?.devDependencies).toBe(true)
    expect(normalized?.peerDependencies).toHaveLength(1)
    expect(normalized?.dependencies).toBeUndefined()
    expect(normalized?.optionalDependencies).toBeUndefined()
  })

  it('drops empty per-class arrays and returns undefined for an empty map', () => {
    expect(normalizePackagePrune({})).toBeUndefined()
    expect(normalizePackagePrune({ peerDependencies: [] })).toBeUndefined()
    expect(normalizePackagePrune({ peerDependencies: [], devDependencies: true })).toEqual({
      devDependencies: true,
    })
  })

  it('ignores explicitly undefined classes', () => {
    expect(normalizePackagePrune({ peerDependencies: undefined, devDependencies: true })).toEqual({
      devDependencies: true,
    })
  })

  it('rejects an unknown dependency class', () => {
    expect(() => normalizePackagePrune({ peerDependences: true } as any)).toThrow(
      /'peerDependences' is not a dependency class \(expected one of dependencies, devDependencies, /,
    )
  })

  it('rejects a non-true, non-array class value', () => {
    expect(() => normalizePackagePrune({ peerDependencies: false } as any))
      .toThrow(/'peerDependencies' must be true or an array of package name patterns/)
    expect(() => normalizePackagePrune({ peerDependencies: '@acme/*' } as any))
      .toThrow(/'peerDependencies' must be true or an array of package name patterns/)
  })

  it('rejects a non-array, non-object value', () => {
    expect(() => normalizePackagePrune(42 as any))
      .toThrow(/must be an array of package name patterns or an object keyed by dependency class/)
    expect(() => normalizePackagePrune(null as any))
      .toThrow(/must be an array of package name patterns or an object keyed by dependency class/)
    expect(() => normalizePackagePrune('@acme/*' as any))
      .toThrow(/must be an array of package name patterns or an object keyed by dependency class/)
  })

  it('rejects non-plain objects instead of normalizing them to nothing', () => {
    expect(() => normalizePackagePrune(new Set(['@acme/*']) as any))
      .toThrow(/must be an array of package name patterns or an object keyed by dependency class/)
    expect(() => normalizePackagePrune(new Map([['dependencies', ['x']]]) as any))
      .toThrow(/must be an array of package name patterns or an object keyed by dependency class/)
    expect(() => normalizePackagePrune(new Date() as any))
      .toThrow(/must be an array of package name patterns or an object keyed by dependency class/)
  })

  it('does not alias one pattern array across classes for the array shape', () => {
    const normalized = normalizePackagePrune(['@acme/*'])!
    expect(normalized.dependencies).not.toBe(normalized.devDependencies)
    expect(normalized.peerDependencies).not.toBe(normalized.optionalDependencies)
  })

  it('rejects invalid patterns in either shape', () => {
    expect(() => normalizePackagePrune(['pkg@1.0.0'])).toThrow(InvalidPackageNamePatternError)
    expect(() => normalizePackagePrune({ dependencies: ['pkg@1.0.0'] }))
      .toThrow(InvalidPackageNamePatternError)
  })
})

describe('prunePackageJson()', () => {
  it('removes matching packages from every class for the array shape', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    const result = prunePackageJson(manifest(), prune)
    expect(result).toBeDefined()
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ 'left-pad': '^1.3.0' })
    expect(parsed.devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(parsed.peerDependencies).toEqual({ react: '^18.0.0' })
    expect(parsed.optionalDependencies).toEqual({ fsevents: '^2.3.0' })
    expect(parsed.peerDependenciesMeta).toEqual({ react: { optional: true } })
    expect(result!.removed.sort()).toEqual([
      'dependencies:@acme/utils',
      'devDependencies:@acme/eslint-config',
      'optionalDependencies:@acme/native-helper',
      'peerDependencies:@acme/heavy-icons',
    ])
  })

  it('touches only the configured class for the scoped shape', () => {
    const prune = normalizePackagePrune({ peerDependencies: ['@acme/*'] })!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({
      '@acme/utils': '^1.0.0',
      'left-pad': '^1.3.0',
    })
    expect(parsed.peerDependencies).toEqual({ react: '^18.0.0' })
    expect(parsed.peerDependenciesMeta).toEqual({ react: { optional: true } })
    expect(result!.removed).toEqual(['peerDependencies:@acme/heavy-icons'])
  })

  it('removes a whole class with true, including peerDependenciesMeta for peers', () => {
    const prune = normalizePackagePrune({ peerDependencies: true })!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
    expect(parsed.dependencies).toBeDefined()
    expect(result!.removed.sort()).toEqual([
      'peerDependencies:@acme/heavy-icons',
      'peerDependencies:react',
    ])
  })

  it('leaves peerDependenciesMeta alone when other classes are cleared with true', () => {
    const prune = normalizePackagePrune({ devDependencies: true })!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeDefined()
  })

  it('deletes a class object emptied by pattern removal', () => {
    const prune = normalizePackagePrune({ peerDependencies: ['@acme/*', 'react'] })!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('combines true and pattern classes in one pass', () => {
    const prune = normalizePackagePrune({
      devDependencies: true,
      dependencies: ['left-pad'],
    })!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0' })
    expect(result!.removed.sort()).toEqual([
      'dependencies:left-pad',
      'devDependencies:@acme/eslint-config',
      'devDependencies:typescript',
    ])
  })

  it('applies exclusions in order, last matching entry winning', () => {
    const prune = normalizePackagePrune({ peerDependencies: ['@acme/*', '!@acme/heavy-icons'] })!
    const result = prunePackageJson(manifest(), prune)
    // The exclusion spares the one peer the earlier wildcard selected.
    expect(result).toEqual({ content: manifest(), removed: [], changed: false })

    const reSelected = normalizePackagePrune({
      peerDependencies: ['@acme/*', '!@acme/*', '@acme/heavy-icons'],
    })!
    const reResult = prunePackageJson(manifest(), reSelected)
    expect(reResult!.removed).toEqual(['peerDependencies:@acme/heavy-icons'])
  })

  it('treats an exclusion before any selection as a no-op', () => {
    const prune = normalizePackagePrune({ peerDependencies: ['!@acme/heavy-icons', '@acme/*'] })!
    const result = prunePackageJson(manifest(), prune)
    // Exclusions only subtract from earlier entries, so the later wildcard
    // still removes the peer — embed's order semantics.
    expect(result!.removed).toEqual(['peerDependencies:@acme/heavy-icons'])
  })

  it('empties every class except the spared package with the pre-globstar catch-all spelling', () => {
    // The `['*', '@*/*', '!keep']` spelling predates the `**` globstar and
    // must keep working; this pins both halves it relies on (a `*` allowed
    // in the scope segment, and segment-wise matching of the scoped
    // catch-all).
    const prune = normalizePackagePrune(['*', '@*/*', '!@acme/utils'])!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0' })
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.optionalDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('removes every dependency, scoped or not, with a bare globstar', () => {
    const prune = normalizePackagePrune(['**'])!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toBeUndefined()
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.optionalDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('empties every class except the spared package with the globstar catch-all recipe', () => {
    // The `['**', '!keep']` spelling is what the config TSDoc and the
    // ai-context reference recommend for "a whole class except X".
    const prune = normalizePackagePrune(['**', '!@acme/utils'])!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0' })
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.optionalDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('removes nothing for an exclusion-only list', () => {
    const prune = normalizePackagePrune(['!@acme/*'])!
    const content = manifest()
    expect(prunePackageJson(content, prune)).toEqual({ content, removed: [], changed: false })
  })

  it('applies exclusions to every class for the array shape', () => {
    const prune = normalizePackagePrune(['@acme/*', '!@acme/utils'])!
    const result = prunePackageJson(manifest(), prune)
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0', 'left-pad': '^1.3.0' })
    expect(result!.removed.sort()).toEqual([
      'devDependencies:@acme/eslint-config',
      'optionalDependencies:@acme/native-helper',
      'peerDependencies:@acme/heavy-icons',
    ])
  })

  it('returns the original content unchanged when nothing matches', () => {
    const prune = normalizePackagePrune(['@other/*'])!
    const content = manifest()
    const result = prunePackageJson(content, prune)
    expect(result).toEqual({ content, removed: [], changed: false })
  })

  it('no-ops on a manifest without the configured class', () => {
    const prune = normalizePackagePrune({ peerDependencies: true })!
    const content = JSON.stringify({ name: 'bare', version: '1.0.0' })
    expect(prunePackageJson(content, prune)).toEqual({ content, removed: [], changed: false })
  })

  it('clears peerDependenciesMeta with true even without a peerDependencies section', () => {
    const prune = normalizePackagePrune({ peerDependencies: true })!
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      peerDependenciesMeta: { react: { optional: true } },
    })
    const result = prunePackageJson(content, prune)
    expect(result!.changed).toBe(true)
    expect(result!.removed).toEqual([])
    expect(JSON.parse(result!.content)).toEqual({ name: 'bare', version: '1.0.0' })
  })

  it('clears an empty peerDependencies section and its meta with true', () => {
    const prune = normalizePackagePrune({ peerDependencies: true })!
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      peerDependencies: {},
      peerDependenciesMeta: { react: { optional: true } },
    })
    const result = prunePackageJson(content, prune)
    expect(result!.changed).toBe(true)
    expect(result!.removed).toEqual([])
    expect(JSON.parse(result!.content)).toEqual({ name: 'bare', version: '1.0.0' })
  })

  it('leaves a section that was already empty alone', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      dependencies: { '@acme/utils': '^1.0.0' },
      devDependencies: {},
      optionalDependencies: {},
    })
    const result = prunePackageJson(content, prune)
    expect(JSON.parse(result!.content)).toEqual({
      name: 'bare',
      version: '1.0.0',
      devDependencies: {},
      optionalDependencies: {},
    })
    expect(result!.removed).toEqual(['dependencies:@acme/utils'])
  })

  it('never touches a dependency class that is not a plain object', () => {
    const prune = normalizePackagePrune({ dependencies: true, devDependencies: ['@acme/*'] })!
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      dependencies: ['@acme/utils'],
      devDependencies: 'not an object',
    })
    expect(prunePackageJson(content, prune)).toEqual({ content, removed: [], changed: false })
  })

  it('leaves untouched fields structurally identical', () => {
    const content = manifest({
      pnpm: { patchedDependencies: { 'left-pad@1.3.0': 'patches/left-pad@1.3.0.patch' } },
      workspaces: ['packages/*'],
    })
    const prune = normalizePackagePrune(['@acme/*'])!
    const result = prunePackageJson(content, prune)
    const parsed = JSON.parse(result!.content)
    const original = JSON.parse(content)
    expect(parsed.name).toEqual(original.name)
    expect(parsed.version).toEqual(original.version)
    expect(parsed.scripts).toEqual(original.scripts)
    expect(parsed.pnpm).toEqual(original.pnpm)
    expect(parsed.workspaces).toEqual(original.workspaces)
  })

  it('returns undefined for unparseable content', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    expect(prunePackageJson('not json {', prune)).toBeUndefined()
  })

  it('returns undefined for a non-object manifest', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    expect(prunePackageJson('[]', prune)).toBeUndefined()
    expect(prunePackageJson('null', prune)).toBeUndefined()
    expect(prunePackageJson('"str"', prune)).toBeUndefined()
  })

  it('fails closed on a manifest whose serialization is lossy', () => {
    // 1e999 parses to Infinity but stringifies as null, so the reparse of
    // the rewrite cannot equal the expectation.
    const prune = normalizePackagePrune(['@acme/*'])!
    const content = '{"someTool":{"limit":1e999},"dependencies":{"@acme/utils":"^1.0.0","keep":"^1.0.0"}}'
    expect(prunePackageJson(content, prune)).toBeUndefined()
  })

  it('accepts a faithful rewrite in verifyPrunedManifest', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    const original = manifest()
    const { content: rewritten, removed } = prunePackageJson(original, prune)!
    expect(verifyPrunedManifest(original, rewritten, prune, removed)).toBe(rewritten)
  })

  it('fails closed in verifyPrunedManifest when the rewrite touched anything else', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    const original = manifest()
    const { content, removed } = prunePackageJson(original, prune)!
    const mangled = JSON.parse(content)
    mangled.scripts = {}
    expect(verifyPrunedManifest(original, JSON.stringify(mangled, null, 2), prune, removed)).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest when the wrong entry was deleted', () => {
    // The replay works from the reported labels, so a matcher that deleted
    // one package while reporting another cannot pass.
    const prune = normalizePackagePrune(['@acme/*'])!
    const original = manifest()
    const mangled = JSON.parse(original)
    delete mangled.dependencies['left-pad']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(mangled, null, 2),
      prune,
      ['dependencies:@acme/utils'],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on a removal an exclusion spared', () => {
    const prune = normalizePackagePrune({ dependencies: ['@acme/*', '!@acme/utils'] })!
    const original = manifest()
    const strayed = JSON.parse(original)
    delete strayed.dependencies['@acme/utils']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayed, null, 2),
      prune,
      ['dependencies:@acme/utils'],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on a removal the configuration does not select', () => {
    const original = manifest()
    // A class the prune never configured...
    const peerOnly = normalizePackagePrune({ peerDependencies: ['@acme/*'] })!
    const strayedClass = JSON.parse(original)
    delete strayedClass.dependencies['@acme/utils']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayedClass, null, 2),
      peerOnly,
      ['dependencies:@acme/utils'],
    )).toBeUndefined()
    // ...and a name no configured pattern matches.
    const acmeOnly = normalizePackagePrune({ dependencies: ['@acme/*'] })!
    const strayedName = JSON.parse(original)
    delete strayedName.dependencies['left-pad']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayedName, null, 2),
      acmeOnly,
      ['dependencies:left-pad'],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on unparseable inputs', () => {
    const prune = normalizePackagePrune(['@acme/*'])!
    expect(verifyPrunedManifest('{', '{}', prune, [])).toBeUndefined()
    expect(verifyPrunedManifest('{}', '{', prune, [])).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on labels outside the dependency classes', () => {
    // Labels are defense-in-depth input: a class that is not a dependency
    // class must fail closed, including Object.prototype keys that would
    // otherwise resolve to inherited values.
    const prune = normalizePackagePrune(['*'])!
    expect(verifyPrunedManifest('{}', '{}', prune, ['__proto__:x'])).toBeUndefined()
    expect(verifyPrunedManifest('{}', '{}', prune, ['constructor:x'])).toBeUndefined()
    expect(verifyPrunedManifest('{}', '{}', prune, ['scripts:build'])).toBeUndefined()
    expect(verifyPrunedManifest('{}', '{}', prune, ['nocolon'])).toBeUndefined()
  })
})
