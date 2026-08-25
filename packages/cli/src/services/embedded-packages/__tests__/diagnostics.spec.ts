import { describe, it, expect } from 'vitest'

import { UNPRINTABLE_URL, describeUnusableUrlOrigin, downloadFailureHint, redactUrl } from '../diagnostics.js'
import { ConfigOrigin, LoadedNpmrcConfig } from '../npmrc.js'

function npmrc (overrides: Partial<LoadedNpmrcConfig> = {}): LoadedNpmrcConfig {
  return {
    config: new Map(),
    files: ['/ws/.npmrc', '/home/u/.npmrc'],
    unreadable: [],
    origins: new Map<string, ConfigOrigin>(),
    ...overrides,
  }
}

describe('redactUrl()', () => {
  // Only scheme and host survive. The path goes too: some registries take
  // a token as a path segment, and the package name and version the path
  // encodes are already stated separately in every message that shows a URL.
  it.each([
    ['userinfo', 'https://user:tok@nexus.local/npm/foo.tgz', 'https://nexus.local'],
    ['a port with userinfo', 'https://u:p@nexus.local:8443/npm/f.tgz', 'https://nexus.local:8443'],
    ['a query, which may hold a pre-signed signature',
      'https://cdn.example.com/f.tgz?X-Amz-Signature=deadbeef', 'https://cdn.example.com'],
    ['a fragment', 'https://cdn.example.com/f.tgz#tok=deadbeef', 'https://cdn.example.com'],
    ['a token in a path segment', 'https://nexus.local/s3cret-token/npm/f.tgz', 'https://nexus.local'],
    // The WHATWG parser strips surrounding whitespace, so this is a normal
    // parse rather than one of the malformed shapes below.
    ['userinfo, ignoring leading whitespace', ' https://user:tok@nexus.local/x', 'https://nexus.local'],
  ])('keeps only scheme and host, dropping %s', (_label, input, expected) => {
    expect(redactUrl(input)).toBe(expected)
  })

  // Each of these leaked a credential through an earlier string-surgery
  // implementation. None can be redacted reliably — telling userinfo from a
  // path in a malformed string needs a parser — so none is echoed at all.
  it.each([
    ['no scheme and no slashes', 'admin:s3cret@nexus.local/npm/'],
    ['an @ inside the password', '//user:p@ss@nexus.local/npm/'],
    ['a scheme with an out-of-range port', 'https://user:tok@nexus.local:99999/x'],
    ['whitespace inside the credential', 'https://user:pa ss@nexus.local:99999/x'],
    ['an extra leading slash', '///user:tok@nexus.local/x'],
    ['an unencoded slash in the password', '//user:pa/ss@nexus.local/x'],
    ['a scheme-less host and port', 'nexus.local:8443/npm/@acme/foo.tgz'],
    // Withheld for the same reason it cannot be requested: what may be
    // echoed and what may be fetched are one rule.
    ['a scheme nothing here fetches', 'ftp://user:tok@nexus.local/x'],
  ])('withholds an unusable URL with %s', (_label, input) => {
    const redacted = redactUrl(input)
    expect(redacted).toBe(UNPRINTABLE_URL)
    for (const secret of ['s3cret', 'tok', 'p@ss', 'pa ss', 'pa/ss']) {
      expect(redacted).not.toContain(secret)
    }
  })
})

describe('downloadFailureHint()', () => {
  it('says nothing for a status authentication cannot explain', () => {
    expect(downloadFailureHint(500, undefined, npmrc())).toBe('')
  })

  // The URL in the message is the one that was requested, so a hop has to
  // be reported whatever the status — otherwise the message names a host
  // that produced nothing.
  it('reports a redirect for a status authentication cannot explain', () => {
    expect(downloadFailureHint(500, undefined, npmrc(), { host: 'cdn.example.com' }))
      .toContain(`redirected to 'cdn.example.com', which is what answered`)
  })

  it('does not claim the redirect target answered when nothing did', () => {
    // No status means no response at all — a reset or a timeout.
    const hint = downloadFailureHint(undefined, undefined, npmrc(), { host: 'cdn.example.com' })
    expect(hint).toContain(`redirected to 'cdn.example.com' before it failed`)
    expect(hint).not.toContain('is what answered')
  })

  it('names every source consulted when no credentials matched', () => {
    const hint = downloadFailureHint(401, undefined, npmrc())
    expect(hint).toContain('npm_config_* environment variables')
    expect(hint).toContain('/ws/.npmrc')
    expect(hint).toContain('/home/u/.npmrc')
  })

  it('hedges a 404 as a possible authorization failure', () => {
    expect(downloadFailureHint(404, undefined, npmrc()))
      .toMatch(/may answer 404 for a package you are not authorized to see/)
  })

  it('names the file a rejected credential came from', () => {
    const origins = new Map<string, ConfigOrigin>([
      ['//nexus.local/:_authToken', { kind: 'file', path: '/home/u/.npmrc' }],
    ])
    const hint = downloadFailureHint(401, { from: 'config', keys: ['//nexus.local/:_authToken'] }, npmrc({ origins }))
    expect(hint).toContain(`'//nexus.local/:_authToken' in '/home/u/.npmrc'`)
    expect(hint).toMatch(/were rejected/)
  })

  it('names an environment variable by its verbatim spelling', () => {
    const origins = new Map<string, ConfigOrigin>([
      ['registry', { kind: 'env', variable: 'NPM_CONFIG_REGISTRY' }],
    ])
    const hint = downloadFailureHint(401, { from: 'config', keys: ['registry'] }, npmrc({ origins }))
    expect(hint).toContain(`the 'NPM_CONFIG_REGISTRY' environment variable`)
    expect(hint).not.toContain('npm_config_registry')
  })

  it('reports both halves of a username/password pair separately', () => {
    const origins = new Map<string, ConfigOrigin>([
      ['//h/:username', { kind: 'file', path: '/ws/.npmrc' }],
      ['//h/:_password', { kind: 'env', variable: 'npm_config_//h/:_password' }],
    ])
    const hint = downloadFailureHint(401, { from: 'config', keys: ['//h/:username', '//h/:_password'] }, npmrc({ origins }))
    expect(hint).toContain(`'//h/:username' in '/ws/.npmrc'`)
    expect(hint).toContain(`the 'npm_config_//h/:_password' environment variable`)
  })

  it('blames a redirect that dropped the credentials, not the credentials', () => {
    const hint = downloadFailureHint(
      404,
      { from: 'config', keys: ['//h/:_authToken'] },
      npmrc(),
      { host: 'cdn.example.com', credentialsDropped: true },
    )
    expect(hint).toContain(`redirected to 'cdn.example.com'`)
    expect(hint).not.toMatch(/were rejected/)
  })

  // Without this the reader is told to configure credentials for a host
  // that never asked for any.
  it('mentions a redirect even when no credentials were configured', () => {
    const hint = downloadFailureHint(404, undefined, npmrc(), { host: 'cdn.example.com' })
    expect(hint).toContain(`redirected to 'cdn.example.com'`)
    expect(hint).toContain('which is what answered')
  })

  it('mentions a redirect that carried the credentials through', () => {
    const hint = downloadFailureHint(
      401,
      { from: 'config', keys: ['//h/:_authToken'] },
      npmrc(),
      { host: 'other.example.com' },
    )
    expect(hint).toMatch(/were rejected/)
    expect(hint).toContain(`redirect to 'other.example.com'`)
  })

  it('reports a config file that could not be read', () => {
    const hint = downloadFailureHint(401, undefined, npmrc({ unreadable: ['/home/u/pnpm/auth.ini'] }))
    expect(hint).toContain('/home/u/pnpm/auth.ini')
    expect(hint).toMatch(/could not be read/)
  })

  it('never repeats a credential value', () => {
    // The hint is assembled from keys and paths only; nothing in its inputs
    // carries a value, and this pins that the config map is not consulted.
    const config = new Map([['//h/:_authToken', 'super-secret']])
    const hint = downloadFailureHint(401, { from: 'config', keys: ['//h/:_authToken'] }, npmrc({ config }))
    expect(hint).not.toContain('super-secret')
  })
})

describe('describeUnusableUrlOrigin()', () => {
  const origins = new Map<string, ConfigOrigin>([
    ['registry', { kind: 'file', path: '/ws/.npmrc' }],
  ])

  it('sends the reader to the lockfile when the lockfile recorded the URL', () => {
    const described = describeUnusableUrlOrigin({ lockfile: '/ws/pnpm-lock.yaml' }, npmrc())
    expect(described).toContain('recorded in \'/ws/pnpm-lock.yaml\'')
    expect(described).not.toContain('registry')
  })

  it('does not send the reader to a registry setting that does not exist', () => {
    // The metadata branch also covers the case where nothing configures a
    // registry, where telling someone to check "the setting" is a dead end.
    const described = describeUnusableUrlOrigin({ metadata: {} }, npmrc())
    expect(described).toContain('nothing here configures a registry')
    expect(described).not.toContain('check that the setting')
  })

  it('says a metadata URL is the registry\'s to correct, not the project\'s', () => {
    const described = describeUnusableUrlOrigin({ metadata: { registryKey: 'registry' } }, npmrc({ origins }))
    expect(described).toContain('package metadata served by')
    expect(described).toContain('\'registry\' in \'/ws/.npmrc\'')
    // Not the wording used when the project itself composed the URL.
    expect(described).not.toContain('malformed package name')
  })
})

describe('credentials carried by a URL', () => {
  const origins = new Map<string, ConfigOrigin>([
    ['registry', { kind: 'file', path: '/ws/.npmrc' }],
  ])

  it('names the registry URL once, not twice', () => {
    // An earlier revision nested 'the registry configured by' inside 'the
    // registry URL configured by', which read as gibberish.
    const hint = downloadFailureHint(401, { from: 'url', origin: { registryKey: 'registry' } }, npmrc({ origins }))
    expect(hint).toContain('came from the URL of the registry configured by \'registry\' in \'/ws/.npmrc\'.')
    expect(hint).not.toContain('configured by the registry configured by')
  })

  it('says a metadata-supplied URL was issued by the registry, not configured locally', () => {
    const sent = { from: 'url', origin: { metadata: { registryKey: 'registry' } } } as const
    const hint = downloadFailureHint(401, sent, npmrc({ origins }))
    expect(hint).toContain('issued by that registry rather than configured here')
  })

  it('names the lockfile for a URL it recorded', () => {
    const sent = { from: 'url', origin: { lockfile: '/ws/yarn.lock' } } as const
    expect(downloadFailureHint(401, sent, npmrc())).toContain('recorded in \'/ws/yarn.lock\'')
  })
})
