import { describe, it, expect } from 'vitest'

import {
  parseEmbeddedPackageSpec,
  parsePackageNamePattern,
  InvalidEmbeddedPackageSpecError,
  InvalidPackageNamePatternError,
  specLooselyMatchesPackage,
  specMatchesPackage,
  specMatchesPackageName,
} from '../spec.js'

describe('parseEmbeddedPackageSpec()', () => {
  it('parses a bare package name', () => {
    expect(parseEmbeddedPackageSpec('some-package')).toEqual({
      raw: 'some-package',
      name: 'some-package',
      version: undefined,
      wildcard: false,
      exclude: false,
    })
  })

  it('parses a scoped package name', () => {
    expect(parseEmbeddedPackageSpec('@acme/private-utils')).toEqual({
      raw: '@acme/private-utils',
      name: '@acme/private-utils',
      version: undefined,
      wildcard: false,
      exclude: false,
    })
  })

  it('parses a name@version pin', () => {
    expect(parseEmbeddedPackageSpec('some-package@2.1.0')).toEqual({
      raw: 'some-package@2.1.0',
      name: 'some-package',
      version: '2.1.0',
      wildcard: false,
      exclude: false,
    })
  })

  it('parses a scoped name@version pin', () => {
    expect(parseEmbeddedPackageSpec('@acme/private-utils@1.0.0-beta.3')).toEqual({
      raw: '@acme/private-utils@1.0.0-beta.3',
      name: '@acme/private-utils',
      version: '1.0.0-beta.3',
      wildcard: false,
      exclude: false,
    })
  })

  it('normalizes a v-prefixed version', () => {
    expect(parseEmbeddedPackageSpec('some-package@v2.1.0').version).toBe('2.1.0')
  })

  it('accepts legacy package names with uppercase letters', () => {
    expect(parseEmbeddedPackageSpec('JSONStream').name).toBe('JSONStream')
    expect(parseEmbeddedPackageSpec('@acme/AuthClient@1.0.0')).toEqual({
      raw: '@acme/AuthClient@1.0.0',
      name: '@acme/AuthClient',
      version: '1.0.0',
      wildcard: false,
      exclude: false,
    })
  })

  it('preserves build metadata in a pinned version', () => {
    expect(parseEmbeddedPackageSpec('some-package@1.0.0+build.7').version).toBe('1.0.0+build.7')
  })

  it('trims whitespace around a pinned version', () => {
    expect(parseEmbeddedPackageSpec('some-package@ 2.1.0 ').version).toBe('2.1.0')
  })

  it('parses a leading ! as an exclusion, keeping it in the raw entry', () => {
    expect(parseEmbeddedPackageSpec('!some-package')).toEqual({
      raw: '!some-package',
      name: 'some-package',
      version: undefined,
      wildcard: false,
      exclude: true,
    })
  })

  it('parses an excluded scoped name without mistaking the scope for a version', () => {
    expect(parseEmbeddedPackageSpec('!@acme/private-utils')).toEqual({
      raw: '!@acme/private-utils',
      name: '@acme/private-utils',
      version: undefined,
      wildcard: false,
      exclude: true,
    })
  })

  it('parses an excluded name@version pin', () => {
    expect(parseEmbeddedPackageSpec('!some-package@2.1.0')).toEqual({
      raw: '!some-package@2.1.0',
      name: 'some-package',
      version: '2.1.0',
      wildcard: false,
      exclude: true,
    })
  })

  it('parses an excluded wildcard', () => {
    const spec = parseEmbeddedPackageSpec('!@acme/*')
    expect(spec.exclude).toBe(true)
    expect(spec.name).toBe('@acme/*')
    expect(specMatchesPackageName(spec, '@acme/private-utils')).toBe(true)
  })

  it('rejects a bare !', () => {
    expect(() => parseEmbeddedPackageSpec('!')).toThrow(/must name a package or pattern after '!'/)
  })

  it('rejects an invalid name behind a !', () => {
    expect(() => parseEmbeddedPackageSpec('!Not A Valid Name')).toThrow(/not a valid npm package name/)
  })

  it('rejects an empty string', () => {
    expect(() => parseEmbeddedPackageSpec('')).toThrow(InvalidEmbeddedPackageSpecError)
  })

  it('rejects a non-string value', () => {
    expect(() => parseEmbeddedPackageSpec(42 as any)).toThrow(InvalidEmbeddedPackageSpecError)
  })

  it('rejects an invalid package name', () => {
    expect(() => parseEmbeddedPackageSpec('Not A Valid Name')).toThrow(/not a valid npm package name/)
  })

  it('rejects a bare scope', () => {
    expect(() => parseEmbeddedPackageSpec('@acme')).toThrow(/not a valid npm package name/)
  })

  it('rejects a version range', () => {
    expect(() => parseEmbeddedPackageSpec('some-package@^2.0.0')).toThrow(/not an exact semver version/)
  })

  it('rejects a dist-tag as version', () => {
    expect(() => parseEmbeddedPackageSpec('some-package@latest')).toThrow(/not an exact semver version/)
  })
})

describe('wildcard specs', () => {
  const parse = parseEmbeddedPackageSpec
  const matches = (raw: string, name: string) => specMatchesPackageName(parse(raw), name)

  it('parses a scope wildcard', () => {
    const spec = parse('@checkly/*')
    expect(spec.name).toBe('@checkly/*')
    expect(spec.wildcard).toBe(true)
    expect(spec.version).toBeUndefined()
  })

  it('leaves plain specs without a pattern', () => {
    expect(parse('@checkly/foo').wildcard).toBe(false)
  })

  it('matches every package in a scope', () => {
    expect(matches('@checkly/*', '@checkly/foo')).toBe(true)
    expect(matches('@checkly/*', '@checkly/foo-bar')).toBe(true)
    expect(matches('@checkly/*', '@other/foo')).toBe(false)
    expect(matches('@checkly/*', 'checkly')).toBe(false)
  })

  it('matches unscoped prefixes and suffixes', () => {
    expect(matches('checkly-*', 'checkly-utils')).toBe(true)
    expect(matches('checkly-*', 'checkly')).toBe(false)
    expect(matches('*-utils', 'checkly-utils')).toBe(true)
    expect(matches('*-utils', 'utils')).toBe(false)
  })

  it('matches infix wildcards inside a scope', () => {
    expect(matches('@checkly/foo-*', '@checkly/foo-bar')).toBe(true)
    expect(matches('@checkly/foo-*', '@checkly/foobar')).toBe(false)
    expect(matches('@checkly/*-foo', '@checkly/bar-foo')).toBe(true)
    expect(matches('@checkly/*-foo', '@checkly/foo')).toBe(false)
  })

  it('never crosses the scope separator', () => {
    expect(matches('*', 'unscoped')).toBe(true)
    expect(matches('*', '@checkly/foo')).toBe(false)
    expect(matches('checkly-*', '@checkly/x')).toBe(false)
  })

  it('does not treat other regex characters as special', () => {
    expect(matches('@checkly/foo.*', '@checkly/fooXbar')).toBe(false)
    expect(matches('@checkly/foo.*', '@checkly/foo.bar')).toBe(true)
  })

  it('combines a wildcard with an exact version pin', () => {
    const spec = parse('@checkly/*@1.2.3')
    expect(spec.wildcard).toBe(true)
    expect(spec.version).toBe('1.2.3')
  })

  it('treats consecutive wildcards as one', () => {
    expect(matches('a**b', 'axb')).toBe(true)
    expect(matches('a**b', 'ab')).toBe(true)
    expect(matches('*'.repeat(20), `@${'x'.repeat(120)}/pkg`)).toBe(false)
  })

  it('resolves many separated wildcards without backtracking blowup', { timeout: 2_000 }, () => {
    // The regex spelling of this pattern (`^a[^/]*a[^/]*...b$`) takes over
    // a minute on the mismatch below; the greedy matcher is O(n·m). The
    // tight test timeout is the canary against reintroducing a
    // backtracking implementation.
    const pattern = 'a*a*a*a*a*a*a*a*a*a*a*b'
    expect(matches(pattern, 'a'.repeat(200))).toBe(false)
    expect(matches(pattern, `${'a'.repeat(200)}b`)).toBe(true)
  })

  it('gives back greedily matched runs when a later literal needs them', () => {
    expect(matches('a*ab', 'aab')).toBe(true)
    expect(matches('a*ab', 'aaab')).toBe(true)
    expect(matches('a*ab', 'ab')).toBe(false)
    expect(matches('*a*', 'banana')).toBe(true)
    expect(matches('*a*a', 'banana')).toBe(true)
    expect(matches('*b*b', 'banana')).toBe(false)
    expect(matches('@x/a*ab', '@x/aab')).toBe(true)
  })

  it('rejects a wildcard that is not name-shaped', () => {
    expect(() => parse('@/*')).toThrow(/not a valid npm package name pattern/)
  })
})

describe('specMatchesPackage()', () => {
  it('matches on name alone when the spec has no pin', () => {
    const spec = parseEmbeddedPackageSpec('some-package')
    expect(specMatchesPackage(spec, { name: 'some-package', version: '1.0.0' })).toBe(true)
    expect(specMatchesPackage(spec, { name: 'other-package', version: '1.0.0' })).toBe(false)
  })

  it('requires the exact version when the spec is pinned', () => {
    const spec = parseEmbeddedPackageSpec('some-package@2.1.0')
    expect(specMatchesPackage(spec, { name: 'some-package', version: '2.1.0' })).toBe(true)
    expect(specMatchesPackage(spec, { name: 'some-package', version: '2.1.1' })).toBe(false)
  })

  it('never satisfies a pin with a version-less entry', () => {
    // Git resolutions and workspace links are recorded without a version, so
    // they have nothing to compare against a pin.
    const entry = { name: 'some-package' }
    expect(specMatchesPackage(parseEmbeddedPackageSpec('some-package@2.1.0'), entry)).toBe(false)
    expect(specMatchesPackage(parseEmbeddedPackageSpec('some-package'), entry)).toBe(true)
  })

  it('applies wildcards through the compiled name pattern', () => {
    const spec = parseEmbeddedPackageSpec('@acme/*@1.0.0')
    expect(specMatchesPackage(spec, { name: '@acme/utils', version: '1.0.0' })).toBe(true)
    expect(specMatchesPackage(spec, { name: '@acme/utils', version: '2.0.0' })).toBe(false)
    expect(specMatchesPackage(spec, { name: '@other/utils', version: '1.0.0' })).toBe(false)
  })
})

describe('specLooselyMatchesPackage()', () => {
  it('lets a version-less entry satisfy a pin', () => {
    const spec = parseEmbeddedPackageSpec('some-package@2.1.0')
    expect(specLooselyMatchesPackage(spec, { name: 'some-package' })).toBe(true)
    // ...but a version that is present still has to match.
    expect(specLooselyMatchesPackage(spec, { name: 'some-package', version: '2.1.0' })).toBe(true)
    expect(specLooselyMatchesPackage(spec, { name: 'some-package', version: '2.1.1' })).toBe(false)
  })

  it('applies wildcards through the compiled name pattern', () => {
    const spec = parseEmbeddedPackageSpec('@acme/*@1.0.0')
    expect(specLooselyMatchesPackage(spec, { name: '@acme/utils' })).toBe(true)
    expect(specLooselyMatchesPackage(spec, { name: '@other/utils' })).toBe(false)
  })

  it('still requires the name to match', () => {
    const spec = parseEmbeddedPackageSpec('some-package@2.1.0')
    expect(specLooselyMatchesPackage(spec, { name: 'other-package' })).toBe(false)
  })

  it('accepts everything the strict matcher accepts', () => {
    // The planner reports a not-embeddable reason from the strict set but
    // emits skip warnings from the loose one, so an entry the strict matcher
    // takes must never fall outside the loose one.
    const matched: string[] = []
    for (const raw of ['some-package', 'some-package@2.1.0', '@acme/*', '@acme/*@2.1.0']) {
      const spec = parseEmbeddedPackageSpec(raw)
      for (const entry of [
        { name: 'some-package' },
        { name: 'some-package', version: '2.1.0' },
        { name: 'some-package', version: '2.1.1' },
        { name: '@acme/utils' },
        { name: '@acme/utils', version: '2.1.0' },
        { name: '@other/utils', version: '2.1.0' },
      ]) {
        if (!specMatchesPackage(spec, entry)) {
          continue
        }
        matched.push(`${raw} ~ ${entry.name}@${entry.version}`)
        expect(specLooselyMatchesPackage(spec, entry)).toBe(true)
      }
    }
    // Without this the assertions above pass vacuously if the matrix stops
    // matching anything.
    expect(matched.length).toBeGreaterThan(0)
  })
})

describe('parsePackageNamePattern()', () => {
  it('parses a bare package name', () => {
    expect(parsePackageNamePattern('some-package')).toEqual({
      name: 'some-package',
      wildcard: false,
      exclude: false,
    })
  })

  it('parses a scoped package name', () => {
    expect(parsePackageNamePattern('@acme/private-utils')).toEqual({
      name: '@acme/private-utils',
      wildcard: false,
      exclude: false,
    })
  })

  it('parses a leading ! as an exclusion', () => {
    expect(parsePackageNamePattern('!some-package')).toEqual({
      name: 'some-package',
      wildcard: false,
      exclude: true,
    })
    expect(parsePackageNamePattern('!@acme/*')).toEqual({
      name: '@acme/*',
      wildcard: true,
      exclude: true,
    })
  })

  it('compiles a wildcard name into a pattern', () => {
    const pattern = parsePackageNamePattern('@acme/*')
    expect(pattern.name).toBe('@acme/*')
    expect(pattern.wildcard).toBe(true)
    expect(specMatchesPackageName(pattern, '@acme/utils')).toBe(true)
    expect(specMatchesPackageName(pattern, '@other/utils')).toBe(false)
  })

  it('never matches across the scope separator with a wildcard', () => {
    const scoped = parsePackageNamePattern('@acme/*')
    expect(specMatchesPackageName(scoped, '@acme/nested/thing')).toBe(false)
    const bare = parsePackageNamePattern('*')
    expect(specMatchesPackageName(bare, 'unscoped')).toBe(true)
    expect(specMatchesPackageName(bare, '@acme/utils')).toBe(false)
  })

  it('supports infix wildcards', () => {
    const pattern = parsePackageNamePattern('@acme/*-utils')
    expect(specMatchesPackageName(pattern, '@acme/private-utils')).toBe(true)
    expect(specMatchesPackageName(pattern, '@acme/private-tools')).toBe(false)
  })

  it('rejects an empty entry', () => {
    expect(() => parsePackageNamePattern('')).toThrow(InvalidPackageNamePatternError)
    expect(() => parsePackageNamePattern('')).toThrow(/must be a non-empty string/)
  })

  it('rejects a non-string entry', () => {
    expect(() => parsePackageNamePattern(42 as any)).toThrow(/must be a non-empty string/)
    expect(() => parsePackageNamePattern(undefined as any)).toThrow(/must be a non-empty string/)
  })

  it('rejects a bare !', () => {
    expect(() => parsePackageNamePattern('!')).toThrow(/must name a package or pattern after '!'/)
  })

  it('rejects a name@version pin with a pointed message', () => {
    expect(() => parsePackageNamePattern('some-package@2.1.0'))
      .toThrow(/'name@version' pins are not supported here/)
    expect(() => parsePackageNamePattern('@acme/utils@2.1.0'))
      .toThrow(/'name@version' pins are not supported here/)
    expect(() => parsePackageNamePattern('!@acme/utils@2.1.0'))
      .toThrow(/'name@version' pins are not supported here/)
  })

  it('rejects an invalid package name', () => {
    expect(() => parsePackageNamePattern('.hidden')).toThrow(/is not a valid npm package name/)
    expect(() => parsePackageNamePattern('has spaces')).toThrow(/is not a valid npm package name/)
  })

  it('rejects an invalid wildcard pattern, calling it a pattern', () => {
    expect(() => parsePackageNamePattern('.hidden-*')).toThrow(/is not a valid npm package name pattern/)
  })
})
