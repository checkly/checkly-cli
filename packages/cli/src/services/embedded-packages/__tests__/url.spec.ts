import { describe, expect, it } from 'vitest'

import { parseComposableUrl, parseFetchableUrl } from '../url.js'

describe('parseFetchableUrl()', () => {
  it.each([
    ['a plain https URL', 'https://nexus.local/repository/npm/'],
    ['a port', 'https://nexus.local:8443/npm/'],
    ['http', 'http://127.0.0.1:4873/'],
    // Fetchable, and redaction drops these before anything is echoed.
    ['userinfo', 'https://user:tok@nexus.local/npm/'],
    ['a query, which a request may legitimately carry', 'https://cdn.example.com/f.tgz?sig=abc'],
  ])('accepts %s', (_label, url) => {
    expect(parseFetchableUrl(url)?.host).not.toBe(undefined)
  })

  it.each([
    ['a bare host', 'nexus.local/repository/npm/'],
    ['a scheme with nothing after it', 'https://'],
    // Parses as the opaque scheme `admin:` with no host, leaving the
    // credential in what looks like a path.
    ['userinfo with no scheme', 'admin:s3cret@nexus.local/npm/'],
    ['a scheme nothing here fetches', 'ftp://nexus.local/npm/'],
    ['a scheme that never has a host', 'file:///srv/npm-mirror/'],
    ['an empty string', ''],
  ])('rejects %s', (_label, url) => {
    expect(parseFetchableUrl(url)).toBeUndefined()
  })
})

describe('parseComposableUrl()', () => {
  it('accepts a URL a path can be appended to', () => {
    expect(parseComposableUrl('https://nexus.local/repository/npm/')?.host).toBe('nexus.local')
  })

  it.each([
    // Each of these absorbs whatever is appended, so the composed path
    // would never reach the server.
    ['a query', 'https://nexus.local/npm/?token=abc'],
    ['a bare query delimiter', 'https://nexus.local/npm/?'],
    ['a fragment', 'https://nexus.local/npm/#tok'],
    ['a bare fragment delimiter', 'https://nexus.local/npm/#'],
  ])('rejects %s', (_label, url) => {
    expect(parseComposableUrl(url)).toBeUndefined()
  })

  it('rejects everything an unfetchable URL is rejected for', () => {
    expect(parseComposableUrl('ftp://nexus.local/npm/')).toBeUndefined()
    expect(parseComposableUrl('nexus.local/npm/')).toBeUndefined()
  })
})
