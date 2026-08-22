import { describe, it, expect } from 'vitest'

import {
  createFauxPackageFiles,
  FAUX_PACKAGE_DESCRIPTION,
  FAUX_PACKAGE_FALLBACK_VERSION,
} from '../faux-package.js'
import { Package } from '../package-files/workspace.js'

describe('createFauxPackageFiles()', () => {
  const contentOf = (pkg: Package): any => {
    const files = createFauxPackageFiles(pkg)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      filePath: pkg.packageJsonPath,
      physical: false,
    })
    return JSON.parse(files[0].content)
  }

  it('carries the real version from the package', () => {
    const pkg = new Package({ name: '@test/with-version', path: '/ws/with-version', version: '1.2.3' })
    expect(contentOf(pkg)).toEqual({
      name: '@test/with-version',
      version: '1.2.3',
      description: FAUX_PACKAGE_DESCRIPTION,
      private: true,
    })
  })

  it('falls back when the package has no version', () => {
    const pkg = new Package({ name: '@test/no-version', path: '/ws/no-version' })
    expect(contentOf(pkg).version).toEqual(FAUX_PACKAGE_FALLBACK_VERSION)
  })

  it('falls back when the version is empty', () => {
    const pkg = new Package({ name: '@test/empty-version', path: '/ws/empty-version', version: '' })
    expect(contentOf(pkg).version).toEqual(FAUX_PACKAGE_FALLBACK_VERSION)
  })

  it('falls back when the version is not a string', () => {
    // The version originates from a plain JSON.parse of the member's manifest,
    // so despite the declared type it may be any JSON value at runtime.
    const pkg = new Package({ name: '@test/numeric-version', path: '/ws/numeric-version', version: 1 as any })
    expect(contentOf(pkg).version).toEqual(FAUX_PACKAGE_FALLBACK_VERSION)
  })
})
