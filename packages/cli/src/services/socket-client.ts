import * as mqtt from 'mqtt'
import config from '../services/config'
// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { httpsOverHttp, httpsOverHttps } from 'tunnel'

const isHttps = (protocol: string) => protocol.startsWith('https')

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function backOffConnect (url: string, options: mqtt.IClientOptions, retryCount = 0):
Promise<mqtt.MqttClient> {
  try {
    return mqtt.connectAsync(url, options, false)
  } catch (error) {
    if (retryCount > 3) {
      throw error
    }
    retryCount += 1
    await wait(100 * retryCount)
    return backOffConnect(url, options, retryCount)
  }
}

export class SocketClient {
  static connect (): Promise<mqtt.MqttClient> {
    const url = config.getMqttUrl()
    const accountId = config.getAccountId()
    const apiKey = config.getApiKey()
    const options: mqtt.IClientOptions = {
      reconnectPeriod: 100,
      username: accountId,
      password: apiKey,
    }

    // Replace wss with https so the get proxy url thing the env path
    const proxyUrlEnv = getProxyForUrl(url.replace('wss', 'https'))
    if (proxyUrlEnv) {
      const parsedProxyUrl = new URL(proxyUrlEnv)
      const isProxyHttps = isHttps(parsedProxyUrl.protocol)
      const proxy: any = {
        host: parsedProxyUrl.hostname,
        port: parsedProxyUrl.port,
        protocol: parsedProxyUrl.protocol,
      }
      if (parsedProxyUrl.username && parsedProxyUrl.password) {
        proxy.proxyAuth = `${parsedProxyUrl.username}:${parsedProxyUrl.password}`
      }
      if (isProxyHttps) {
        options.wsOptions = {
          agent: httpsOverHttps({ proxy }),
        }
      } else {
        options.wsOptions = {
          agent: httpsOverHttp({ proxy }),
        }
      }
    }
    return backOffConnect(`${url}?authenticationScheme=userApiKey`, options, 0)
  }
}
