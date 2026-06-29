import * as mqtt from 'mqtt'
import config from '../services/config.js'
import { createProxyAgent } from '../services/proxy.js'

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

    // Route the WebSocket upgrade through a proxy when the proxy environment
    // variables apply to this URL; otherwise connect directly.
    const agent = createProxyAgent(url)
    if (agent) {
      options.wsOptions = { agent }
    }

    return backOffConnect(`${url}?authenticationScheme=userApiKey`, options, 0)
  }
}
