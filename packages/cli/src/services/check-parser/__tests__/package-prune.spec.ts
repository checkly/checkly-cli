import { describe, it, expect } from 'vitest'

import {
  BundlePackagesPrune,
  DEPENDENCY_CLASSES,
  MemberPruneDiagnostics,
  normalizePackagePrune,
  PruneMemberIdentity,
  prunePackageJson,
  resolveManifestPrune,
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

const fixtureMember: PruneMemberIdentity = { name: 'fixture', root: false }

/** Normalizes and resolves for one member, asserting both succeed. */
const resolvePrune = (raw: BundlePackagesPrune, member: PruneMemberIdentity = fixtureMember) =>
  resolveManifestPrune(normalizePackagePrune(raw)!, member)!

describe('normalizePackagePrune()', () => {
  it('returns undefined for undefined', () => {
    expect(normalizePackagePrune(undefined)).toBeUndefined()
  })

  it('returns undefined for an empty array', () => {
    expect(normalizePackagePrune([])).toBeUndefined()
  })

  it('normalizes the array shape to ordered global entries', () => {
    expect(normalizePackagePrune(['@acme/*', 'left-pad'])).toEqual({
      form: 'entries',
      entries: [
        { kind: 'global', pattern: { name: '@acme/*', wildcard: true, exclude: false } },
        { kind: 'global', pattern: { name: 'left-pad', wildcard: false, exclude: false } },
      ],
    })
  })

  it('passes true through per class', () => {
    expect(normalizePackagePrune({ peerDependencies: true })).toEqual({
      form: 'classes',
      classes: { peerDependencies: true },
    })
  })

  it('parses per-class pattern arrays', () => {
    const normalized = normalizePackagePrune({
      peerDependencies: ['@acme/*'],
      devDependencies: true,
    })
    expect(normalized?.form).toBe('classes')
    const classes = normalized?.form === 'classes' ? normalized.classes : undefined
    expect(classes?.devDependencies).toBe(true)
    expect(classes?.peerDependencies).toHaveLength(1)
    expect(classes?.dependencies).toBeUndefined()
    expect(classes?.optionalDependencies).toBeUndefined()
  })

  it('drops empty per-class arrays and returns undefined for an empty map', () => {
    expect(normalizePackagePrune({})).toBeUndefined()
    expect(normalizePackagePrune({ peerDependencies: [] })).toBeUndefined()
    expect(normalizePackagePrune({ peerDependencies: [], devDependencies: true })).toEqual({
      form: 'classes',
      classes: { devDependencies: true },
    })
  })

  it('ignores explicitly undefined classes', () => {
    expect(normalizePackagePrune({ peerDependencies: undefined, devDependencies: true })).toEqual({
      form: 'classes',
      classes: { devDependencies: true },
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

  it('rejects invalid patterns in either shape', () => {
    expect(() => normalizePackagePrune(['pkg@1.0.0'])).toThrow(InvalidPackageNamePatternError)
    expect(() => normalizePackagePrune({ dependencies: ['pkg@1.0.0'] }))
      .toThrow(InvalidPackageNamePatternError)
  })

  it('normalizes a member-scoped remove entry, desugaring true to the catch-all pattern', () => {
    expect(normalizePackagePrune([{ member: 'my-app', remove: { dependencies: true } }])).toEqual({
      form: 'entries',
      entries: [{
        kind: 'remove',
        member: [{ name: 'my-app', wildcard: false, exclude: false }],
        remove: { dependencies: [{ name: '**', wildcard: true, exclude: false }] },
      }],
    })
  })

  it('normalizes member root tokens and pattern lists', () => {
    expect(normalizePackagePrune([{ member: ['.', '!.', '@acme/**'], remove: ['left-pad'] }])).toEqual({
      form: 'entries',
      entries: [{
        kind: 'remove',
        member: [
          { root: true, exclude: false },
          { root: true, exclude: true },
          { name: '@acme/**', wildcard: true, exclude: false },
        ],
        remove: Object.fromEntries(DEPENDENCY_CLASSES.map(dependencyClass => [
          dependencyClass,
          [{ name: 'left-pad', wildcard: false, exclude: false }],
        ])),
      }],
    })
  })

  it('records whether a keep was written as a flat pattern list', () => {
    const flat = normalizePackagePrune([{ member: 'my-app', keep: ['left-pad'] }])
    expect(flat?.form === 'entries' && flat.entries[0]).toMatchObject({ kind: 'keep', flat: true })
    const keyed = normalizePackagePrune([{ member: 'my-app', keep: { dependencies: ['left-pad'] } }])
    expect(keyed?.form === 'entries' && keyed.entries[0]).toMatchObject({ kind: 'keep', flat: false })
  })

  it('accepts an empty keep as "keep nothing"', () => {
    expect(normalizePackagePrune([{ member: 'my-app', keep: [] }])).toEqual({
      form: 'entries',
      entries: [{
        kind: 'keep',
        member: [{ name: 'my-app', wildcard: false, exclude: false }],
        keep: {},
        flat: true,
      }],
    })
  })

  it('does not alias one pattern array across classes for a flat selection', () => {
    const normalized = normalizePackagePrune([{ member: 'my-app', remove: ['@acme/*'] }])
    const entry = normalized?.form === 'entries' && normalized.entries[0].kind === 'remove'
      ? normalized.entries[0]
      : undefined
    expect(entry?.remove.dependencies).not.toBe(entry?.remove.devDependencies)
    expect(entry?.remove.peerDependencies).not.toBe(entry?.remove.optionalDependencies)
  })

  it('points a member-scoped object nested inside a pattern list at the top-level array form', () => {
    // The likely mistake behind an object in a class-keyed pattern list
    // is a member entry in the wrong position; the generic pattern error
    // would only say '[object Object]' is not a valid name.
    expect(() => normalizePackagePrune({
      devDependencies: [{ member: 'my-app', remove: { dependencies: true } } as any],
    })).toThrow(
      `'devDependencies' entries must be package name patterns`
      + ` (member-scoped objects are only valid in the top-level prune array)`,
    )
    expect(() => normalizePackagePrune([
      { member: 'my-app', remove: [{ member: 'other', remove: ['x'] } as any] },
    ])).toThrow(/'remove' entries must be package name patterns/)
    expect(() => normalizePackagePrune([
      { member: 'my-app', keep: { dependencies: [{ member: 'other', keep: [] } as any] } },
    ])).toThrow(/'dependencies' entries must be package name patterns/)
    // A member list takes name patterns, not structured selectors.
    expect(() => normalizePackagePrune([
      { member: [{ name: 'my-app' }] as any, remove: ['x'] },
    ])).toThrow(/'member' entries must be member name patterns or the '\.' root token/)
    // The hint is for plain objects only; a nested array is not a
    // misplaced member entry and keeps the generic pattern error.
    expect(() => normalizePackagePrune({ dependencies: [['@acme/a']] as any }))
      .toThrow(InvalidPackageNamePatternError)
  })

  it('rejects a non-object, non-string array entry', () => {
    expect(() => normalizePackagePrune([42 as any]))
      .toThrow(/each entry must be a package name pattern or a member-scoped object/)
    expect(() => normalizePackagePrune([new Set() as any]))
      .toThrow(/each entry must be a package name pattern or a member-scoped object/)
  })

  it('rejects a scoped entry without a member', () => {
    expect(() => normalizePackagePrune([{ remove: ['left-pad'] } as any]))
      .toThrow(/'member' must be a workspace member name pattern or a non-empty array of them/)
    expect(() => normalizePackagePrune([{ member: [], remove: ['left-pad'] }]))
      .toThrow(/'member' must be a workspace member name pattern or a non-empty array of them/)
  })

  it('rejects a scoped entry without exactly one of remove and keep', () => {
    expect(() => normalizePackagePrune([{ member: 'my-app' } as any]))
      .toThrow(/must have exactly one of 'remove' and 'keep'/)
    expect(() => normalizePackagePrune([{ member: 'my-app', remove: [], keep: [] }]))
      .toThrow(/must have exactly one of 'remove' and 'keep'/)
  })

  it('rejects unknown scoped entry fields', () => {
    expect(() => normalizePackagePrune([{ member: 'my-app', remove: ['x'], extra: true } as any]))
      .toThrow(/'extra' is not a member-scoped prune entry field \(expected member, remove, keep\)/)
  })

  it('rejects a non-list, non-map remove or keep value', () => {
    expect(() => normalizePackagePrune([{ member: 'my-app', remove: 'left-pad' } as any]))
      .toThrow(/'remove' must be an array of package name patterns or an object keyed by dependency class/)
    expect(() => normalizePackagePrune([{ member: 'my-app', keep: true } as any]))
      .toThrow(/'keep' must be an array of package name patterns or an object keyed by dependency class/)
  })

  it('rejects unknown dependency classes and bad patterns inside scoped entries', () => {
    expect(() => normalizePackagePrune([{ member: 'my-app', keep: { bundled: ['x'] } } as any]))
      .toThrow(/'bundled' is not a dependency class/)
    expect(() => normalizePackagePrune([{ member: 'my-app', remove: ['pkg@1.0.0'] }]))
      .toThrow(InvalidPackageNamePatternError)
    expect(() => normalizePackagePrune([{ member: 'pkg@1.0.0', remove: ['x'] }]))
      .toThrow(InvalidPackageNamePatternError)
    expect(() => normalizePackagePrune([{ member: './packages/app', remove: ['x'] }]))
      .toThrow(InvalidPackageNamePatternError)
  })
})

describe('resolveManifestPrune()', () => {
  it('resolves the class-keyed form identically for every member', () => {
    const normalized = normalizePackagePrune({ peerDependencies: true, dependencies: ['@acme/*'] })!
    for (const member of [fixtureMember, { name: 'other', root: true }]) {
      const resolved = resolveManifestPrune(normalized, member)
      expect(resolved?.mode === 'remove' && resolved.classes.peerDependencies).toBe(true)
      expect(resolved?.mode === 'remove' && resolved.classes.dependencies).toHaveLength(1)
    }
  })

  it('fans global entries out to every class for every member', () => {
    const resolved = resolvePrune(['@acme/*', 'left-pad'])
    expect(resolved.mode).toBe('remove')
    for (const dependencyClass of DEPENDENCY_CLASSES) {
      expect(resolved.mode === 'remove' && resolved.classes[dependencyClass]).toHaveLength(2)
    }
  })

  it('gates scoped entries on the member selector', () => {
    const normalized = normalizePackagePrune([{ member: 'my-app', remove: ['@acme/*'] }])!
    expect(resolveManifestPrune(normalized, { name: 'my-app', root: false })).toBeDefined()
    expect(resolveManifestPrune(normalized, { name: 'other', root: false })).toBeUndefined()
  })

  it('matches member wildcards with last-entry-wins exclusions', () => {
    const normalized = normalizePackagePrune([{ member: ['@acme/**', '!@acme/e2e'], remove: ['left-pad'] }])!
    expect(resolveManifestPrune(normalized, { name: '@acme/app', root: false })).toBeDefined()
    expect(resolveManifestPrune(normalized, { name: '@acme/e2e', root: false })).toBeUndefined()
    const reSelected = normalizePackagePrune([{ member: ['!@acme/e2e', '@acme/**'], remove: ['left-pad'] }])!
    // An exclusion before any selection is a no-op, as in name pattern lists.
    expect(resolveManifestPrune(reSelected, { name: '@acme/e2e', root: false })).toBeDefined()
  })

  it('addresses the workspace root with \'.\' and excludes it with \'!.\'', () => {
    const rootOnly = normalizePackagePrune([{ member: '.', remove: ['left-pad'] }])!
    expect(resolveManifestPrune(rootOnly, { name: 'fixture', root: true })).toBeDefined()
    expect(resolveManifestPrune(rootOnly, fixtureMember)).toBeUndefined()

    const allButRoot = normalizePackagePrune([{ member: ['**', '!.'], remove: ['left-pad'] }])!
    expect(resolveManifestPrune(allButRoot, fixtureMember)).toBeDefined()
    expect(resolveManifestPrune(allButRoot, { name: 'fixture', root: true })).toBeUndefined()
  })

  it('matches a nameless root only by \'.\', without crashing on name patterns', () => {
    const wildcard = normalizePackagePrune([{ member: '**', remove: ['left-pad'] }])!
    expect(resolveManifestPrune(wildcard, { name: undefined, root: true })).toBeUndefined()
    const rootToken = normalizePackagePrune([{ member: '.', remove: ['left-pad'] }])!
    expect(resolveManifestPrune(rootToken, { name: undefined, root: true })).toBeDefined()
  })

  it('matches the root by name as well when it has one', () => {
    const normalized = normalizePackagePrune([{ member: 'workspace-root', remove: ['left-pad'] }])!
    expect(resolveManifestPrune(normalized, { name: 'workspace-root', root: true })).toBeDefined()
  })

  it('combines global and matching scoped removals per class in listed order', () => {
    const resolved = resolvePrune([
      { member: 'fixture', remove: { dependencies: ['@acme/*'] } },
      '!@acme/utils',
    ])
    expect(resolved.mode === 'remove' && resolved.classes.dependencies).toEqual([
      { name: '@acme/*', wildcard: true, exclude: false },
      { name: '@acme/utils', wildcard: false, exclude: true },
    ])
    expect(resolved.mode === 'remove' && resolved.classes.devDependencies).toEqual([
      { name: '@acme/utils', wildcard: false, exclude: true },
    ])
  })

  it('returns undefined when nothing targets the member', () => {
    const normalized = normalizePackagePrune([{ member: 'other', remove: ['**'] }])!
    expect(resolveManifestPrune(normalized, fixtureMember)).toBeUndefined()
  })

  it('lets a matched keep govern alone, unioning multiple keeps', () => {
    const resolved = resolvePrune([
      '@acme/*',
      { member: 'fixture', keep: { dependencies: ['@acme/utils'] } },
      { member: '**', keep: { devDependencies: ['typescript'] } },
    ])
    expect(resolved.mode).toBe('keep')
    expect(resolved.mode === 'keep' && resolved.keeps).toHaveLength(2)
  })

  it('applies removals to members no keep matches', () => {
    const normalized = normalizePackagePrune([
      '@acme/*',
      { member: 'my-app', keep: ['@acme/utils'] },
    ])!
    const resolved = resolveManifestPrune(normalized, fixtureMember)
    expect(resolved?.mode).toBe('remove')
  })

  it('does not alias one resolved pattern array across classes', () => {
    const resolved = resolvePrune(['@acme/*'])
    expect(resolved.mode === 'remove' && resolved.classes.dependencies)
      .not.toBe(resolved.mode === 'remove' && resolved.classes.devDependencies)
  })
})

describe('prunePackageJson()', () => {
  it('removes matching packages from every class for the array shape', () => {
    const result = prunePackageJson(manifest(), resolvePrune(['@acme/*']))
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

  it('touches only the configured class for the class-keyed shape', () => {
    const result = prunePackageJson(manifest(), resolvePrune({ peerDependencies: ['@acme/*'] }))
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
    const result = prunePackageJson(manifest(), resolvePrune({ peerDependencies: true }))
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
    const result = prunePackageJson(manifest(), resolvePrune({ devDependencies: true }))
    const parsed = JSON.parse(result!.content)
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeDefined()
  })

  it('deletes a class object emptied by pattern removal', () => {
    const result = prunePackageJson(manifest(), resolvePrune({ peerDependencies: ['@acme/*', 'react'] }))
    const parsed = JSON.parse(result!.content)
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('combines true and pattern classes in one pass', () => {
    const result = prunePackageJson(manifest(), resolvePrune({
      devDependencies: true,
      dependencies: ['left-pad'],
    }))
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
    const result = prunePackageJson(manifest(), resolvePrune({
      peerDependencies: ['@acme/*', '!@acme/heavy-icons'],
    }))
    // The exclusion spares the one peer the earlier wildcard selected.
    expect(result).toEqual({ content: manifest(), removed: [], changed: false })

    const reResult = prunePackageJson(manifest(), resolvePrune({
      peerDependencies: ['@acme/*', '!@acme/*', '@acme/heavy-icons'],
    }))
    expect(reResult!.removed).toEqual(['peerDependencies:@acme/heavy-icons'])
  })

  it('treats an exclusion before any selection as a no-op', () => {
    const result = prunePackageJson(manifest(), resolvePrune({
      peerDependencies: ['!@acme/heavy-icons', '@acme/*'],
    }))
    // Exclusions only subtract from earlier entries, so the later wildcard
    // still removes the peer — embed's order semantics.
    expect(result!.removed).toEqual(['peerDependencies:@acme/heavy-icons'])
  })

  it('empties every class except the spared package with the pre-globstar catch-all spelling', () => {
    // The `['*', '@*/*', '!keep']` spelling predates the `**` globstar and
    // must keep working; this pins both halves it relies on (a `*` allowed
    // in the scope segment, and segment-wise matching of the scoped
    // catch-all).
    const result = prunePackageJson(manifest(), resolvePrune(['*', '@*/*', '!@acme/utils']))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0' })
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.optionalDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('removes every dependency, scoped or not, with a bare globstar', () => {
    const result = prunePackageJson(manifest(), resolvePrune(['**']))
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
    const result = prunePackageJson(manifest(), resolvePrune(['**', '!@acme/utils']))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0' })
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.optionalDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
  })

  it('removes nothing for an exclusion-only list', () => {
    const content = manifest()
    expect(prunePackageJson(content, resolvePrune(['!@acme/*'])))
      .toEqual({ content, removed: [], changed: false })
  })

  it('applies exclusions to every class for the array shape', () => {
    const result = prunePackageJson(manifest(), resolvePrune(['@acme/*', '!@acme/utils']))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0', 'left-pad': '^1.3.0' })
    expect(result!.removed.sort()).toEqual([
      'devDependencies:@acme/eslint-config',
      'optionalDependencies:@acme/native-helper',
      'peerDependencies:@acme/heavy-icons',
    ])
  })

  it('lets a scoped exclusion spare an entry a global pattern selected', () => {
    const result = prunePackageJson(manifest(), resolvePrune([
      '@acme/*',
      { member: 'fixture', remove: { dependencies: ['!@acme/utils'] } },
    ]))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0', 'left-pad': '^1.3.0' })
    // Other classes still lose their @acme entries.
    expect(parsed.devDependencies).toEqual({ typescript: '^5.4.0' })
  })

  it('empties unmentioned classes for a class-keyed keep and keeps only the selected entries', () => {
    const result = prunePackageJson(manifest(), resolvePrune([{
      member: 'fixture',
      keep: {
        dependencies: ['@acme/utils'],
        devDependencies: ['typescript'],
      },
    }]))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0' })
    expect(parsed.devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(parsed.peerDependencies).toBeUndefined()
    expect(parsed.peerDependenciesMeta).toBeUndefined()
    expect(parsed.optionalDependencies).toBeUndefined()
    expect(parsed.scripts).toEqual({ build: 'tsc' })
    expect(result!.removed.sort()).toEqual([
      'dependencies:left-pad',
      'devDependencies:@acme/eslint-config',
      'optionalDependencies:@acme/native-helper',
      'optionalDependencies:fsevents',
      'peerDependencies:@acme/heavy-icons',
      'peerDependencies:react',
    ])
  })

  it('keeps a flat keep selection in any class, with kept peers retaining their meta', () => {
    const result = prunePackageJson(manifest(), resolvePrune([{ member: 'fixture', keep: ['react'] }]))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toBeUndefined()
    expect(parsed.devDependencies).toBeUndefined()
    expect(parsed.peerDependencies).toEqual({ react: '^18.0.0' })
    expect(parsed.peerDependenciesMeta).toEqual({ react: { optional: true } })
    expect(parsed.optionalDependencies).toBeUndefined()
  })

  it('keeps a whole class with keep true', () => {
    const result = prunePackageJson(manifest(), resolvePrune([{
      member: 'fixture',
      keep: { peerDependencies: true },
    }]))
    const parsed = JSON.parse(result!.content)
    expect(parsed.peerDependencies).toEqual({
      '@acme/heavy-icons': '^6.0.0',
      'react': '^18.0.0',
    })
    expect(parsed.peerDependenciesMeta).toEqual({
      '@acme/heavy-icons': { optional: false },
      'react': { optional: true },
    })
    expect(parsed.dependencies).toBeUndefined()
  })

  it('cancels global removals for a keep-governed member', () => {
    const content = manifest()
    // The global catch-all would empty everything, but keep is absolute
    // within its matched members.
    expect(prunePackageJson(content, resolvePrune(['**', { member: 'fixture', keep: ['**'] }])))
      .toEqual({ content, removed: [], changed: false })
  })

  it('unions multiple keep entries hitting the same member', () => {
    const result = prunePackageJson(manifest(), resolvePrune([
      { member: 'fixture', keep: { dependencies: ['@acme/utils'] } },
      { member: '**', keep: { dependencies: ['left-pad'], devDependencies: ['typescript'] } },
    ]))
    const parsed = JSON.parse(result!.content)
    expect(parsed.dependencies).toEqual({ '@acme/utils': '^1.0.0', 'left-pad': '^1.3.0' })
    expect(parsed.devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(parsed.peerDependencies).toBeUndefined()
  })

  it('empties every class for an empty keep', () => {
    const result = prunePackageJson(manifest(), resolvePrune([{ member: 'fixture', keep: [] }]))
    const parsed = JSON.parse(result!.content)
    for (const dependencyClass of DEPENDENCY_CLASSES) {
      expect(parsed[dependencyClass]).toBeUndefined()
    }
    expect(parsed.peerDependenciesMeta).toBeUndefined()
    expect(parsed.name).toBe('fixture')
  })

  it('honors keep-list exclusions in the union', () => {
    const result = prunePackageJson(manifest(), resolvePrune([{
      member: 'fixture',
      keep: { dependencies: ['@acme/*', '!@acme/utils'] },
    }]))
    const parsed = JSON.parse(result!.content)
    // The exclusion drops @acme/utils back out of the kept set.
    expect(parsed.dependencies).toBeUndefined()
    expect(result!.removed).toContain('dependencies:@acme/utils')
  })

  it('returns the original content unchanged when nothing matches', () => {
    const content = manifest()
    const result = prunePackageJson(content, resolvePrune(['@other/*']))
    expect(result).toEqual({ content, removed: [], changed: false })
  })

  it('no-ops on a manifest without the configured class', () => {
    const content = JSON.stringify({ name: 'bare', version: '1.0.0' })
    expect(prunePackageJson(content, resolvePrune({ peerDependencies: true })))
      .toEqual({ content, removed: [], changed: false })
  })

  it('clears peerDependenciesMeta with true even without a peerDependencies section', () => {
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      peerDependenciesMeta: { react: { optional: true } },
    })
    const result = prunePackageJson(content, resolvePrune({ peerDependencies: true }))
    expect(result!.changed).toBe(true)
    expect(result!.removed).toEqual([])
    expect(JSON.parse(result!.content)).toEqual({ name: 'bare', version: '1.0.0' })
  })

  it('does not carry the class-keyed true structural extras into entry-form removals', () => {
    // Inside a member-scoped entry `true` is exactly the '**' catch-all:
    // it removes every peer (and each removed peer's meta entry), but a
    // meta entry with no matching peer — unreachable by name patterns —
    // survives, unlike the standalone class-keyed `peerDependencies: true`.
    // Pinned as a deliberate contract: entry-form selections compose in
    // listed order, so they carry no whole-class structural rule.
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      peerDependencies: { react: '^18.0.0' },
      peerDependenciesMeta: {
        react: { optional: true },
        ghost: { optional: true },
      },
    })
    const scoped = resolvePrune(
      [{ member: 'bare', remove: { peerDependencies: true } }],
      { name: 'bare', root: false },
    )
    const result = prunePackageJson(content, scoped)
    expect(JSON.parse(result!.content)).toEqual({
      name: 'bare',
      version: '1.0.0',
      peerDependenciesMeta: { ghost: { optional: true } },
    })
    // Keep mode behaves the same way for the entries it removes.
    const kept = prunePackageJson(content, resolvePrune(
      [{ member: 'bare', keep: [] }],
      { name: 'bare', root: false },
    ))
    expect(JSON.parse(kept!.content)).toEqual({
      name: 'bare',
      version: '1.0.0',
      peerDependenciesMeta: { ghost: { optional: true } },
    })
  })

  it('clears an empty peerDependencies section and its meta with true', () => {
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      peerDependencies: {},
      peerDependenciesMeta: { react: { optional: true } },
    })
    const result = prunePackageJson(content, resolvePrune({ peerDependencies: true }))
    expect(result!.changed).toBe(true)
    expect(result!.removed).toEqual([])
    expect(JSON.parse(result!.content)).toEqual({ name: 'bare', version: '1.0.0' })
  })

  it('leaves a section that was already empty alone', () => {
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      dependencies: { '@acme/utils': '^1.0.0' },
      devDependencies: {},
      optionalDependencies: {},
    })
    const result = prunePackageJson(content, resolvePrune(['@acme/*']))
    expect(JSON.parse(result!.content)).toEqual({
      name: 'bare',
      version: '1.0.0',
      devDependencies: {},
      optionalDependencies: {},
    })
    expect(result!.removed).toEqual(['dependencies:@acme/utils'])
  })

  it('never touches a dependency class that is not a plain object', () => {
    const content = JSON.stringify({
      name: 'bare',
      version: '1.0.0',
      dependencies: ['@acme/utils'],
      devDependencies: 'not an object',
    })
    expect(prunePackageJson(content, resolvePrune({ dependencies: true, devDependencies: ['@acme/*'] })))
      .toEqual({ content, removed: [], changed: false })
    // Keep mode follows the same structural rule.
    expect(prunePackageJson(content, resolvePrune([{ member: 'bare', keep: [] }], { name: 'bare', root: false })))
      .toEqual({ content, removed: [], changed: false })
  })

  it('leaves untouched fields structurally identical', () => {
    const content = manifest({
      pnpm: { patchedDependencies: { 'left-pad@1.3.0': 'patches/left-pad@1.3.0.patch' } },
      workspaces: ['packages/*'],
    })
    const result = prunePackageJson(content, resolvePrune(['@acme/*']))
    const parsed = JSON.parse(result!.content)
    const original = JSON.parse(content)
    expect(parsed.name).toEqual(original.name)
    expect(parsed.version).toEqual(original.version)
    expect(parsed.scripts).toEqual(original.scripts)
    expect(parsed.pnpm).toEqual(original.pnpm)
    expect(parsed.workspaces).toEqual(original.workspaces)
  })

  it('returns undefined for unparseable content', () => {
    expect(prunePackageJson('not json {', resolvePrune(['@acme/*']))).toBeUndefined()
  })

  it('returns undefined for a non-object manifest', () => {
    const resolved = resolvePrune(['@acme/*'])
    expect(prunePackageJson('[]', resolved)).toBeUndefined()
    expect(prunePackageJson('null', resolved)).toBeUndefined()
    expect(prunePackageJson('"str"', resolved)).toBeUndefined()
  })

  it('fails closed on a manifest whose serialization is lossy', () => {
    // 1e999 parses to Infinity but stringifies as null, so the reparse of
    // the rewrite cannot equal the expectation.
    const content = '{"someTool":{"limit":1e999},"dependencies":{"@acme/utils":"^1.0.0","keep":"^1.0.0"}}'
    expect(prunePackageJson(content, resolvePrune(['@acme/*']))).toBeUndefined()
  })

  it('accepts a faithful rewrite in verifyPrunedManifest', () => {
    const resolved = resolvePrune(['@acme/*'])
    const original = manifest()
    const { content: rewritten, removed } = prunePackageJson(original, resolved)!
    expect(verifyPrunedManifest(original, rewritten, resolved, removed)).toBe(rewritten)
  })

  it('fails closed in verifyPrunedManifest when the rewrite touched anything else', () => {
    const resolved = resolvePrune(['@acme/*'])
    const original = manifest()
    const { content, removed } = prunePackageJson(original, resolved)!
    const mangled = JSON.parse(content)
    mangled.scripts = {}
    expect(verifyPrunedManifest(original, JSON.stringify(mangled, null, 2), resolved, removed)).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest when the wrong entry was deleted', () => {
    // The replay works from the reported labels, so a matcher that deleted
    // one package while reporting another cannot pass.
    const original = manifest()
    const mangled = JSON.parse(original)
    delete mangled.dependencies['left-pad']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(mangled, null, 2),
      resolvePrune(['@acme/*']),
      ['dependencies:@acme/utils'],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on a removal an exclusion spared', () => {
    const original = manifest()
    const strayed = JSON.parse(original)
    delete strayed.dependencies['@acme/utils']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayed, null, 2),
      resolvePrune({ dependencies: ['@acme/*', '!@acme/utils'] }),
      ['dependencies:@acme/utils'],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on a removal the configuration does not select', () => {
    const original = manifest()
    // A class the prune never configured...
    const strayedClass = JSON.parse(original)
    delete strayedClass.dependencies['@acme/utils']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayedClass, null, 2),
      resolvePrune({ peerDependencies: ['@acme/*'] }),
      ['dependencies:@acme/utils'],
    )).toBeUndefined()
    // ...and a name no configured pattern matches.
    const strayedName = JSON.parse(original)
    delete strayedName.dependencies['left-pad']
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayedName, null, 2),
      resolvePrune({ dependencies: ['@acme/*'] }),
      ['dependencies:left-pad'],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on a removal the keep selects', () => {
    const original = manifest()
    const strayed = JSON.parse(original)
    delete strayed.dependencies['@acme/utils']
    delete strayed.dependencies['left-pad']
    delete strayed.devDependencies
    delete strayed.peerDependencies
    delete strayed.peerDependenciesMeta
    delete strayed.optionalDependencies
    // The rewrite went beyond the keep: '@acme/utils' is keep-selected, so
    // its removal label is unauthorized even though everything else is.
    expect(verifyPrunedManifest(
      original,
      JSON.stringify(strayed, null, 2),
      resolvePrune([{ member: 'fixture', keep: ['@acme/utils'] }]),
      [
        'dependencies:@acme/utils',
        'dependencies:left-pad',
        'devDependencies:@acme/eslint-config',
        'devDependencies:typescript',
        'peerDependencies:@acme/heavy-icons',
        'peerDependencies:react',
        'optionalDependencies:@acme/native-helper',
        'optionalDependencies:fsevents',
      ],
    )).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest when a keep rewrite touched anything else', () => {
    const resolved = resolvePrune([{ member: 'fixture', keep: ['@acme/utils'] }])
    const original = manifest()
    const { content, removed } = prunePackageJson(original, resolved)!
    const mangled = JSON.parse(content)
    mangled.scripts = {}
    expect(verifyPrunedManifest(original, JSON.stringify(mangled, null, 2), resolved, removed)).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on unparseable inputs', () => {
    const resolved = resolvePrune(['@acme/*'])
    expect(verifyPrunedManifest('{', '{}', resolved, [])).toBeUndefined()
    expect(verifyPrunedManifest('{}', '{', resolved, [])).toBeUndefined()
  })

  it('fails closed in verifyPrunedManifest on labels outside the dependency classes', () => {
    // Labels are defense-in-depth input: a class that is not a dependency
    // class must fail closed, including Object.prototype keys that would
    // otherwise resolve to inherited values — in keep mode too, where an
    // unknown class never has a keep selection and would otherwise read as
    // "not kept, so authorized".
    for (const resolved of [resolvePrune(['*']), resolvePrune([{ member: 'fixture', keep: [] }])]) {
      expect(verifyPrunedManifest('{}', '{}', resolved, ['__proto__:x'])).toBeUndefined()
      expect(verifyPrunedManifest('{}', '{}', resolved, ['constructor:x'])).toBeUndefined()
      expect(verifyPrunedManifest('{}', '{}', resolved, ['scripts:build'])).toBeUndefined()
      expect(verifyPrunedManifest('{}', '{}', resolved, ['nocolon'])).toBeUndefined()
    }
  })
})

describe('MemberPruneDiagnostics', () => {
  const lint = (raw: BundlePackagesPrune): MemberPruneDiagnostics =>
    new MemberPruneDiagnostics(normalizePackagePrune(raw))

  it('warns for a scoped entry whose selector matched no workspace member', () => {
    const diagnostics = lint([
      { member: 'present', remove: ['left-pad'] },
      { member: ['@acme/**', '!@acme/e2e'], keep: ['left-pad'] },
    ])
    diagnostics.observeWorkspaceMember({ name: 'present', root: false })
    diagnostics.observeWorkspaceMember({ name: '@acme/e2e', root: false })
    expect(diagnostics.warnings()).toEqual([
      `bundle.packages.prune entry for member '@acme/**', '!@acme/e2e' matched no workspace member`,
    ])
  })

  it('does not warn for a selector whose workspace member was not bundled this run', () => {
    // Which members land in a bundle varies with the check filter, so a
    // matching-but-unbundled member is debug material, not a warning.
    const diagnostics = lint([{ member: 'present', remove: ['left-pad'] }])
    diagnostics.observeWorkspaceMember({ name: 'present', root: false })
    expect(diagnostics.warnings()).toEqual([])
  })

  it('never warns for global entries or the class-keyed form', () => {
    const globals = lint(['@acme/*', '!left-pad'])
    expect(globals.warnings()).toEqual([])
    const classes = lint({ peerDependencies: true })
    expect(classes.warnings()).toEqual([])
  })

  it('names member, class and pattern for a class-keyed keep miss', () => {
    const diagnostics = lint([{
      member: 'fixture',
      keep: { dependencies: ['@acme/utils', 'absent'], devDependencies: ['@acme/utils'] },
    }])
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, manifest())
    expect(diagnostics.warnings()).toEqual([
      `bundle.packages.prune keep pattern 'absent' matched nothing in dependencies of 'fixture'; its bundled manifest does not keep it`,
      // The right name in the wrong class reports the same way.
      `bundle.packages.prune keep pattern '@acme/utils' matched nothing in devDependencies of 'fixture'; its bundled manifest does not keep it`,
    ])
  })

  it('warns once across classes for a flat keep miss', () => {
    const diagnostics = lint([{ member: 'fixture', keep: ['react', 'absent'] }])
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, manifest())
    expect(diagnostics.warnings()).toEqual([
      `bundle.packages.prune keep pattern 'absent' matched nothing in any dependency class of 'fixture'; its bundled manifest does not keep it`,
    ])
  })

  it('aggregates a keep miss across members into one warning naming each member', () => {
    const diagnostics = lint([{ member: '@acme/**', keep: ['absent'] }])
    for (const name of ['@acme/app', '@acme/api']) {
      const member = { name, root: false }
      diagnostics.observeWorkspaceMember(member)
      diagnostics.observeManifestContent(member, '{"dependencies":{"left-pad":"^1.3.0"}}')
    }
    // One line per pattern, naming every member it missed — a shared keep
    // list over a wildcard selector must not burst one line per member,
    // but each missed member must still be named.
    expect(diagnostics.warnings()).toEqual([
      `bundle.packages.prune keep pattern 'absent' matched nothing`
      + ` in any dependency class of '@acme/app', '@acme/api'; their bundled manifests do not keep it`,
    ])
  })

  it('warns when later exclusions cancel everything a keep pattern selected', () => {
    const diagnostics = lint([{ member: 'solo', keep: ['@acme/*', '!@acme/heavy'] }])
    const solo = { name: 'solo', root: false }
    diagnostics.observeWorkspaceMember(solo)
    diagnostics.observeManifestContent(solo, '{"dependencies":{"@acme/heavy":"^1.0.0"}}')
    // '@acme/heavy' is the only name '@acme/*' selects, and the exclusion
    // takes it back out — the member is silently gutted, which must warn.
    expect(diagnostics.warnings()).toEqual([
      `bundle.packages.prune keep pattern '@acme/*' matched nothing in any dependency class of 'solo'; its bundled manifest does not keep it`,
    ])
  })

  it('does not warn when another matching keep entry rescues the name', () => {
    // Reach is judged against the union of every matching keep entry —
    // the member's actual retention — so a name one entry's exclusion
    // drops but another entry keeps is not a miss.
    const diagnostics = lint([
      { member: 'fixture', keep: { dependencies: ['@acme/*', '!@acme/utils'] } },
      { member: '**', keep: { dependencies: ['@acme/utils'] } },
    ])
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, manifest())
    expect(diagnostics.warnings()).toEqual([])
  })

  it('does not warn for a keep pattern that still keeps something past its exclusions', () => {
    const diagnostics = lint([{ member: 'fixture', keep: ['@acme/*', '!@acme/heavy-icons'] }])
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, manifest())
    // '@acme/utils' and others survive the exclusion, so '@acme/*' reaches.
    expect(diagnostics.warnings()).toEqual([])
  })

  it('exempts exclusions and the bare catch-all from keep match checks', () => {
    const diagnostics = lint([{
      member: 'fixture',
      // devDependencies: true desugars to the '**' catch-all.
      keep: { dependencies: ['@acme/*', '!absent'], devDependencies: true },
    }])
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, manifest())
    expect(diagnostics.warnings()).toEqual([])
  })

  it('checks keep selections only against members the entry matches', () => {
    const diagnostics = lint([{ member: 'other', keep: ['absent'] }])
    diagnostics.observeWorkspaceMember({ name: 'other', root: false })
    diagnostics.observeManifestContent({ name: 'other', root: false }, manifest())
    // 'fixture' misses every keep pattern, but the entry does not match it.
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, manifest())
    const warnings = diagnostics.warnings()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(`of 'other'`)
  })

  it('labels a nameless root by its token', () => {
    const diagnostics = lint([{ member: '.', keep: ['absent'] }])
    const root = { name: undefined, root: true }
    diagnostics.observeWorkspaceMember(root)
    diagnostics.observeManifestContent(root, '{"dependencies":{"left-pad":"^1.3.0"}}')
    expect(diagnostics.warnings()).toEqual([
      `bundle.packages.prune keep pattern 'absent' matched nothing in any dependency class of '.'; its bundled manifest does not keep it`,
    ])
  })

  it('ignores unparseable and non-object manifest content', () => {
    const diagnostics = lint([{ member: 'fixture', keep: ['absent'] }])
    diagnostics.observeWorkspaceMember(fixtureMember)
    diagnostics.observeManifestContent(fixtureMember, 'not json {')
    diagnostics.observeManifestContent(fixtureMember, '[]')
    expect(diagnostics.warnings()).toEqual([])
  })
})
