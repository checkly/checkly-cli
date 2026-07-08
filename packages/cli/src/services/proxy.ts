import type { AxiosRequestConfig, CreateAxiosDefaults } from 'axios'
import type { Agent } from 'node:http'

import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
// @ts-ignore proxy-from-env ships no type declarations
import { getProxyForUrl } from 'proxy-from-env'

// WebSocket URLs are not understood by proxy-from-env, so map them to their
// HTTP equivalents (which share the same HTTP_PROXY/HTTPS_PROXY rules) for
// proxy selection.
function toHttpUrl (url: string): string {
  if (url.startsWith('wss:')) {
    return `https:${url.slice(4)}`
  }
  if (url.startsWith('ws:')) {
    return `http:${url.slice(3)}`
  }
  return url
}

/**
 * Returns the proxy URL that applies to `targetUrl` based on the standard proxy
 * environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`,
 * and their lowercase variants), or `undefined` when the connection should be
 * made directly.
 */
export function getProxyUrl (targetUrl: string): string | undefined {
  return getProxyForUrl(toHttpUrl(targetUrl)) || undefined
}

/**
 * Returns a proxy agent for connecting to `targetUrl` based on the standard
 * proxy environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`,
 * `NO_PROXY`, and their lowercase variants), or `undefined` when no proxy
 * applies and the connection should be made directly.
 *
 * `http(s)://` proxies are tunneled via the agent matching the target's scheme;
 * `socks://`, `socks4://`, and `socks5://` proxies use the SOCKS agent (which
 * handles both HTTP and HTTPS targets).
 */
export function createProxyAgent (targetUrl: string): Agent | undefined {
  const proxyUrl = getProxyUrl(targetUrl)
  if (!proxyUrl) {
    return undefined
  }

  if (new URL(proxyUrl).protocol.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl)
  }

  return new URL(toHttpUrl(targetUrl)).protocol === 'https:'
    ? new HttpsProxyAgent(proxyUrl)
    : new HttpProxyAgent(proxyUrl)
}

/**
 * Installs a proxy agent on an axios config for requests to `targetUrl` and
 * disables axios's own proxy handling.
 *
 * `proxy: false` is mandatory: without it, axios re-reads the proxy environment
 * variables itself and rewrites the request, appending the proxy's port to
 * portless target URLs (e.g. `https://api.checklyhq.com` becomes
 * `https://api.checklyhq.com:8080`). Letting the agent own all proxy behavior
 * keeps the target URL intact. When no proxy applies the agent is omitted and
 * the request connects directly.
 */
export function assignProxy<T extends CreateAxiosDefaults | AxiosRequestConfig> (targetUrl: string, axiosConfig: T): T {
  const agent = createProxyAgent(targetUrl)
  if (agent) {
    axiosConfig.httpAgent = agent
    axiosConfig.httpsAgent = agent
  }
  axiosConfig.proxy = false
  return axiosConfig
}
