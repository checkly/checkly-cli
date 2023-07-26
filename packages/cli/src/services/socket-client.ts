import * as mqtt from 'async-mqtt'
import config from '../services/config'
// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { httpsOverHttp, httpsOverHttps } from 'tunnel'

const isHttps = (protocol: string) => protocol.startsWith('https')
export class SocketClient {
  static connect (): Promise<mqtt.AsyncMqttClient> {
    const url = config.getMqttUrl()
    const accountId = config.getAccountId()
    const apiKey = config.getApiKey()
    const options: mqtt.IClientOptions = {
      reconnectPeriod: 0,
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
        proxy.proxyAuth = `${proxyUrlEnv.username}:${proxyUrlEnv.password}`
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
    return mqtt.connectAsync(`${url}?authenticationScheme=userApiKey`, options, false)
  }
}
