import * as http from 'node:http'
import type { AddressInfo } from 'node:net'

import axios from 'axios'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { assignProxy, createProxyAgent } from '../proxy.js'

const proxyVars = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY', 'all_proxy', 'ALL_PROXY']
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of proxyVars) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of proxyVars) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

describe('createProxyAgent', () => {
  it('returns undefined when no proxy applies', () => {
    expect(createProxyAgent('https://api.checklyhq.com')).toBeUndefined()
  })

  it('returns undefined when the target is excluded via NO_PROXY', () => {
    process.env.https_proxy = 'http://localhost:8080'
    process.env.no_proxy = '.checklyhq.com'
    expect(createProxyAgent('https://api.checklyhq.com')).toBeUndefined()
  })

  it('selects an HTTPS agent for https targets', () => {
    process.env.https_proxy = 'http://localhost:8080'
    expect(createProxyAgent('https://api.checklyhq.com')).toBeInstanceOf(HttpsProxyAgent)
  })

  it('selects an HTTP agent for http targets', () => {
    process.env.http_proxy = 'http://localhost:8080'
    expect(createProxyAgent('http://api.checklyhq.com')).toBeInstanceOf(HttpProxyAgent)
  })

  it('selects a SOCKS agent for socks proxies', () => {
    process.env.all_proxy = 'socks5://localhost:1080'
    expect(createProxyAgent('https://api.checklyhq.com')).toBeInstanceOf(SocksProxyAgent)
  })

  it('treats wss targets as https for proxy selection', () => {
    process.env.https_proxy = 'http://localhost:8080'
    expect(createProxyAgent('wss://stream.checklyhq.com')).toBeInstanceOf(HttpsProxyAgent)
  })
})

describe('assignProxy', () => {
  it('always disables axios\'s built-in proxy handling', () => {
    // Without `proxy: false`, axios re-reads the proxy env vars and appends the
    // proxy port to portless target URLs. This guards that regression.
    expect(assignProxy('https://api.checklyhq.com', {}).proxy).toBe(false)
  })

  it('installs the same agent for HTTP and HTTPS when a proxy applies', () => {
    process.env.https_proxy = 'http://localhost:8080'
    const config = assignProxy('https://api.checklyhq.com', {})
    expect(config.httpAgent).toBeInstanceOf(HttpsProxyAgent)
    expect(config.httpAgent).toBe(config.httpsAgent)
  })

  it('omits the agent when no proxy applies', () => {
    const config = assignProxy('https://api.checklyhq.com', {})
    expect(config.httpAgent).toBeUndefined()
    expect(config.httpsAgent).toBeUndefined()
  })

  it('preserves caller-supplied fields', () => {
    const config = assignProxy('https://api.checklyhq.com', { baseURL: 'https://api.checklyhq.com', responseType: 'stream' })
    expect(config.baseURL).toBe('https://api.checklyhq.com')
    expect(config.responseType).toBe('stream')
  })
})

describe('proxy routing', () => {
  let proxy: http.Server
  let proxyUrl: string
  let received: { url?: string, host?: string }

  beforeEach(async () => {
    received = {}
    proxy = http.createServer((req, res) => {
      received.url = req.url
      received.host = req.headers.host
      res.statusCode = 200
      res.end('ok')
    })
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
    const { port } = proxy.address() as AddressInfo
    proxyUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise<void>(resolve => proxy.close(() => resolve()))
  })

  it('routes through the proxy without appending the proxy port to the target host', async () => {
    process.env.http_proxy = proxyUrl

    await axios.get('http://example-target.test/path', assignProxy('http://example-target.test/path', {}))

    // The agent forwards the original target to the proxy. The Host header must
    // remain the portless target, not gain the proxy's port.
    expect(received.host).toBe('example-target.test')
    expect(received.url).toBe('http://example-target.test/path')
  })

  it('connects directly when no proxy env is set', async () => {
    const direct = `${proxyUrl.replace('127.0.0.1', 'localhost')}/direct`
    await expect(axios.get(direct, assignProxy(direct, { timeout: 2000 }))).resolves.toMatchObject({ status: 200 })
    expect(received.url).toBe('/direct')
  })
})
