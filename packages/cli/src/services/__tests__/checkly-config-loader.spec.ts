import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { loadChecklyConfig, defaultFilenames } from '../checkly-config-loader.js'
import { splitConfigFilePath } from '../util.js'

describe('loadChecklyConfig()', () => {
  it('config file should export an object', async () => {
    try {
      await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['no-export-config.js'])
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
  it('config file should export an object with projectName and logicalId', async () => {
    try {
      await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['no-logical-id-config.js'])
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
  it('error should indicate the tried file name combinations', async () => {
    const configDir = path.join(__dirname, 'fixtures', 'not-existing-config-path')
    try {
      await loadChecklyConfig(configDir)
    } catch (e: any) {
      expect(e.message).toContain(`Unable to detect a Checkly configuration file`)
      for (const filename of defaultFilenames) {
        expect(e.message).toContain(filename)
      }
    }
  })
  it('config TS file should export an object', async () => {
    const filename = 'good-config.ts'
    const configFile = `./fixtures/configs/${filename}`
    const { configDirectory, configFilenames } = splitConfigFilePath(configFile)

    expect(configFilenames).toEqual([filename])
    expect(configDirectory).toEqual(path.dirname(path.join(process.cwd(), configFile)))

    const {
      config,
    } = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), [filename])

    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
  })
  it('config JS file should export an object', async () => {
    const filename = 'good-config.js'
    const configFile = `./fixtures/configs/${filename}`
    const { configDirectory, configFilenames } = splitConfigFilePath(configFile)

    expect(configFilenames).toEqual([filename])
    expect(configDirectory).toEqual(path.dirname(path.join(process.cwd(), configFile)))

    const {
      config,
    } = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), [filename])

    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
  })
  it('accepts a string caching.dependencyCache.version', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['dependency-cache-version-string.ts'],
    )
    expect(config.caching?.dependencyCache?.version).toBe('v2')
  })
  it('accepts 0 as a caching.dependencyCache.version', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['dependency-cache-version-zero.ts'],
    )
    expect(config.caching?.dependencyCache?.version).toBe(0)
  })
  it('rejects a non-integer caching.dependencyCache.version', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['dependency-cache-version-float.js'],
    )).rejects.toThrow(`Config field 'caching.dependencyCache.version' must be a string or a safe integer if set`)
  })
  it('rejects an unsafe integer caching.dependencyCache.version', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['dependency-cache-version-unsafe-integer.js'],
    )).rejects.toThrow(`Config field 'caching.dependencyCache.version' must be a string or a safe integer if set`)
  })
  it('rejects a caching.dependencyCache.version that is neither string nor number', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['dependency-cache-version-bad-type.js'],
    )).rejects.toThrow(`Config field 'caching.dependencyCache.version' must be a string or a safe integer if set`)
  })
  it('accepts valid bundle.packages.embed entries', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['embedded-packages-valid.ts'],
    )
    expect(config.bundle?.packages?.embed)
      .toEqual(['@acme/private-utils', 'legacy-private-pkg@2.1.0', '@acme/*', 'acme-*', '!@acme/foo'])
  })
  it('rejects a bundle.packages.embed that is not an array', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['embedded-packages-not-array.js'],
    )).rejects.toThrow(`Config field 'bundle.packages.embed' must be an array of strings if set`)
  })
  it('rejects a bundle that is not an object', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['embedded-packages-bundle-not-object.js'],
    )).rejects.toThrow(`Config field 'bundle' must be an object if set`)
  })
  it('rejects a bundle.packages that is not an object', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['embedded-packages-packages-not-object.js'],
    )).rejects.toThrow(`Config field 'bundle.packages' must be an object if set`)
  })
  it('rejects a bundle.packages.embed entry that is not a valid package name', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['embedded-packages-bad-name.js'],
    )).rejects.toThrow(`is not a valid npm package name`)
  })
  it('rejects a bundle.packages.embed entry with a version range', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['embedded-packages-range-version.js'],
    )).rejects.toThrow(`is not an exact semver version`)
  })
  it('accepts a bundle.packages.prune pattern array', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-valid.ts'],
    )
    expect(config.bundle?.packages?.prune).toEqual(['@acme/*', '!@acme/keep', 'left-pad'])
  })
  it('accepts a bundle.packages.prune per-class map', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-valid-classes.ts'],
    )
    expect(config.bundle?.packages?.prune).toEqual({
      peerDependencies: true,
      devDependencies: ['@acme/*'],
    })
  })
  it('rejects a bundle.packages.prune that is neither array nor object', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-bad-shape.js'],
    )).rejects.toThrow(
      `Config field 'bundle.packages.prune' is invalid: must be an array of package name patterns`
      + ` or an object keyed by dependency class`,
    )
  })
  it('rejects a bundle.packages.prune with an unknown dependency class', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-bad-class.js'],
    )).rejects.toThrow(`Config field 'bundle.packages.prune' is invalid: 'peerDependences' is not a dependency class`)
  })
  it('rejects a bundle.packages.prune class value that is neither true nor an array', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-bad-class-value.js'],
    )).rejects.toThrow(
      `Config field 'bundle.packages.prune' is invalid: 'peerDependencies' must be true`
      + ` or an array of package name patterns`,
    )
  })
  it('accepts bundle.packages.prune member-scoped entries', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-valid-members.ts'],
    )
    expect(config.bundle?.packages?.prune).toEqual([
      '@acme/*',
      { member: 'my-app', remove: { peerDependencies: true } },
      { member: ['.', '@acme/**'], keep: { dependencies: ['@acme/utils'], devDependencies: true } },
    ])
  })
  it('rejects a member-scoped prune entry with both remove and keep', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-member-both.js'],
    )).rejects.toThrow(
      `Config field 'bundle.packages.prune' is invalid: a member-scoped prune entry`
      + ` must have exactly one of 'remove' and 'keep'`,
    )
  })
  it('rejects a member-scoped prune entry with neither remove nor keep', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-member-neither.js'],
    )).rejects.toThrow(
      `Config field 'bundle.packages.prune' is invalid: a member-scoped prune entry`
      + ` must have exactly one of 'remove' and 'keep'`,
    )
  })
  it('rejects a member-scoped prune entry with an unknown field', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-member-unknown-field.js'],
    )).rejects.toThrow(
      `Config field 'bundle.packages.prune' is invalid: 'path' is not a member-scoped`
      + ` prune entry field (expected member, remove, keep)`,
    )
  })
  it('rejects a member selector that is not a name pattern', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-member-bad-pattern.js'],
    )).rejects.toThrow(`'./packages/app' is not a valid npm package name`)
  })
  it('rejects a bundle.packages.prune entry with an embed-style version pin', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['bundle-packages-prune-bad-pattern.js'],
    )).rejects.toThrow(`'name@version' pins are not supported here`)
  })
  it('accepts a valid runner.registries configuration', async () => {
    const { config } = await loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['runner-registries-valid.ts'],
    )
    expect(config.runner?.registries).toEqual({
      upstreams: {
        npmjs: { url: 'https://registry.npmjs.org/' },
        internal: {
          url: 'https://npm.example.com/',
          auth: { type: 'bearer', token: '${INTERNAL_NPM_TOKEN}' },
        },
      },
      packages: [
        { pattern: '@acme/**', upstreams: ['internal'] },
        { pattern: '**', upstreams: ['npmjs', 'internal'] },
      ],
    })
  })
  it('rejects a runner that is not an object', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['runner-registries-runner-not-object.js'],
    )).rejects.toThrow(`Config field 'runner' must be an object if set`)
  })
  it('rejects a misspelled key inside the runner block', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['runner-registries-misspelled-key.js'],
    )).rejects.toThrow(`Config field 'runner' contains unknown field 'registires' (expected only: 'registries')`)
  })
  it('rejects a runner.registries rule using an unknown upstream name', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['runner-registries-unknown-upstream.js'],
    )).rejects.toThrow(
      `Config field 'runner.registries' is invalid: packages[0]: upstream 'mirror' is not defined`
      + ` under 'upstreams' (defined: 'npmjs')`,
    )
  })
  it('rejects a runner.registries auth token without a ${VAR} reference', async () => {
    await expect(loadChecklyConfig(
      path.join(__dirname, 'fixtures', 'configs'),
      ['runner-registries-literal-token.js'],
    )).rejects.toThrow(/must be exactly one environment variable reference in \$\{VAR\} syntax/)
  })
  it('config from absolute path', async () => {
    const filename = 'good-config.ts'
    const configFile = `./fixtures/configs/${filename}`
    const { configDirectory, configFilenames } = splitConfigFilePath(path.join(process.cwd(), configFile))

    expect(configFilenames).toEqual([filename])
    expect(configDirectory).toEqual(path.dirname(path.join(process.cwd(), configFile)))

    const {
      config,
    } = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), [filename])

    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
  })
})
