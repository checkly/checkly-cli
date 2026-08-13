import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import {
  DEFAULT_REGISTRY_URL,
  NpmrcEnvVarError,
  defaultNpmrcPaths,
  loadNpmrcConfig,
  npmrcConfigFromEnv,
  parseNpmrc,
  resolveAuthHeader,
  resolveRegistryUrl,
} from '../npmrc.js'

describe('parseNpmrc()', () => {
  it('parses key=value lines, skipping comments and blanks', () => {
    const config = parseNpmrc([
      '# a comment',
      '; another comment',
      '',
      'registry=https://nexus.local/repository/npm/',
      '  @acme:registry = https://nexus.local/repository/npm-private/  ',
      '//nexus.local/repository/npm-private/:_authToken=secret-token',
    ].join('\n'))

    expect(config.get('registry')).toBe('https://nexus.local/repository/npm/')
    expect(config.get('@acme:registry')).toBe('https://nexus.local/repository/npm-private/')
    expect(config.get('//nexus.local/repository/npm-private/:_authToken')).toBe('secret-token')
  })

  it('strips matching quotes around values', () => {
    expect(parseNpmrc(`registry="https://example.com/"`).get('registry')).toBe('https://example.com/')
  })
})

describe('loadNpmrcConfig()', () => {
  let dir: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-npmrc-'))
    await fs.writeFile(path.join(dir, 'project.npmrc'), 'registry=https://project.example.com/\n')
    await fs.writeFile(path.join(dir, 'user.npmrc'), [
      'registry=https://user.example.com/',
      '//user.example.com/:_authToken=user-token',
    ].join('\n'))
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('gives earlier files precedence and merges the rest', async () => {
    const config = await loadNpmrcConfig([
      path.join(dir, 'project.npmrc'),
      path.join(dir, 'user.npmrc'),
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
    expect(config.get('//user.example.com/:_authToken')).toBe('user-token')
  })

  it('skips missing files', async () => {
    const config = await loadNpmrcConfig([
      path.join(dir, 'does-not-exist.npmrc'),
      path.join(dir, 'project.npmrc'),
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
  })

  it('gives npm_config_* environment variables precedence over files', async () => {
    const config = await loadNpmrcConfig(
      [path.join(dir, 'project.npmrc')],
      { npm_config_registry: 'https://env.example.com/' },
    )
    expect(config.get('registry')).toBe('https://env.example.com/')
  })
})

describe('npmrcConfigFromEnv()', () => {
  it('extracts npm_config_* keys with a case-insensitive prefix', () => {
    const config = npmrcConfigFromEnv({
      npm_config_registry: 'https://env.example.com/',
      NPM_CONFIG_STRICT_SSL: 'false',
      UNRELATED: 'x',
    })
    expect(config.get('registry')).toBe('https://env.example.com/')
    expect(config.get('strict_ssl')).toBe('false')
    expect(config.has('UNRELATED')).toBe(false)
  })

  it('preserves the case-sensitive spelling of nerf-darted auth keys', () => {
    const config = npmrcConfigFromEnv({
      'npm_config_//nexus.local/:_authToken': 'env-secret',
    })
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', {})).toBe('Bearer env-secret')
  })
})

describe('defaultNpmrcPaths()', () => {
  it('orders context dir before workspace root before home', () => {
    expect(defaultNpmrcPaths('/ws', '/home/user', '/ws/packages/a', {})).toEqual([
      path.join('/ws/packages/a', '.npmrc'),
      path.join('/ws', '.npmrc'),
      path.join('/home/user', '.npmrc'),
    ])
  })

  it('deduplicates when the context dir is the workspace root', () => {
    expect(defaultNpmrcPaths('/ws', '/home/user', '/ws', {})).toEqual([
      path.join('/ws', '.npmrc'),
      path.join('/home/user', '.npmrc'),
    ])
  })

  it('lets npm_config_userconfig replace the user-level path, like npm', () => {
    expect(defaultNpmrcPaths('/ws', '/home/user', undefined, { npm_config_userconfig: '/etc/ci-npmrc' })).toEqual([
      path.join('/ws', '.npmrc'),
      '/etc/ci-npmrc',
    ])
    expect(defaultNpmrcPaths('/ws', '/home/user', undefined, { NPM_CONFIG_USERCONFIG: '/etc/ci-npmrc' })).toEqual([
      path.join('/ws', '.npmrc'),
      '/etc/ci-npmrc',
    ])
    // npm ignores empty env config values.
    expect(defaultNpmrcPaths('/ws', '/home/user', undefined, { npm_config_userconfig: '' })).toEqual([
      path.join('/ws', '.npmrc'),
      path.join('/home/user', '.npmrc'),
    ])
  })

  it('expands a leading ~ in npm_config_userconfig against the home directory', () => {
    expect(defaultNpmrcPaths('/ws', '/home/user', undefined, { npm_config_userconfig: '~/.npmrc-work' })).toEqual([
      path.join('/ws', '.npmrc'),
      path.join('/home/user', '.npmrc-work'),
    ])
    expect(defaultNpmrcPaths('/ws', '/home/user', undefined, { npm_config_userconfig: '~' })).toEqual([
      path.join('/ws', '.npmrc'),
      '/home/user',
    ])
    // Only a leading tilde segment is home-relative.
    expect(defaultNpmrcPaths('/ws', '/home/user', undefined, { npm_config_userconfig: '/etc/~npmrc' })).toEqual([
      path.join('/ws', '.npmrc'),
      '/etc/~npmrc',
    ])
  })
})

describe('resolveRegistryUrl()', () => {
  it('defaults to the public registry', () => {
    expect(resolveRegistryUrl(new Map(), 'some-package')).toBe(DEFAULT_REGISTRY_URL)
  })

  it('uses the registry entry and appends a trailing slash', () => {
    const config = parseNpmrc('registry=https://nexus.local/repository/npm')
    expect(resolveRegistryUrl(config, 'some-package')).toBe('https://nexus.local/repository/npm/')
  })

  it('prefers a scoped registry for scoped packages', () => {
    const config = parseNpmrc([
      'registry=https://nexus.local/repository/npm/',
      '@acme:registry=https://nexus.local/repository/npm-private/',
    ].join('\n'))
    expect(resolveRegistryUrl(config, '@acme/private-utils')).toBe('https://nexus.local/repository/npm-private/')
    expect(resolveRegistryUrl(config, 'some-package')).toBe('https://nexus.local/repository/npm/')
  })

  it('expands ${VAR} references from the environment', () => {
    const config = parseNpmrc('registry=${MY_REGISTRY}')
    expect(resolveRegistryUrl(config, 'some-package', { MY_REGISTRY: 'https://example.com' }))
      .toBe('https://example.com/')
  })

  it('throws a clear error for unset ${VAR} references', () => {
    const config = parseNpmrc('registry=${MY_UNSET_REGISTRY}')
    expect(() => resolveRegistryUrl(config, 'some-package', {})).toThrow(NpmrcEnvVarError)
  })

  it('ignores unset ${VAR} references in entries that are not used', () => {
    const config = parseNpmrc([
      'registry=https://nexus.local/repository/npm/',
      '//unrelated.example.com/:_authToken=${SOME_UNSET_TOKEN}',
    ].join('\n'))
    expect(resolveRegistryUrl(config, 'some-package', {})).toBe('https://nexus.local/repository/npm/')
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', {})).toBeUndefined()
  })
})

describe('resolveAuthHeader()', () => {
  it('matches an _authToken by nerf dart', () => {
    const config = parseNpmrc('//nexus.local/repository/npm-private/:_authToken=secret')
    const header = resolveAuthHeader(
      config,
      'https://nexus.local/repository/npm-private/@acme/foo/-/foo-1.0.0.tgz',
      {},
    )
    expect(header).toBe('Bearer secret')
  })

  it('walks the URL path upward to find host-level credentials', () => {
    const config = parseNpmrc('//nexus.local/:_authToken=host-secret')
    const header = resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo/-/foo-1.0.0.tgz', {})
    expect(header).toBe('Bearer host-secret')
  })

  it('includes the port in the nerf dart', () => {
    const config = parseNpmrc('//nexus.local:8443/:_authToken=port-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local:8443/foo/-/foo-1.0.0.tgz', {})).toBe('Bearer port-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo/-/foo-1.0.0.tgz', {})).toBeUndefined()
  })

  it('supports pre-encoded _auth as Basic', () => {
    const config = parseNpmrc('//nexus.local/:_auth=dXNlcjpwYXNz')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', {})).toBe('Basic dXNlcjpwYXNz')
  })

  it('supports username and base64 _password as Basic', () => {
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      `//nexus.local/:_password=${Buffer.from('pass').toString('base64')}`,
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', {}))
      .toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
  })

  it('expands ${VAR} tokens from the environment', () => {
    const config = parseNpmrc('//nexus.local/:_authToken=${NPM_TOKEN}')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', { NPM_TOKEN: 'env-secret' }))
      .toBe('Bearer env-secret')
  })

  it('returns undefined without matching credentials', () => {
    const config = parseNpmrc('//other.example.com/:_authToken=secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', {})).toBeUndefined()
  })
})
