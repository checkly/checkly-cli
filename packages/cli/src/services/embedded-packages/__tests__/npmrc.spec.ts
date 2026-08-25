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
  pnpmAuthIniPath,
  resolveAuthHeader,
  resolveRegistry,
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

  it('lets a blank credential mask the same key in a lower-precedence file', async () => {
    // Deliberate parity with npm and pnpm, which both keep blank values
    // read from files. Skipping blanks during the merge would let a working
    // lower-precedence token through, but then a project that blanks an
    // entry on purpose — to force anonymous access — would have the
    // developer's personal token sent instead, which npm would never do.
    // (Nothing writes these blanks automatically: `npm logout` deletes the
    // lines. They come from hand edits, or a script writing an absent
    // secret.)
    const blank = path.join(dir, 'blank.npmrc')
    const working = path.join(dir, 'working.npmrc')
    await fs.writeFile(blank, '//nexus.local/:_authToken=\n')
    await fs.writeFile(working, '//nexus.local/:_authToken=works\n')

    const { config } = await loadNpmrcConfig([{ path: blank }, { path: working }], {})
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()

    const { config: reversed } = await loadNpmrcConfig([{ path: working }, { path: blank }], {})
    expect(resolveAuthHeader(reversed, 'https://nexus.local/foo', 'foo', {})?.header).toBe('Bearer works')
  })

  it('does not reach past a blank into another file, even under a different spelling', async () => {
    // The case the same-spelling test cannot catch: the two files disagree
    // on capitalisation, so the merge keeps both keys and a naive
    // case-fallback would send the personal token the project deliberately
    // blanked out. npm would go anonymous here.
    const blank = path.join(dir, 'blank-cased.npmrc')
    const personal = path.join(dir, 'personal-cased.npmrc')
    await fs.writeFile(blank, '//nexus.local/:_authToken=\n')
    await fs.writeFile(personal, '//nexus.local/:_authtoken=personal-token\n')

    const { config } = await loadNpmrcConfig([{ path: blank }, { path: personal }], {})
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()
  })

  it('gives earlier files precedence and merges the rest', async () => {
    const { config } = await loadNpmrcConfig([
      { path: path.join(dir, 'project.npmrc') },
      { path: path.join(dir, 'user.npmrc') },
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
    expect(config.get('//user.example.com/:_authToken')).toBe('user-token')
  })

  it('skips missing files', async () => {
    const { config } = await loadNpmrcConfig([
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

    const { config: preferred } = await loadNpmrcConfig([{ path: authIni, optional: true }, { path: userNpmrc }], {})
    expect(preferred.get('//registry.example.com/:_authToken')).toBe('pnpm-token')

    const { config: notPreferred } = await loadNpmrcConfig([{ path: userNpmrc }, { path: authIni, optional: true }], {})
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

    const { config, unreadable: skipped } = await loadNpmrcConfig([
      { path: unreadable, optional: true },
      { path: path.join(dir, 'project.npmrc') },
    ], {})
    expect(config.get('registry')).toBe('https://project.example.com/')
    // Reported rather than merely skipped, so a later authentication
    // failure can say the file was found but not used.
    expect(skipped).toEqual([unreadable])
  })

  it('records which source supplied each key', async () => {
    const projectNpmrc = path.join(dir, 'project.npmrc')
    const userNpmrc = path.join(dir, 'user.npmrc')
    const { origins } = await loadNpmrcConfig(
      [{ path: projectNpmrc }, { path: userNpmrc }],
      { 'npm_config_//env.example.com/:_authToken': 'env-token' },
    )

    expect(origins.get('registry')).toEqual({ kind: 'file', path: projectNpmrc })
    expect(origins.get('//user.example.com/:_authToken')).toEqual({ kind: 'file', path: userNpmrc })
    expect(origins.get('//env.example.com/:_authToken'))
      .toEqual({ kind: 'env', variable: 'npm_config_//env.example.com/:_authToken' })
  })

  it('names the environment variable verbatim, whatever its case', async () => {
    // The stored key is case-folded, so only the verbatim variable name is
    // something the user can search their environment for.
    const { origins } = await loadNpmrcConfig([], { NPM_CONFIG_REGISTRY: 'https://env.example.com/' })
    expect(origins.get('registry')).toEqual({ kind: 'env', variable: 'NPM_CONFIG_REGISTRY' })
    expect(origins.get('REGISTRY')).toEqual({ kind: 'env', variable: 'NPM_CONFIG_REGISTRY' })
  })

  it('reports the config files consulted', async () => {
    const projectNpmrc = path.join(dir, 'project.npmrc')
    const { files } = await loadNpmrcConfig([{ path: projectNpmrc }], {})
    expect(files).toEqual([projectNpmrc])
  })

  it('records the origin under the key spelling that actually matched', async () => {
    const lowercased = path.join(dir, 'lowercased.npmrc')
    await fs.writeFile(lowercased, '//nexus.local/:_authtoken=lower-token\n')

    const { config, origins } = await loadNpmrcConfig([{ path: lowercased }], {})
    const auth = resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})

    // resolveAuthHeader asks for the canonical `_authToken` spelling but
    // matches the lowercase one; the reported key has to be the spelling
    // present in origins, or the source cannot be named.
    expect(auth?.header).toBe('Bearer lower-token')
    expect(origins.get(auth!.keys[0])).toEqual({ kind: 'file', path: lowercased })
  })

  it('does not report missing files as unreadable', async () => {
    const { unreadable } = await loadNpmrcConfig([
      { path: path.join(dir, 'does-not-exist.npmrc'), optional: true },
    ], {})
    expect(unreadable).toEqual([])
  })

  it('gives npm_config_* environment variables precedence over files', async () => {
    const { config } = await loadNpmrcConfig(
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
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})?.header).toBe('Bearer env-secret')
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

describe('resolveRegistry()', () => {
  it('defaults to the public registry', () => {
    expect(resolveRegistry(new Map(), 'some-package').url).toBe(DEFAULT_REGISTRY_URL)
  })

  it('uses the registry entry and appends a trailing slash', () => {
    const config = parseNpmrc('registry=https://nexus.local/repository/npm')
    expect(resolveRegistry(config, 'some-package').url).toBe('https://nexus.local/repository/npm/')
  })

  it('prefers a scoped registry for scoped packages', () => {
    const config = parseNpmrc([
      'registry=https://nexus.local/repository/npm/',
      '@acme:registry=https://nexus.local/repository/npm-private/',
    ].join('\n'))
    expect(resolveRegistry(config, '@acme/private-utils').url).toBe('https://nexus.local/repository/npm-private/')
    expect(resolveRegistry(config, 'some-package').url).toBe('https://nexus.local/repository/npm/')
  })

  it('expands ${VAR} references from the environment', () => {
    const config = parseNpmrc('registry=${MY_REGISTRY}')
    expect(resolveRegistry(config, 'some-package', { MY_REGISTRY: 'https://example.com' }).url)
      .toBe('https://example.com/')
  })

  it('throws a clear error for unset ${VAR} references', () => {
    const config = parseNpmrc('registry=${MY_UNSET_REGISTRY}')
    expect(() => resolveRegistry(config, 'some-package', {})).toThrow(NpmrcEnvVarError)
  })

  it('does not fall back to the public registry when the configured one is blank', () => {
    // A blank registry is a broken setting, not an absent one. Silently
    // using the public registry would send private package names to it;
    // the unusable URL and the key that produced it let the caller report
    // which entry to fix. `${VAR}` set to the empty string is how a missing
    // CI secret usually arrives.
    for (const config of [
      parseNpmrc('registry='),
      parseNpmrc('registry=${EMPTY_REGISTRY}'),
    ]) {
      // Reported as unusable rather than handed back as a URL nothing can
      // fetch: the caller cannot compose onto it by accident.
      expect(resolveRegistry(config, '@acme/private-utils', { EMPTY_REGISTRY: '' }))
        .toEqual({ usable: false, key: 'registry' })
    }
  })

  it('does not fall back to the public registry when a scoped registry is blank', () => {
    const config = parseNpmrc('@acme:registry=')
    expect(resolveRegistry(config, '@acme/private-utils', {}))
      .toEqual({ usable: false, key: '@acme:registry' })
  })

  it('falls back to the global registry when the scoped one is blank', () => {
    // npm and pnpm both read a blank `@scope:registry` as unset. The
    // fallback here is the user's own private registry, so refusing it
    // would fail a configuration both package managers install from.
    const config = parseNpmrc([
      'registry=https://nexus.local/repository/npm/',
      '@acme:registry=${EMPTY_REGISTRY}',
    ].join('\n'))
    expect(resolveRegistry(config, '@acme/private-utils', { EMPTY_REGISTRY: '' }).url)
      .toBe('https://nexus.local/repository/npm/')
  })

  it('keeps the blank scoped registry when the global one is unusable', () => {
    // With nothing usable to fall back to, the blank entry is kept: the
    // caller reports which key to fix instead of defaulting to the public
    // registry and disclosing a private package name to it.
    const config = parseNpmrc([
      'registry=',
      '@acme:registry=',
    ].join('\n'))
    expect(resolveRegistry(config, '@acme/private-utils', {}))
      .toEqual({ usable: false, key: '@acme:registry' })
  })

  it('keeps a blank scoped registry when the global one references an unset variable', () => {
    // The global entry is no more usable than a missing one, and reporting
    // it would name a key that is not the one in use.
    const config = parseNpmrc([
      '@acme:registry=',
      'registry=${UNSET_REGISTRY}',
    ].join('\n'))
    expect(resolveRegistry(config, '@acme/private-utils', {}))
      .toEqual({ usable: false, key: '@acme:registry' })
  })

  it('ignores a blank npm_config_registry rather than failing on it', () => {
    // The exception the blank-registry hard failure depends on: a pipeline
    // exporting the variable from an unset secret must still reach the
    // default registry, not an unusable URL that aborts every download.
    // Empty environment values never reach the config, matching npm.
    const registry = resolveRegistry(npmrcConfigFromEnv({ npm_config_registry: '' }), 'foo', {})
    expect(registry.url).toBe(DEFAULT_REGISTRY_URL)
    expect(registry.key).toBeUndefined()
  })

  it('ignores unset ${VAR} references in entries that are not used', () => {
    const config = parseNpmrc([
      'registry=https://nexus.local/repository/npm/',
      '//unrelated.example.com/:_authToken=${SOME_UNSET_TOKEN}',
    ].join('\n'))
    expect(resolveRegistry(config, 'some-package', {}).url).toBe('https://nexus.local/repository/npm/')
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', {})).toBeUndefined()
  })
})

describe('resolveAuthHeader()', () => {
  it('matches an _authToken by nerf dart', () => {
    const config = parseNpmrc('//nexus.local/repository/npm-private/:_authToken=secret')
    const auth = resolveAuthHeader(
      config,
      'https://nexus.local/repository/npm-private/@acme/foo/-/foo-1.0.0.tgz',
      '@acme/foo',
      {},
    )
    expect(auth?.header).toBe('Bearer secret')
    // The matched key is reported so a rejected credential can be traced
    // back to the file that supplied it.
    expect(auth?.keys).toEqual(['//nexus.local/repository/npm-private/:_authToken'])
  })

  it('reports both halves of a username/_password pair', () => {
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      `//nexus.local/:_password=${Buffer.from('pass').toString('base64')}`,
    ].join('\n'))
    // Precedence is per key, so the two halves can come from different
    // files; naming only the username would point at the half that is not
    // secret and cannot expire.
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})?.keys)
      .toEqual(['//nexus.local/:username', '//nexus.local/:_password'])
  })

  it('walks the URL path upward to find host-level credentials', () => {
    const config = parseNpmrc('//nexus.local/:_authToken=host-secret')
    const auth = resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo/-/foo-1.0.0.tgz', 'foo', {})
    expect(auth?.header).toBe('Bearer host-secret')
  })

  it('includes the port in the nerf dart', () => {
    const config = parseNpmrc('//nexus.local:8443/:_authToken=port-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local:8443/foo/-/foo-1.0.0.tgz', 'foo', {})?.header)
      .toBe('Bearer port-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo/-/foo-1.0.0.tgz', 'foo', {})).toBeUndefined()
  })

  it('supports pre-encoded _auth as Basic', () => {
    const config = parseNpmrc('//nexus.local/:_auth=dXNlcjpwYXNz')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})?.header).toBe('Basic dXNlcjpwYXNz')
  })

  it('prefers a username/_password pair over a legacy _auth at the same dart', () => {
    // npm's getCredentialsByURI order: _authToken, then the pair, then
    // _auth. A stale `_auth` left behind by an older CI image beside a pair
    // written later must not win, or `checkly deploy` authenticates as
    // somebody `npm install` stopped using.
    const config = parseNpmrc([
      `//nexus.local/:_auth=${Buffer.from('stale:stale').toString('base64')}`,
      '//nexus.local/:username=user',
      `//nexus.local/:_password=${Buffer.from('works').toString('base64')}`,
    ].join('\n'))
    const auth = resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})
    expect(auth?.header).toBe(`Basic ${Buffer.from('user:works').toString('base64')}`)
    expect(auth?.keys).toEqual(['//nexus.local/:username', '//nexus.local/:_password'])
  })

  it('falls through to _auth when no pair can form', () => {
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      '//nexus.local/:_auth=dXNlcjpwYXNz',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})?.header)
      .toBe('Basic dXNlcjpwYXNz')
  })

  it('supports username and base64 _password as Basic', () => {
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      `//nexus.local/:_password=${Buffer.from('pass').toString('base64')}`,
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})?.header)
      .toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
  })

  it('expands ${VAR} tokens from the environment', () => {
    const config = parseNpmrc('//nexus.local/:_authToken=${NPM_TOKEN}')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', { NPM_TOKEN: 'env-secret' })?.header)
      .toBe('Bearer env-secret')
  })

  it('returns undefined without matching credentials', () => {
    const config = parseNpmrc('//other.example.com/:_authToken=secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()
  })

  it.each([
    ['does not parse', 'nexus.local/foo'],
    ['parses without a host', 'admin:s3cret@nexus.local/foo'],
    ['names a scheme nothing here fetches', 'ftp://nexus.local/foo'],
  ])('sends no credentials to a URL that %s', (_label, url) => {
    // Callers check the URL before requesting it, so this is belt and
    // braces — but the safe answer for one that could not be validated is
    // to send nothing, not to throw or to hand a token to a scheme this
    // CLI never fetches over.
    const config = parseNpmrc('//nexus.local/:_authToken=secret')
    expect(resolveAuthHeader(config, url, 'foo', {})).toBeUndefined()
  })

  it('matches a scope-qualified _authToken', () => {
    // The spelling `pnpm login --scope=@acme` writes.
    const config = parseNpmrc('//nexus.local/:@acme:_authToken=scoped-secret')
    const auth = resolveAuthHeader(config, 'https://nexus.local/@acme/foo/-/foo-1.0.0.tgz', '@acme/foo', {})
    expect(auth?.header).toBe('Bearer scoped-secret')
    expect(auth?.keys).toEqual(['//nexus.local/:@acme:_authToken'])
  })

  it('supports scope-qualified _auth and username/_password', () => {
    const config = parseNpmrc([
      '//nexus.local/:@acme:_auth=dXNlcjpwYXNz',
      '//other.local/:@acme:username=user',
      `//other.local/:@acme:_password=${Buffer.from('pass').toString('base64')}`,
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Basic dXNlcjpwYXNz')
    expect(resolveAuthHeader(config, 'https://other.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
  })

  it('prefers a scope-qualified key over an unscoped one at the same depth', () => {
    const config = parseNpmrc([
      '//nexus.local/:_authToken=unscoped-secret',
      '//nexus.local/:@acme:_authToken=scoped-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer scoped-secret')
  })

  it('exhausts the scoped walk before considering any unscoped key', () => {
    // pnpm walks the whole scoped table first, so a shallow scoped key wins
    // over a deeper unscoped one instead of the two interleaving by depth.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:_authToken=deep-unscoped-secret',
      '//nexus.local/:@acme:_authToken=shallow-scoped-secret',
    ].join('\n'))
    const url = 'https://nexus.local/repository/npm/@acme/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})?.header).toBe('Bearer shallow-scoped-secret')
  })

  it('falls back to an unscoped key when the scope has none', () => {
    const config = parseNpmrc([
      '//nexus.local/:_authToken=unscoped-secret',
      '//nexus.local/:@other:_authToken=other-scope-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer unscoped-secret')
  })

  it('never sends a scoped credential for a package outside that scope', () => {
    // A scoped token belongs to one organisation, so an unscoped package
    // must not borrow it.
    const config = parseNpmrc('//nexus.local/:@acme:_authToken=scoped-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()
    expect(resolveAuthHeader(config, 'https://nexus.local/@other/foo', '@other/foo', {})).toBeUndefined()
  })

  it('treats a name with no scope separator as unscoped', () => {
    // `@acme` alone is a malformed package name, not a scope: reading it as
    // one would send @acme's credential to a package that is not in it.
    const config = parseNpmrc('//nexus.local/:@acme:_authToken=scoped-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme', '@acme', {})).toBeUndefined()
  })

  it('never pairs a scoped username with an unscoped password', () => {
    // Both halves must come from the same key prefix: combining them would
    // send a credential that neither entry describes.
    const encoded = Buffer.from('pass').toString('base64')
    const config = parseNpmrc([
      '//nexus.local/:@acme:username=scoped-user',
      '//nexus.local/:username=unscoped-user',
      `//nexus.local/:_password=${encoded}`,
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.keys)
      .toEqual(['//nexus.local/:username', '//nexus.local/:_password'])
  })

  it('reports an unset ${VAR} in a scope-qualified key instead of silently using another', () => {
    // Probing a scoped key makes an unexpandable one fatal where it was
    // previously never read. That is deliberate: the config asks for that
    // scope's token specifically, and quietly sending a different one would
    // authenticate as the wrong identity. The error names the key and the
    // variable, which is what the reader has to fix.
    const config = parseNpmrc([
      '//nexus.local/:@acme:_authToken=${ACME_TOKEN}',
      '//nexus.local/:_authToken=unscoped-secret',
    ].join('\n'))
    expect(() => resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {}))
      .toThrow(NpmrcEnvVarError)
    // A package outside the scope never reads that key, so it still resolves.
    expect(resolveAuthHeader(config, 'https://nexus.local/bar', 'bar', {})?.header)
      .toBe('Bearer unscoped-secret')
  })

  it('treats a blank credential as absent rather than sending it', () => {
    // An entry emptied instead of deleted must not shadow a working
    // credential further along the walk — least of all a scope-qualified
    // one, which outranks every unscoped key at every depth.
    const config = parseNpmrc([
      '//nexus.local/:@acme:_authToken=',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer working-secret')
  })

  it('treats a blank _auth as absent and falls through to a shallower dart', () => {
    // The blank has to sit where `_auth` would actually be consulted, and
    // the working credential out of that prefix's reach — a pair beside it
    // would win on order alone and the test could not fail.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:_auth=',
      '//nexus.local/:_authToken=works',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', {})?.header)
      .toBe('Bearer works')
  })

  it('treats a blank username as absent and falls through to a shallower dart', () => {
    // Half a pair is no pair: the blank username must not combine with the
    // password beside it, nor stop the walk before the working key above.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:username=',
      `//nexus.local/repository/npm/:_password=${Buffer.from('pass').toString('base64')}`,
      '//nexus.local/:_authToken=host-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', {})?.header)
      .toBe('Bearer host-secret')
  })

  it('never sends a username with a blank password', () => {
    // The regression this guards is a credential on the wire, not a missing
    // one: pairing the username with an empty password would send
    // `Basic <user>:` and read as a rejected login rather than a
    // misconfiguration.
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      '//nexus.local/:_password=',
      '//nexus.local/:_authToken=',
      '//other.local/:_authToken=elsewhere',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()
  })

  it('lets a blank value mask the other spelling of the same key', () => {
    // Reading past a blank spelling to the other one is what lets a blank
    // in a higher-precedence file reach a token in a lower-precedence one,
    // so the first spelling that exists settles the key. npm looks up one
    // spelling and goes anonymous on a blank; so does this.
    const config = parseNpmrc([
      '//nexus.local/:_authToken=',
      '//nexus.local/:_authtoken=real-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()
  })

  it('still matches a lowercase spelling when it is the only one present', () => {
    // Masking is about a blank, not about the spelling: with nothing under
    // the canonical name, the other spelling is still the key.
    const config = parseNpmrc('//nexus.local/:_authtoken=real-secret')
    const auth = resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})
    expect(auth?.header).toBe('Bearer real-secret')
    expect(auth?.keys).toEqual(['//nexus.local/:_authtoken'])
  })

  it('matches the path form of a scope-qualified key', () => {
    // pnpm strips a trailing scope segment off the key and binds the
    // credential to the registry above it, so the key covers packages in
    // that scope wherever the registry serves them.
    const config = parseNpmrc('//npm.pkg.github.com/@acme/:_authToken=path-form-secret')
    const url = 'https://npm.pkg.github.com/download/@acme/foo/1.0.0/abcdef'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})?.header).toBe('Bearer path-form-secret')
  })

  it('does not lend a path-form key to another scope', () => {
    const config = parseNpmrc('//npm.pkg.github.com/@acme/:_authToken=path-form-secret')
    const url = 'https://npm.pkg.github.com/download/@other/foo/1.0.0/abcdef'
    expect(resolveAuthHeader(config, url, '@other/foo', {})).toBeUndefined()
  })

  it('prefers the colon form over the path form at the same nerf dart', () => {
    const config = parseNpmrc([
      '//nexus.local/@acme/:_authToken=path-form-secret',
      '//nexus.local/:@acme:_authToken=colon-form-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/x/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer colon-form-secret')
  })

  it('lets a deeper unscoped key win over the path form', () => {
    // The path form is spelled exactly like a nerf dart for the path
    // `/@acme/`, which is how npm, yarn and bun read it. Ranking it below
    // the unscoped walk keeps a setup that authenticates today sending the
    // same credential it sends today.
    const config = parseNpmrc([
      '//nexus.local/@acme/:_authToken=path-form-secret',
      '//nexus.local/repository/npm/:_authToken=deeper-unscoped-secret',
    ].join('\n'))
    const url = 'https://nexus.local/repository/npm/@acme/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})?.header).toBe('Bearer deeper-unscoped-secret')
  })

  it('skips a path-form key whose ${VAR} is unset when the URL never touches that path', () => {
    // `//nexus.local/@acme/` is not a prefix of this URL, so under every
    // reading but pnpm's it says nothing about this request. Failing here
    // would abort a download that would otherwise have gone out.
    const config = parseNpmrc('//nexus.local/@acme/:_authToken=${UNSET_TOKEN}')
    const url = 'https://nexus.local/repository/npm/@acme/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})).toBeUndefined()
  })

  it('still fails on an unset ${VAR} when the scope path is part of the URL', () => {
    // Here the same key IS a nerf dart of the request, which every package
    // manager reads as applying to it, so the missing variable is fatal as
    // it would be for any other applicable key. The tolerance above is not
    // a blanket rule about the spelling.
    const config = parseNpmrc([
      '//nexus.local/@acme/:_authToken=${UNSET_TOKEN}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    const url = 'https://nexus.local/@acme/foo/-/foo-1.0.0.tgz'
    expect(() => resolveAuthHeader(config, url, '@acme/foo', {})).toThrow(NpmrcEnvVarError)
  })

  it('still uses a working key when a path-form one cannot be expanded', () => {
    const config = parseNpmrc([
      '//nexus.local/@acme/:_authToken=${UNSET_TOKEN}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/x/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer working-secret')
  })

  it('keeps a usable credential kind beside an unexpandable one at a path-form prefix', () => {
    // The tolerance is per key: one entry referencing a missing variable
    // must not discard the credential configured next to it.
    const config = parseNpmrc([
      '//nexus.local/@acme/:_authToken=${UNSET_TOKEN}',
      '//nexus.local/@acme/:_auth=dXNlcjpwYXNz',
    ].join('\n'))
    const url = 'https://nexus.local/repository/npm/@acme/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})?.header).toBe('Basic dXNlcjpwYXNz')
  })

  it('skips a _password whose ${VAR} is unset when no username sits beside it', () => {
    // Half a pair can never produce a credential, so expanding it would
    // fail the download over a key that was never going to be used.
    const config = parseNpmrc([
      '//nexus.local/:@acme:_password=${UNSET_PASSWORD}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer working-secret')
  })

  it('skips a username whose ${VAR} is unset when no password sits beside it', () => {
    // The mirror of the _password case: a leftover username from a setup
    // that moved to a token must not be fatal either.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:username=${UNSET_USER}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', {})?.header)
      .toBe('Bearer working-secret')
  })

  it('skips an unexpandable half of a pair whose other half is blank', () => {
    // A blank half is absent by the same rule an omitted one is, so the
    // pair can never form and the surviving half must not be expanded.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:username=',
      '//nexus.local/repository/npm/:_password=${UNSET_PASSWORD}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', {})?.header)
      .toBe('Bearer working-secret')
  })

  it('treats a ${VAR} that expands to the empty string as absent', () => {
    // How a missing CI secret usually arrives: the variable exists, its
    // value does not.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:_authToken=${CI_TOKEN}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', { CI_TOKEN: '' })?.header)
      .toBe('Bearer working-secret')
  })

  it('skips an unexpandable half whose partner expands to blank', () => {
    // The blank arrives through a variable rather than a literal, which is
    // the same thing once expanded — so the pair cannot form and the unset
    // variable in the other half must not abort the download.
    const config = parseNpmrc([
      '//nexus.local/repository/npm/:username=${CI_USER}',
      '//nexus.local/repository/npm/:_password=${CI_PASSWORD}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    const url = 'https://nexus.local/repository/npm/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, 'foo', { CI_USER: '' })?.header).toBe('Bearer working-secret')
  })

  it('reports the missing variable when the pair was real', () => {
    // Both halves are usable references, so the user meant a pair and one
    // variable is genuinely missing — worth naming rather than skipping.
    const config = parseNpmrc([
      '//nexus.local/:username=${CI_USER}',
      '//nexus.local/:_password=${CI_PASSWORD}',
    ].join('\n'))
    expect(() => resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', { CI_USER: 'user' }))
      .toThrow(NpmrcEnvVarError)
  })

  it('still reports an unset ${VAR} in a _password that completes a pair', () => {
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      '//nexus.local/:_password=${UNSET_PASSWORD}',
    ].join('\n'))
    expect(() => resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {}))
      .toThrow(NpmrcEnvVarError)
  })

  it('matches a slashless _authToken at the host root', () => {
    // The hand-written spelling without the trailing slash, which npm and
    // pnpm both accept: npm probes both forms at every depth, and pnpm
    // normalises this one to the canonical form at config load.
    const config = parseNpmrc('//nexus.local:_authToken=slashless-secret')
    const auth = resolveAuthHeader(config, 'https://nexus.local/foo/-/foo-1.0.0.tgz', 'foo', {})
    expect(auth?.header).toBe('Bearer slashless-secret')
    // The matched spelling is reported verbatim: it is the literal config
    // key, which is what `origins` is keyed by.
    expect(auth?.keys).toEqual(['//nexus.local:_authToken'])
  })

  it('matches a slashless key deeper in the path', () => {
    const config = parseNpmrc('//nexus.local/repository/npm:_authToken=deep-slashless-secret')
    const url = 'https://nexus.local/repository/npm/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, 'foo', {})?.header).toBe('Bearer deep-slashless-secret')
  })

  it('prefers the slash-terminated spelling at the same depth', () => {
    // npm's probe order: `//host/a/` before `//host/a`.
    const config = parseNpmrc([
      '//nexus.local/repository:_authToken=slashless-secret',
      '//nexus.local/repository/:_authToken=canonical-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/foo', 'foo', {})?.header)
      .toBe('Bearer canonical-secret')
  })

  it('lets a deeper slashless key win over a shallower canonical one', () => {
    // The spellings are probed per depth, not the canonical walk first.
    const config = parseNpmrc([
      '//nexus.local/:_authToken=shallow-canonical-secret',
      '//nexus.local/repository/npm:_authToken=deep-slashless-secret',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/npm/foo', 'foo', {})?.header)
      .toBe('Bearer deep-slashless-secret')
  })

  it('falls through a blank canonical spelling to the slashless one', () => {
    // npm's walk tests each probe for truthiness, so a blank entry under
    // the slash-terminated spelling does not stop it reading the slashless
    // one right behind it.
    const config = parseNpmrc([
      '//nexus.local/repository/:_authToken=',
      '//nexus.local/repository:_authToken=works',
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/repository/foo', 'foo', {})?.header)
      .toBe('Bearer works')
  })

  it('matches a slashless scope-qualified key', () => {
    const config = parseNpmrc('//nexus.local:@acme:_authToken=scoped-slashless-secret')
    expect(resolveAuthHeader(config, 'https://nexus.local/@acme/foo', '@acme/foo', {})?.header)
      .toBe('Bearer scoped-slashless-secret')
  })

  it('matches a slashless path-form key', () => {
    const config = parseNpmrc('//npm.pkg.github.com/@acme:_authToken=path-form-slashless-secret')
    const url = 'https://npm.pkg.github.com/download/@acme/foo/1.0.0/abcdef'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})?.header)
      .toBe('Bearer path-form-slashless-secret')
  })

  it('never pairs a username with a _password under the other spelling', () => {
    // Both halves must share one exact prefix — the spellings are distinct
    // prefixes like any other. npm behaves the same, since its walk checks
    // one probe at a time.
    const config = parseNpmrc([
      '//nexus.local/:username=user',
      `//nexus.local:_password=${Buffer.from('pass').toString('base64')}`,
    ].join('\n'))
    expect(resolveAuthHeader(config, 'https://nexus.local/foo', 'foo', {})).toBeUndefined()
  })

  it('reports an unset ${VAR} in a slashless key instead of a shallower credential', () => {
    // A slashless key used to be invisible, so the shallower credential
    // went out. Now the key plainly applies to the request, which makes
    // its missing variable fatal like any other applicable key's — quietly
    // sending a different credential would authenticate as an identity the
    // config asked to replace.
    const config = parseNpmrc([
      '//nexus.local/repository:_authToken=${UNSET_TOKEN}',
      '//nexus.local/:_authToken=working-secret',
    ].join('\n'))
    expect(() => resolveAuthHeader(config, 'https://nexus.local/repository/foo', 'foo', {}))
      .toThrow(NpmrcEnvVarError)
  })

  it('skips a slashless path-form key whose ${VAR} is unset when the URL never touches that path', () => {
    // The slashless spelling gets the same tolerance as the canonical one:
    // the key names a location this request never touches, so a variable
    // missing from it must not abort the download.
    const config = parseNpmrc('//nexus.local/@acme:_authToken=${UNSET_TOKEN}')
    const url = 'https://nexus.local/repository/npm/@acme/foo/-/foo-1.0.0.tgz'
    expect(resolveAuthHeader(config, url, '@acme/foo', {})).toBeUndefined()
  })
})
