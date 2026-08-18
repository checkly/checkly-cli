import { createHash } from 'node:crypto'
import http from 'node:http'
import { AddressInfo } from 'node:net'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  DetectionUnavailableError,
  NexusRegistryApi,
  PropagationContext,
  classifyEntries,
  decideWithHostedInventory,
  diffAgainstPublicRegistry,
  graphKey,
  planPropagationRound,
} from '../detection.js'
import { LockfileDependencyGraph, LockfileRegistryPackage } from '../lockfile-packages.js'
import { parseNpmrc } from '../npmrc.js'

const entry = (name: string, version: string, integrity: string, tarballUrl?: string): LockfileRegistryPackage => ({
  name, version, integrity, tarballUrl,
})

const sha512Of = (content: string) => `sha512-${createHash('sha512').update(content).digest('base64')}`

describe('classifyEntries()', () => {
  it('proves everything public under the default public registry', () => {
    const result = classifyEntries([
      entry('foo', '1.0.0', 'sha512-aaa'),
      entry('@acme/bar', '2.0.0', 'sha512-bbb'),
    ], new Map(), {})
    expect(result.public).toHaveLength(2)
    expect(result.embed).toHaveLength(0)
    expect(result.undecided).toHaveLength(0)
  })

  it('recognizes the yarnpkg mirror as public', () => {
    const config = parseNpmrc('registry=https://registry.yarnpkg.com/')
    const result = classifyEntries([entry('foo', '1.0.0', 'sha512-aaa')], config, {})
    expect(result.public).toHaveLength(1)
  })

  it('embeds scope-mapped packages without a lookup', () => {
    const config = parseNpmrc([
      'registry=https://registry.npmjs.org/',
      '@acme:registry=https://nexus.local/repository/npm-private/',
    ].join('\n'))
    const result = classifyEntries([
      entry('@acme/private-utils', '1.2.3', 'sha512-aaa'),
      entry('public-pkg', '1.0.0', 'sha512-bbb'),
    ], config, {})
    expect(result.embed.map(e => e.name)).toEqual(['@acme/private-utils'])
    expect(result.public.map(e => e.name)).toEqual(['public-pkg'])
  })

  it('leaves everything undecided under a non-public default registry', () => {
    const config = parseNpmrc('registry=https://nexus.local/repository/npm/')
    const result = classifyEntries([
      entry('foo', '1.0.0', 'sha512-aaa'),
      entry('@acme/bar', '2.0.0', 'sha512-bbb'),
    ], config, {})
    expect(result.undecided).toHaveLength(2)
    expect(result.embed).toHaveLength(0)
  })

  it('treats a lockfile-recorded public tarball URL as proof of publicness', () => {
    const config = parseNpmrc('registry=https://nexus.local/repository/npm/')
    const result = classifyEntries([
      entry('foo', '1.0.0', 'sha512-aaa', 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz'),
    ], config, {})
    expect(result.public.map(e => e.name)).toEqual(['foo'])
  })

  it('lets a scope mapping mark a package private even with a non-public recorded source', () => {
    // npm lockfiles record `resolved` for every entry; that must not
    // defeat the zero-network scope tier.
    const config = parseNpmrc([
      'registry=https://registry.npmjs.org/',
      '@acme:registry=https://nexus.local/repository/npm-private/',
    ].join('\n'))
    const result = classifyEntries([
      entry('@acme/private-utils', '1.2.3', 'sha512-aaa',
        'https://nexus.local/repository/npm-private/@acme/private-utils/-/private-utils-1.2.3.tgz'),
    ], config, {})
    expect(result.embed.map(e => e.name)).toEqual(['@acme/private-utils'])
  })

  it('keeps a scope-mapped entry in the embed tier when its mapping references an unset variable', () => {
    // An @scope:registry mapping that fails to expand is never the public
    // registry, so the scope tier's no-lookup guarantee must hold —
    // 'undecided' could transmit the private name under the opt-in.
    const config = parseNpmrc([
      'registry=https://registry.npmjs.org/',
      '@broken:registry=${RED862_UNSET}',
    ].join('\n'))
    const result = classifyEntries([
      entry('@broken/pkg', '1.0.0', 'sha512-aaa'),
      entry('fine-pkg', '1.0.0', 'sha512-bbb'),
    ], config, {})
    expect(result.embed.map(e => e.name)).toEqual(['@broken/pkg'])
    expect(result.public.map(e => e.name)).toEqual(['fine-pkg'])
  })

  it('classifies an unscoped entry as undecided when the default registry mapping references an unset variable', () => {
    const config = parseNpmrc('registry=${RED862_UNSET}')
    const result = classifyEntries([entry('some-pkg', '1.0.0', 'sha512-aaa')], config, {})
    expect(result.undecided.map(e => e.name)).toEqual(['some-pkg'])
  })

  it('never lets registry configuration vouch for a non-public recorded source', () => {
    // The artifact demonstrably came from a non-public host; a later
    // .npmrc pointing at the public registry proves nothing about it.
    const config = parseNpmrc('registry=https://registry.npmjs.org/')
    const result = classifyEntries([
      entry('bar', '2.0.0', 'sha512-bbb', 'https://nexus.local/repository/npm/bar/-/bar-2.0.0.tgz'),
    ], config, {})
    expect(result.undecided.map(e => e.name)).toEqual(['bar'])
  })
})

describe('NexusRegistryApi', () => {
  describe('forRegistry()', () => {
    it('derives the REST base from a Nexus content URL', () => {
      expect(NexusRegistryApi.forRegistry('https://nexus.local/repository/npm-group/', new Map(), {}))
        .toBeDefined()
    })

    it('returns undefined for URLs without the Nexus repository layout', () => {
      expect(NexusRegistryApi.forRegistry('https://registry.example.com/npm/', new Map(), {}))
        .toBeUndefined()
    })
  })

  describe('hosted-inventory interrogation', () => {
    // Composes the same three steps production performs (materializer's
    // per-instance memoization is why no composite method exists on the
    // class itself).
    const listHosted = async (api: NexusRegistryApi): Promise<Set<string>> => {
      const repositories = await api.listRepositories()
      api.assertSourceRepoVisible(repositories)
      return await api.hostedInventory(repositories)
    }

    let server: http.Server
    let serverUrl: string
    let requests: Array<{ url: string, authorization?: string }>
    let mode: 'ok' | 'forbidden' | 'garbage' | 'filtered'

    beforeEach(async () => {
      requests = []
      mode = 'ok'
      server = http.createServer((req, res) => {
        requests.push({ url: req.url!, authorization: req.headers.authorization })
        if (mode === 'forbidden') {
          res.statusCode = 403
          return res.end('forbidden')
        }
        if (mode === 'garbage') {
          res.setHeader('content-type', 'text/html')
          return res.end('<html>captive portal</html>')
        }
        const respond = (body: unknown) => {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.url === '/service/rest/v1/repositories') {
          if (mode === 'filtered') {
            // A permission-filtered listing that omits the group the
            // project installs from.
            return respond([{ name: 'maven-releases', format: 'maven2', type: 'hosted' }])
          }
          return respond([
            { name: 'npm-private', format: 'npm', type: 'hosted' },
            { name: 'npm-extra', format: 'npm', type: 'hosted' },
            { name: 'npm-proxy', format: 'npm', type: 'proxy' },
            { name: 'npm-group', format: 'npm', type: 'group' },
            { name: 'maven-releases', format: 'maven2', type: 'hosted' },
          ])
        }
        if (req.url === '/service/rest/v1/components?repository=npm-private') {
          // First page with a continuation token, mirroring the real API.
          return respond({
            items: [{
              repository: 'npm-private',
              format: 'npm',
              group: 'acme',
              name: 'private-utils',
              version: '1.2.3',
              assets: [{
                checksum: { sha1: 'aa'.repeat(20), sha512: 'bb'.repeat(64) },
                npm: { name: '@acme/private-utils', version: '1.2.3' },
              }],
            }],
            continuationToken: 'page-2',
          })
        }
        if (req.url === '/service/rest/v1/components?repository=npm-private&continuationToken=page-2') {
          return respond({
            items: [{
              repository: 'npm-private',
              format: 'npm',
              group: null,
              name: 'legacy-private-pkg',
              version: '2.1.0',
              // No npm metadata on the asset: the group/name fallback is
              // exercised.
              assets: [{ checksum: { sha1: 'cc'.repeat(20) } }],
            }],
            continuationToken: null,
          })
        }
        if (req.url === '/service/rest/v1/components?repository=npm-extra') {
          return respond({ items: [], continuationToken: null })
        }
        res.statusCode = 404
        res.end('not found')
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const { address, port } = server.address() as AddressInfo
      serverUrl = `http://${address}:${port}/repository/npm-group/`
    })

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    })

    it('enumerates all hosted npm repositories with pagination', async () => {
      const api = NexusRegistryApi.forRegistry(serverUrl, new Map(), {})!
      const inventory = await listHosted(api)
      expect([...inventory.keys()].sort()).toEqual([
        '@acme/private-utils@1.2.3',
        'legacy-private-pkg@2.1.0',
      ])
      expect(requests.map(r => r.url)).toEqual([
        '/service/rest/v1/repositories',
        '/service/rest/v1/components?repository=npm-private',
        '/service/rest/v1/components?repository=npm-private&continuationToken=page-2',
        '/service/rest/v1/components?repository=npm-extra',
      ])
    })

    it('sends the npm credentials configured for the registry', async () => {
      const config = parseNpmrc(`//127.0.0.1:${(server.address() as AddressInfo).port}/:_authToken=secret`)
      const api = NexusRegistryApi.forRegistry(serverUrl, config, {})!
      await listHosted(api)
      expect(requests[0].authorization).toBe('Bearer secret')
    })

    it('treats a listing that omits the source repository as permission-filtered', async () => {
      mode = 'filtered'
      const api = NexusRegistryApi.forRegistry(serverUrl, new Map(), {})!
      await expect(listHosted(api)).rejects.toThrow(/filtered by permissions/)
    })

    it('fails rather than truncating when pagination exceeds the page guard', async () => {
      const workingListener = server.listeners('request')[0] as http.RequestListener
      server.removeAllListeners('request')
      let pages = 0
      server.on('request', (req, res) => {
        if (req.url!.startsWith('/service/rest/v1/components?repository=npm-private')) {
          pages++
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify({ items: [], continuationToken: `page-${pages}` }))
        }
        workingListener(req as never, res as never)
      })
      const api = NexusRegistryApi.forRegistry(serverUrl, new Map(), {})!
      await expect(listHosted(api)).rejects.toThrow(/more hosted components than detection is prepared/)
      // The fail-fast property: bounded pages, not an unbounded walk.
      expect(pages).toBeLessThanOrEqual(51)
    })

    it('degrades when no hosted npm repositories are visible', async () => {
      const workingListener2 = server.listeners('request')[0] as http.RequestListener
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        if (req.url === '/service/rest/v1/repositories') {
          res.setHeader('content-type', 'application/json')
          // The source group is visible, but no hosted repos are.
          return res.end(JSON.stringify([
            { name: 'npm-group', format: 'npm', type: 'group' },
            { name: 'npm-proxy', format: 'npm', type: 'proxy' },
          ]))
        }
        workingListener2(req as never, res as never)
      })
      const api = NexusRegistryApi.forRegistry(serverUrl, new Map(), {})!
      await expect(listHosted(api)).rejects.toThrow(/No npm hosted repositories are visible/)
    })

    it('reports an inaccessible API as DetectionUnavailableError', async () => {
      mode = 'forbidden'
      const api = NexusRegistryApi.forRegistry(serverUrl, new Map(), {})!
      await expect(listHosted(api)).rejects.toThrow(DetectionUnavailableError)
    })

    it('reports an unexpected response shape as DetectionUnavailableError', async () => {
      mode = 'garbage'
      const api = NexusRegistryApi.forRegistry(serverUrl, new Map(), {})!
      await expect(listHosted(api)).rejects.toThrow(DetectionUnavailableError)
    })
  })
})

describe('decideWithHostedInventory()', () => {
  it('embeds hosted entries and marks the rest public', () => {
    const hosted = entry('@acme/private-utils', '1.2.3', 'sha512-aaa')
    const proxied = entry('is-odd', '3.0.1', 'sha512-bbb')
    const verdicts = decideWithHostedInventory(
      [hosted, proxied],
      new Set(['@acme/private-utils@1.2.3']),
    )
    expect(verdicts.get(hosted)).toBe('embed')
    expect(verdicts.get(proxied)).toBe('public')
  })
})

describe('diffAgainstPublicRegistry()', () => {
  let server: http.Server
  let serverUrl: string
  let requests: string[]

  const publicContent = 'public tarball bytes'
  const publicIntegrity = sha512Of(publicContent)
  const publicShasum = createHash('sha1').update(publicContent).digest('hex')

  beforeEach(async () => {
    requests = []
    server = http.createServer((req, res) => {
      requests.push(req.url!)
      const respond = (body: unknown) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }
      switch (req.url) {
        case '/public-pkg':
          return respond({ versions: { '1.0.0': { dist: { integrity: publicIntegrity } } } })
        case '/shasum-only-pkg':
          return respond({ versions: { '1.0.0': { dist: { shasum: publicShasum } } } })
        case '/shadowed-pkg':
          return respond({ versions: { '1.0.0': { dist: { integrity: sha512Of('a different artifact') } } } })
        case '/version-gap-pkg':
          return respond({ versions: { '9.9.9': { dist: { integrity: publicIntegrity } } } })
        case '/garbage-pkg':
          return respond({ hello: 'captive portal' })
        case '/malformed-dist-pkg':
          return respond({ versions: { '1.0.0': { dist: { shasum: 123, integrity: 42 } } } })
        default:
          res.statusCode = 404
          res.end('not found')
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { address, port } = server.address() as AddressInfo
    serverUrl = `http://${address}:${port}/`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  })

  const diff = (entries: LockfileRegistryPackage[]) =>
    diffAgainstPublicRegistry(entries, { publicRegistryUrl: serverUrl })

  it('marks an integrity match as public', async () => {
    const e = entry('public-pkg', '1.0.0', publicIntegrity)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'public']]))
  })

  it('matches legacy shasum-only public metadata', async () => {
    const e = entry('shasum-only-pkg', '1.0.0', `sha1-${createHash('sha1').update(publicContent).digest('base64')}`)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'public']]))
  })

  it('embeds on malformed dist field types instead of rejecting', async () => {
    const e = entry('malformed-dist-pkg', '1.0.0', publicIntegrity)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'embed']]))
  })

  it('embeds on integrity mismatch (shadowed name)', async () => {
    const e = entry('shadowed-pkg', '1.0.0', publicIntegrity)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'embed']]))
  })

  it('embeds when the version is absent publicly', async () => {
    const e = entry('version-gap-pkg', '1.0.0', publicIntegrity)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'embed']]))
  })

  it('embeds when the name does not exist publicly (404)', async () => {
    const e = entry('no-such-pkg', '1.0.0', publicIntegrity)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'embed']]))
  })

  it('embeds sha512 entries when public metadata only has an incomparable hash', async () => {
    const e = entry('shasum-only-pkg', '1.0.0', publicIntegrity)
    await expect(diff([e])).resolves.toEqual(new Map([[e, 'embed']]))
  })

  it('fetches one packument per unique name', async () => {
    await diff([
      entry('public-pkg', '1.0.0', publicIntegrity),
      entry('public-pkg', '2.0.0', publicIntegrity),
      entry('no-such-pkg', '1.0.0', publicIntegrity),
    ])
    expect(requests.sort()).toEqual(['/no-such-pkg', '/public-pkg'])
  })

  it('encodes scoped names', async () => {
    await diff([entry('@acme/foo', '1.0.0', publicIntegrity)])
    expect(requests).toEqual(['/@acme%2Ffoo'])
  })

  it('rejects a 200 that is not a packument instead of guessing', async () => {
    await expect(diff([entry('garbage-pkg', '1.0.0', publicIntegrity)]))
      .rejects.toThrow(DetectionUnavailableError)
  })

  it('reports an unreachable registry as DetectionUnavailableError', async () => {
    await expect(diffAgainstPublicRegistry(
      [entry('foo', '1.0.0', publicIntegrity)],
      { publicRegistryUrl: 'http://127.0.0.1:1/' },
    )).rejects.toThrow(DetectionUnavailableError)
  })
})

describe('planPropagationRound()', () => {
  const graphOf = (edges: Record<string, string[]>, roots: string[] = []): LockfileDependencyGraph => ({
    edges: new Map(Object.entries(edges).map(([source, targets]) => [source, new Set(targets)])),
    roots: new Set(roots),
  })

  const contextOf = (
    graph: LockfileDependencyGraph,
    options: {
      publicKeys?: string[]
      embedKeys?: string[]
      privateNames?: string[]
      multiUndecidedNames?: string[]
    } = {},
  ): PropagationContext => ({
    graph,
    publicKeys: new Set(options.publicKeys),
    embedKeys: new Set(options.embedKeys),
    privateNames: new Set(options.privateNames),
    assumedCount: 0,
    multiUndecidedNames: new Set(options.multiUndecidedNames),
  })

  const keys = (entries: LockfileRegistryPackage[]) => entries.map(graphKey).sort()

  it('assumes one layer per round, deferring entries whose parents are still undecided', () => {
    const graph = graphOf({ 'top@1.0.0': ['mid@1.0.0'], 'mid@1.0.0': ['leaf@1.0.0'] })
    const context = contextOf(graph, { publicKeys: ['top@1.0.0'] })
    const undecided = [
      entry('mid', '1.0.0', 'sha512-aaa'),
      entry('leaf', '1.0.0', 'sha512-bbb'),
    ]
    // mid's only parent is decided (public), so it is assumed; leaf's
    // parent mid is still undecided — its verdict could yet prove
    // private — so leaf waits.
    const first = planPropagationRound(undecided, context)
    expect(keys(first.assumed)).toEqual(['mid@1.0.0'])
    expect(first.frontier).toEqual([])

    // Once mid settles into publicKeys, the next round assumes leaf.
    context.publicKeys.add('mid@1.0.0')
    const second = planPropagationRound([undecided[1]], context)
    expect(keys(second.assumed)).toEqual(['leaf@1.0.0'])
  })

  it('exposes roots and waits for entries whose parents are undecided', () => {
    const undecided = [
      entry('top', '1.0.0', 'sha512-aaa'),
      entry('mid', '1.0.0', 'sha512-bbb'),
    ]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({ 'top@1.0.0': ['mid@1.0.0'] }, ['top@1.0.0']),
    ))
    expect(keys(round.frontier)).toEqual(['top@1.0.0'])
    expect(round.assumed).toEqual([])
  })

  it('exposes children of embedded packages and orphans of non-registry parents', () => {
    const undecided = [
      entry('private-dep', '1.0.0', 'sha512-aaa'),
      entry('git-child', '1.0.0', 'sha512-bbb'),
    ]
    const round = planPropagationRound(undecided, contextOf(
      // The git parent's key is not a registry entry, so its edge source
      // is outside the universe and git-child counts as parentless.
      graphOf({ '@acme/private@2.0.0': ['private-dep@1.0.0'], 'git-pkg@1.0.0': ['git-child@1.0.0'] }),
      {
        embedKeys: ['@acme/private@2.0.0'],
      },
    ))
    expect(keys(round.frontier)).toEqual(['git-child@1.0.0', 'private-dep@1.0.0'])
  })

  it('exposes a root even when a public parent vouches for it', () => {
    // A privately patched fork of a public name is most likely a direct
    // dependency; verification, not assumption, is what catches it.
    const undecided = [entry('chalk', '5.3.0', 'sha512-fork')]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({ 'pub@1.0.0': ['chalk@5.3.0'] }, ['chalk@5.3.0']),
      {
        publicKeys: ['pub@1.0.0'],
      },
    ))
    expect(round.assumed).toEqual([])
    expect(keys(round.frontier)).toEqual(['chalk@5.3.0'])
  })

  it('exposes a child of an embedded package even when a public parent also vouches for it', () => {
    const undecided = [
      entry('shared-dep', '1.0.0', 'sha512-aaa'),
      entry('below', '1.0.0', 'sha512-bbb'),
    ]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({
        'pub@1.0.0': ['shared-dep@1.0.0'],
        '@acme/private@2.0.0': ['shared-dep@1.0.0'],
        'shared-dep@1.0.0': ['below@1.0.0'],
      }),
      {
        publicKeys: ['pub@1.0.0'],
        embedKeys: ['@acme/private@2.0.0'],
      },
    ))
    expect(keys(round.frontier)).toEqual(['shared-dep@1.0.0'])
    // Nothing traverses through the exposed entry: its child waits for its
    // verdict rather than borrowing publicness across it.
    expect(round.assumed).toEqual([])
  })

  it('terminates on dependency cycles without assuming or exposing them', () => {
    const undecided = [
      entry('a', '1.0.0', 'sha512-aaa'),
      entry('b', '1.0.0', 'sha512-bbb'),
    ]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({ 'a@1.0.0': ['b@1.0.0'], 'b@1.0.0': ['a@1.0.0'] }),
    ))
    // A cycle unreachable from any root or public parent stays entirely
    // unplanned; the caller's last resort queries whatever remains.
    expect(round.assumed).toEqual([])
    expect(round.frontier).toEqual([])
    expect(round.stallBreakers).toEqual([])
  })

  it('marks a cycle entry point a public parent reaches as a stall breaker', () => {
    // Cycle members always have an undecided parent (each other), so they
    // are never assumed. The member a proven-public parent reaches is the
    // minimal query that breaks the stall — its verdict unlocks the rest
    // of the cycle (and its descendants) for later rounds, without
    // transmitting their names.
    const undecided = [
      entry('a', '1.0.0', 'sha512-aaa'),
      entry('b', '1.0.0', 'sha512-bbb'),
    ]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({ 'seed@1.0.0': ['a@1.0.0'], 'a@1.0.0': ['b@1.0.0'], 'b@1.0.0': ['a@1.0.0'] }),
      {
        publicKeys: ['seed@1.0.0'],
      },
    ))
    expect(round.assumed).toEqual([])
    expect(round.frontier).toEqual([])
    expect(keys(round.stallBreakers)).toEqual(['a@1.0.0'])
  })

  it('never assumes a version of a name while another version is unresolved', () => {
    // Divergent versions of one name are weak fork evidence, and the
    // sibling's verdict may prove the name private — both versions are
    // stall breakers, verified together via one packument. The set is
    // run-wide (the materializer seeds it across detection groups), so
    // the guard holds even when the sibling lives in another group.
    const undecided = [
      entry('foo', '1.0.0', 'sha512-aaa'),
      entry('foo', '2.0.0', 'sha512-bbb'),
    ]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({ 'pub-a@1.0.0': ['foo@1.0.0'], 'pub-b@1.0.0': ['foo@2.0.0'] }),
      {
        publicKeys: ['pub-a@1.0.0', 'pub-b@1.0.0'],
        multiUndecidedNames: ['foo'],
      },
    ))
    expect(round.assumed).toEqual([])
    expect(keys(round.stallBreakers)).toEqual(['foo@1.0.0', 'foo@2.0.0'])
  })

  it('never assumes a version of a name with known private versions', () => {
    // The user pinned foo@1.0.0 as private; foo@3.0.0 under a public
    // parent must be verified, not assumed — a name with private
    // versions is exactly where a fork of a public name lives.
    const undecided = [entry('foo', '3.0.0', 'sha512-aaa')]
    const round = planPropagationRound(undecided, contextOf(
      graphOf({ 'pub@1.0.0': ['foo@3.0.0'] }),
      {
        publicKeys: ['pub@1.0.0'],
        privateNames: ['foo'],
      },
    ))
    expect(round.assumed).toEqual([])
    expect(keys(round.frontier)).toEqual(['foo@3.0.0'])
  })
})
