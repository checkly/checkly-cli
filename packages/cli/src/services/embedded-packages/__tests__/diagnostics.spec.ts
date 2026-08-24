import { describe, it, expect } from 'vitest'

import { UNPRINTABLE_URL, downloadFailureHint, redactUrl } from '../diagnostics.js'
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
  it.each([
    ['userinfo', 'https://user:tok@nexus.local/npm/foo.tgz', 'https://nexus.local/npm/foo.tgz'],
    ['a port with userinfo', 'https://u:p@nexus.local:8443/npm/f.tgz', 'https://nexus.local:8443/npm/f.tgz'],
    ['a query, which may hold a pre-signed signature',
      'https://cdn.example.com/f.tgz?X-Amz-Signature=deadbeef', 'https://cdn.example.com/f.tgz'],
    ['a fragment', 'https://cdn.example.com/f.tgz#tok=deadbeef', 'https://cdn.example.com/f.tgz'],
    // The WHATWG parser strips surrounding whitespace, so this is a normal
    // parse rather than one of the malformed shapes below.
    ['userinfo, ignoring leading whitespace', ' https://user:tok@nexus.local/x', 'https://nexus.local/x'],
  ])('rebuilds a parseable URL without %s', (_label, input, expected) => {
    expect(redactUrl(input)).toBe(expected)
  })

  it('keeps a scoped package name in the path', () => {
    expect(redactUrl('https://nexus.local/npm/@acme/foo/-/foo-1.0.0.tgz'))
      .toBe('https://nexus.local/npm/@acme/foo/-/foo-1.0.0.tgz')
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
