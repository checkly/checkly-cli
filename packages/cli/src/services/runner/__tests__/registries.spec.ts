import { describe, it, expect } from 'vitest'

import { Registries, serializeRegistries, validateRegistries } from '../registries.js'

const validRegistries = (): Registries => ({
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

describe('validateRegistries()', () => {
  it('accepts a valid configuration', () => {
    const value = validRegistries()
    expect(validateRegistries(value)).toBe(value)
  })

  it('rejects a non-object value', () => {
    expect(() => validateRegistries('nope')).toThrow('must be an object')
    expect(() => validateRegistries(null)).toThrow('must be an object')
    expect(() => validateRegistries([])).toThrow('must be an object')
  })

  it('rejects a missing or non-object upstreams field', () => {
    expect(() => validateRegistries({ packages: [] }))
      .toThrow(`'upstreams' must be an object mapping upstream names to { url, auth? }`)
    expect(() => validateRegistries({ upstreams: [], packages: [] }))
      .toThrow(`'upstreams' must be an object mapping upstream names to { url, auth? }`)
  })

  it('rejects an empty upstreams object', () => {
    expect(() => validateRegistries({ upstreams: {}, packages: [] }))
      .toThrow(`'upstreams' must define at least one upstream`)
  })

  it('rejects a non-object upstream', () => {
    const value = { ...validRegistries(), upstreams: { npmjs: 'https://registry.npmjs.org/' } }
    expect(() => validateRegistries(value)).toThrow(`upstream 'npmjs' must be an object with a 'url'`)
  })

  it('rejects an upstream url that is not a string', () => {
    const value = validRegistries()
    ;(value.upstreams.npmjs as any).url = 42
    expect(() => validateRegistries(value))
      .toThrow(`upstream 'npmjs': 'url' must be an absolute http or https URL with a host`)
  })

  it('rejects an upstream url with a query without echoing the url', () => {
    const value = validRegistries()
    value.upstreams.npmjs.url = 'https://registry.npmjs.org/?token=abc'
    expect(() => validateRegistries(value)).toThrow(/carrying no query or fragment/)
    expect(() => validateRegistries(value)).not.toThrow(/token=abc/)
  })

  it('rejects a non-http(s) upstream url', () => {
    const value = validRegistries()
    value.upstreams.npmjs.url = 'ftp://registry.npmjs.org/'
    expect(() => validateRegistries(value))
      .toThrow(`upstream 'npmjs': 'url' must be an absolute http or https URL with a host`)
  })

  it('rejects an upstream url with inline credentials without echoing the url', () => {
    const value = validRegistries()
    value.upstreams.npmjs.url = 'https://ci-user:s3cret-token@npm.example.com/'
    expect(() => validateRegistries(value)).toThrow(
      `upstream 'npmjs': 'url' must not contain credentials; use auth: { type: 'bearer', token: '\${VAR}' } instead`,
    )
    expect(() => validateRegistries(value)).not.toThrow(/s3cret-token/)
  })

  it('rejects an upstream name that is not a plain label', () => {
    const value = validRegistries()
    ;(value.upstreams as Record<string, unknown>)['bad name!'] = { url: 'https://npm.example.com/' }
    expect(() => validateRegistries(value)).toThrow(`upstream name 'bad name!' is invalid`)
  })

  it('rejects a computed __proto__ upstream name', () => {
    const value = validRegistries()
    Object.defineProperty(value.upstreams, '__proto__', {
      value: { url: 'https://npm.example.com/' },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    expect(() => validateRegistries(value)).toThrow(`upstream name '__proto__' is invalid`)
  })

  it('rejects unknown fields at every level', () => {
    const top = { ...validRegistries(), extra: true }
    expect(() => validateRegistries(top))
      .toThrow(`'runner.registries': unknown field 'extra' (expected only: 'upstreams', 'packages')`)

    const upstream = validRegistries()
    ;(upstream.upstreams.internal as any).authh = { type: 'bearer', token: '${T}' }
    expect(() => validateRegistries(upstream))
      .toThrow(`upstream 'internal': unknown field 'authh' (expected only: 'url', 'auth')`)

    const auth = validRegistries()
    ;(auth.upstreams.internal.auth as any).tokenEnv = 'T'
    expect(() => validateRegistries(auth))
      .toThrow(`upstream 'internal': 'auth': unknown field 'tokenEnv' (expected only: 'type', 'token')`)

    const rule = validRegistries()
    ;(rule.packages[0] as any).fallthrough = true
    expect(() => validateRegistries(rule))
      .toThrow(`packages[0]: unknown field 'fallthrough' (expected only: 'pattern', 'upstreams')`)
  })

  it('rejects a non-object auth', () => {
    const value = validRegistries()
    ;(value.upstreams.internal as any).auth = 'token'
    expect(() => validateRegistries(value)).toThrow(`upstream 'internal': 'auth' must be an object if set`)
  })

  it('rejects an unknown auth type', () => {
    const value = validRegistries()
    ;(value.upstreams.internal.auth as any).type = 'basic'
    expect(() => validateRegistries(value)).toThrow(`upstream 'internal': 'auth.type' must be 'bearer'`)
  })

  it('rejects an empty or non-string auth token', () => {
    const value = validRegistries()
    value.upstreams.internal.auth!.token = ''
    expect(() => validateRegistries(value))
      .toThrow(/must be exactly one environment variable reference in \$\{VAR\} syntax/)
    ;(value.upstreams.internal.auth as any).token = 42
    expect(() => validateRegistries(value))
      .toThrow(/must be exactly one environment variable reference in \$\{VAR\} syntax/)
  })

  it('rejects a literal auth token without a ${VAR} reference', () => {
    const value = validRegistries()
    value.upstreams.internal.auth!.token = 'npm_sEcReTsEcReT'
    expect(() => validateRegistries(value))
      .toThrow(/must be exactly one environment variable reference in \$\{VAR\} syntax/)
    expect(() => validateRegistries(value)).not.toThrow(/npm_sEcReTsEcReT/)
  })

  it('rejects a token that mixes a ${VAR} reference with literal text', () => {
    const value = validRegistries()
    value.upstreams.internal.auth!.token = 'prefix-${INTERNAL_NPM_TOKEN}'
    expect(() => validateRegistries(value))
      .toThrow(/must be exactly one environment variable reference in \$\{VAR\} syntax/)
  })

  it('rejects a reference that cannot name an environment variable', () => {
    const value = validRegistries()
    value.upstreams.internal.auth!.token = '${ }'
    expect(() => validateRegistries(value))
      .toThrow(/must be exactly one environment variable reference in \$\{VAR\} syntax/)
  })

  it('rejects a missing or non-array packages field', () => {
    const { upstreams } = validRegistries()
    expect(() => validateRegistries({ upstreams }))
      .toThrow(`'packages' must be an array of { pattern, upstreams } routing rules`)
    expect(() => validateRegistries({ upstreams, packages: {} }))
      .toThrow(`'packages' must be an array of { pattern, upstreams } routing rules`)
  })

  it('rejects an empty packages array', () => {
    const { upstreams } = validRegistries()
    expect(() => validateRegistries({ upstreams, packages: [] }))
      .toThrow(`'packages' must end with a match-all rule ({ pattern: '**', ... }) so that every package has a route`)
  })

  it('rejects a non-object routing rule', () => {
    const value = validRegistries()
    ;(value.packages as any)[0] = '@acme/**'
    expect(() => validateRegistries(value))
      .toThrow(`packages[0] must be an object with 'pattern' and 'upstreams'`)
  })

  it('rejects a non-string pattern', () => {
    const value = validRegistries()
    ;(value.packages[0] as any).pattern = 42
    expect(() => validateRegistries(value)).toThrow(`packages[0]: 'pattern' must be a string`)
  })

  it('rejects an invalid package name pattern, naming the rule', () => {
    const value = validRegistries()
    value.packages[0].pattern = '_leading-underscore'
    expect(() => validateRegistries(value))
      .toThrow(`packages[0]: Invalid package name pattern '_leading-underscore': `
        + `'_leading-underscore' is not a valid npm package name`)
  })

  it('rejects an embed-style version pin', () => {
    const value = validRegistries()
    value.packages[0].pattern = 'left-pad@1.3.0'
    expect(() => validateRegistries(value))
      .toThrow(`packages[0]: Invalid package name pattern 'left-pad@1.3.0': `
        + `'name@version' pins are not supported here`)
  })

  it('rejects an exclusion pattern', () => {
    const value = validRegistries()
    value.packages[0].pattern = '!@acme/foo'
    expect(() => validateRegistries(value))
      .toThrow(`packages[0]: exclusion patterns ('!') are not supported in routing rules`)
  })

  it('rejects a rule with no upstreams', () => {
    const value = validRegistries()
    value.packages[0].upstreams = []
    expect(() => validateRegistries(value))
      .toThrow(`packages[0]: 'upstreams' must be a non-empty array of upstream names`)
  })

  it('rejects an upstream name that is not defined', () => {
    const value = validRegistries()
    value.packages[0].upstreams = ['internal', 'mirror']
    expect(() => validateRegistries(value))
      .toThrow(`packages[0]: upstream 'mirror' is not defined under 'upstreams' (defined: 'npmjs', 'internal')`)
  })

  it('rejects a configuration without a match-all rule', () => {
    const value = validRegistries()
    value.packages = [{ pattern: '@acme/**', upstreams: ['internal'] }]
    expect(() => validateRegistries(value))
      .toThrow(`'packages' must end with a match-all rule ({ pattern: '**', ... }) so that every package has a route`)
  })

  it('rejects rules placed after the match-all rule', () => {
    const value = validRegistries()
    value.packages = [
      { pattern: '**', upstreams: ['npmjs'] },
      { pattern: '@acme/**', upstreams: ['internal'] },
    ]
    expect(() => validateRegistries(value))
      .toThrow(`packages[0]: rules after a '**' match-all rule can never apply (the first matching rule wins); `
        + `move the match-all rule last`)
  })

  it('does not treat a wildcard pattern that merely matches everything as match-all', () => {
    const value = validRegistries()
    value.packages = [{ pattern: '***', upstreams: ['npmjs'] }]
    expect(() => validateRegistries(value))
      .toThrow(`'packages' must end with a match-all rule ({ pattern: '**', ... }) so that every package has a route`)
  })
})

describe('serializeRegistries()', () => {
  it('writes version, sorted upstreams and rules in order', () => {
    const content = serializeRegistries(validRegistries())
    expect(content.endsWith('\n')).toBe(true)
    expect(JSON.parse(content)).toEqual({
      version: 1,
      upstreams: {
        internal: {
          url: 'https://npm.example.com/',
          auth: { type: 'bearer', token: '${INTERNAL_NPM_TOKEN}' },
        },
        npmjs: { url: 'https://registry.npmjs.org/' },
      },
      packages: [
        { pattern: '@acme/**', upstreams: ['internal'] },
        { pattern: '**', upstreams: ['npmjs', 'internal'] },
      ],
    })
    expect(Object.keys(JSON.parse(content).upstreams)).toEqual(['internal', 'npmjs'])
  })

  it('produces identical output regardless of upstream declaration order', () => {
    const reordered: Registries = {
      upstreams: {
        internal: {
          url: 'https://npm.example.com/',
          auth: { type: 'bearer', token: '${INTERNAL_NPM_TOKEN}' },
        },
        npmjs: { url: 'https://registry.npmjs.org/' },
      },
      packages: validRegistries().packages,
    }
    expect(serializeRegistries(reordered)).toBe(serializeRegistries(validRegistries()))
  })

  it('normalizes upstream urls to end with a trailing slash', () => {
    const value = validRegistries()
    value.upstreams.internal.auth = undefined
    value.upstreams.internal.url = 'https://npm.example.com/repository/npm-group'
    const parsed = JSON.parse(serializeRegistries(value))
    expect(parsed.upstreams.internal).toEqual({ url: 'https://npm.example.com/repository/npm-group/' })
  })

  it('drops fields outside the schema', () => {
    const value = validRegistries()
    ;(value.upstreams.npmjs as any).extra = 'junk'
    ;(value.upstreams.internal.auth as any).extra = 'junk'
    ;(value.packages[0] as any).extra = 'junk'
    ;(value as any).extra = 'junk'
    expect(serializeRegistries(value)).not.toContain('junk')
  })
})
