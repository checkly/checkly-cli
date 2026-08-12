import { describe, it, expect } from 'vitest'

import { parseEmbeddedPackageSpec, InvalidEmbeddedPackageSpecError } from '../spec.js'

describe('parseEmbeddedPackageSpec()', () => {
  it('parses a bare package name', () => {
    expect(parseEmbeddedPackageSpec('some-package')).toEqual({
      raw: 'some-package',
      name: 'some-package',
      version: undefined,
    })
  })

  it('parses a scoped package name', () => {
    expect(parseEmbeddedPackageSpec('@acme/private-utils')).toEqual({
      raw: '@acme/private-utils',
      name: '@acme/private-utils',
      version: undefined,
    })
  })

  it('parses a name@version pin', () => {
    expect(parseEmbeddedPackageSpec('some-package@2.1.0')).toEqual({
      raw: 'some-package@2.1.0',
      name: 'some-package',
      version: '2.1.0',
    })
  })

  it('parses a scoped name@version pin', () => {
    expect(parseEmbeddedPackageSpec('@acme/private-utils@1.0.0-beta.3')).toEqual({
      raw: '@acme/private-utils@1.0.0-beta.3',
      name: '@acme/private-utils',
      version: '1.0.0-beta.3',
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
    })
  })

  it('preserves build metadata in a pinned version', () => {
    expect(parseEmbeddedPackageSpec('some-package@1.0.0+build.7').version).toBe('1.0.0+build.7')
  })

  it('trims whitespace around a pinned version', () => {
    expect(parseEmbeddedPackageSpec('some-package@ 2.1.0 ').version).toBe('2.1.0')
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
