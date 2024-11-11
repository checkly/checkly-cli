import * as mqtt from 'mqtt'
import config from '../services/config'
// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { httpsOverHttp, httpsOverHttps } from 'tunnel'
import type { Logger } from './logger'

const isHttps = (protocol: string) => protocol.startsWith('https')

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function backOffConnect (logger: Logger, url: string, options: mqtt.IClientOptions, retryCount = 0):
    Promise<mqtt.MqttClient> {
  const sublogger = logger.child({
    retryCount,
    url,
  })

  try {
    sublogger.info('Connecting to MQTT broker')
    return mqtt.connectAsync(url, options, false)
  } catch (err) {
    sublogger.setBindings({ err })
    sublogger.warn('Failed to connect to MQTT broker')

    if (retryCount > 3) {
      sublogger.error('Giving up further connection attempts to MQTT broker')
      throw err
    }

    const ms = 100 * retryCount
    sublogger.setBindings({ wait: ms })
    sublogger.info('Scheduling a reconnection attempt to MQTT broker')
    retryCount += 1
    await wait(ms)

    // Note: use original logger here since we'll be doing the same operation.
    return backOffConnect(logger, url, options, retryCount)
  }
}

export class SocketClient {
  static connect (logger: Logger): Promise<mqtt.MqttClient> {
    const url = config.getMqttUrl()
    const accountId = config.getAccountId()
    const apiKey = config.getApiKey()
    const options: mqtt.IClientOptions = {
      reconnectPeriod: 100,
      username: accountId,
      password: apiKey,
    }

    const sublogger = logger.child({
      url,
      username: accountId,
      password: apiKey,
    })

    // Replace wss with https so the get proxy url thing the env path
    const proxyUrlEnv = getProxyForUrl(url.replace('wss', 'https'))
    if (proxyUrlEnv) {
      sublogger.setBindings({ proxy: proxyUrlEnv })
      sublogger.info('Must use proxy for MQTT broker connection')

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
    return backOffConnect(sublogger, `${url}?authenticationScheme=userApiKey`, options, 0)
  }
}
