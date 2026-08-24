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
  pnpmAuthIniPath,
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
      { path: path.join(dir, 'project.npmrc') },
      { path: path.join(dir, 'user.npmrc') },
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
    expect(config.get('//user.example.com/:_authToken')).toBe('user-token')
  })

  it('skips missing files', async () => {
    const config = await loadNpmrcConfig([
      { path: path.join(dir, 'does-not-exist.npmrc') },
      { path: path.join(dir, 'project.npmrc') },
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
  })

  it('lets the pnpm auth file win over the user .npmrc when it ranks higher', async () => {
    const authIni = path.join(dir, 'auth.ini')
    const userNpmrc = path.join(dir, 'competing-user.npmrc')
    await fs.writeFile(authIni, '//registry.example.com/:_authToken=pnpm-token\n')
    await fs.writeFile(userNpmrc, '//registry.example.com/:_authToken=npmrc-token\n')

    const preferred = await loadNpmrcConfig([{ path: authIni, optional: true }, { path: userNpmrc }], {})
    expect(preferred.get('//registry.example.com/:_authToken')).toBe('pnpm-token')

    const notPreferred = await loadNpmrcConfig([{ path: userNpmrc }, { path: authIni, optional: true }], {})
    expect(notPreferred.get('//registry.example.com/:_authToken')).toBe('npmrc-token')
  })

  it('fails on an unreadable required file but skips an unreadable optional one', async () => {
    const unreadable = path.join(dir, 'unreadable.npmrc')
    await fs.writeFile(unreadable, 'registry=https://unreadable.example.com/\n')
    await fs.chmod(unreadable, 0o000)
    try {
      // Running as root defeats permission bits entirely, so only assert
      // when the mode actually denies this process.
      await fs.readFile(unreadable, 'utf8')
      return
    } catch {
      // Expected: the file is genuinely unreadable.
    }

    await expect(loadNpmrcConfig([{ path: unreadable }], {})).rejects.toThrow(/Unable to read npm configuration/)

    const config = await loadNpmrcConfig([
      { path: unreadable, optional: true },
      { path: path.join(dir, 'project.npmrc') },
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
  })

  it('gives npm_config_* environment variables precedence over files', async () => {
    const config = await loadNpmrcConfig(
      [{ path: path.join(dir, 'project.npmrc') }],
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
    expect(defaultNpmrcPaths({
      workspaceRoot: '/ws',
      homedir: '/home/user',
      contextDir: '/ws/packages/a',
    })).toEqual([
      { path: path.join('/ws/packages/a', '.npmrc') },
      { path: path.join('/ws', '.npmrc') },
      { path: path.join('/home/user', '.npmrc') },
    ])
  })

  it('deduplicates when the context dir is the workspace root', () => {
    expect(defaultNpmrcPaths({
      workspaceRoot: '/ws',
      homedir: '/home/user',
      contextDir: '/ws',
    })).toEqual([
      { path: path.join('/ws', '.npmrc') },
      { path: path.join('/home/user', '.npmrc') },
    ])
  })

  it('ranks the pnpm auth file above the user .npmrc when preferred', () => {
    expect(defaultNpmrcPaths({
      workspaceRoot: '/ws',
      homedir: '/home/user',
      pnpmAuthFile: '/cfg/pnpm/auth.ini',
      pnpmAuthFilePreferred: true,
    })).toEqual([
      { path: path.join('/ws', '.npmrc') },
      { path: '/cfg/pnpm/auth.ini', optional: true },
      { path: path.join('/home/user', '.npmrc') },
    ])
  })

  it('ranks the pnpm auth file below the user .npmrc when not preferred', () => {
    expect(defaultNpmrcPaths({
      workspaceRoot: '/ws',
      homedir: '/home/user',
      pnpmAuthFile: '/cfg/pnpm/auth.ini',
      pnpmAuthFilePreferred: false,
    })).toEqual([
      { path: path.join('/ws', '.npmrc') },
      { path: path.join('/home/user', '.npmrc') },
      { path: '/cfg/pnpm/auth.ini', optional: true },
    ])
  })

  it('omits the pnpm auth file when none is given', () => {
    expect(defaultNpmrcPaths({ workspaceRoot: '/ws', homedir: '/home/user' })).toEqual([
      { path: path.join('/ws', '.npmrc') },
      { path: path.join('/home/user', '.npmrc') },
    ])
  })
})

describe('pnpmAuthIniPath()', () => {
  const home = path.sep === '/' ? '/home/user' : 'C:\\Users\\user'

  it('uses macOS preferences on darwin', () => {
    expect(pnpmAuthIniPath({}, 'darwin', home))
      .toBe(path.join(home, 'Library', 'Preferences', 'pnpm', 'auth.ini'))
  })

  it('uses ~/.config on linux', () => {
    expect(pnpmAuthIniPath({}, 'linux', home)).toBe(path.join(home, '.config', 'pnpm', 'auth.ini'))
  })

  it('uses LOCALAPPDATA on win32', () => {
    expect(pnpmAuthIniPath({ LOCALAPPDATA: 'C:\\LocalAppData' }, 'win32', home))
      .toBe(path.join('C:\\LocalAppData', 'pnpm', 'config', 'auth.ini'))
  })

  it('falls back to ~/.config on win32 without LOCALAPPDATA', () => {
    expect(pnpmAuthIniPath({}, 'win32', home)).toBe(path.join(home, '.config', 'pnpm', 'auth.ini'))
  })

  it('prefers XDG_CONFIG_HOME on every platform', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      expect(pnpmAuthIniPath({ XDG_CONFIG_HOME: '/xdg' }, platform, home))
        .toBe(path.join('/xdg', 'pnpm', 'auth.ini'))
    }
  })

  it('ignores an empty XDG_CONFIG_HOME', () => {
    expect(pnpmAuthIniPath({ XDG_CONFIG_HOME: '' }, 'linux', home))
      .toBe(path.join(home, '.config', 'pnpm', 'auth.ini'))
  })

  // An empty value must not be joined as-is: that would yield a relative
  // path and read credentials from the current working directory.
  it('ignores an empty LOCALAPPDATA', () => {
    expect(pnpmAuthIniPath({ LOCALAPPDATA: '' }, 'win32', home))
      .toBe(path.join(home, '.config', 'pnpm', 'auth.ini'))
  })

  // pnpm consults PNPM_HOME for its data and state directories, never for
  // the config directory that holds auth.ini.
  it('ignores PNPM_HOME', () => {
    expect(pnpmAuthIniPath({ PNPM_HOME: '/pnpm-home' }, 'linux', home))
      .toBe(path.join(home, '.config', 'pnpm', 'auth.ini'))
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
