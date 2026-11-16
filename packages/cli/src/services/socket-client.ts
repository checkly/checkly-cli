import * as mqtt from 'mqtt'
import config from '../services/config.js'
import { createProxyAgent } from '../services/proxy.js'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Node rejects a connection to a host with several addresses (e.g. IPv6 and
// IPv4 for localhost) with an AggregateError whose own message is empty; the
// reason is only in the per-address errors it carries.
function describeError (err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err)
  }
  if (err.message) {
    return err.message
  }
  if (err instanceof AggregateError) {
    const messages = err.errors.map(describeError).filter(Boolean)
    if (messages.length) {
      return messages.join('; ')
    }
  }
  const { code } = err as { code?: unknown }
  return typeof code === 'string' || typeof code === 'number' ? `${err.name} (${code})` : err.name
}

/**
 * Error thrown when the connection that streams check results cannot be established.
 */
export class MqttConnectionError extends Error {
  constructor (options: ErrorOptions) {
    super(
      `Could not connect to Checkly to receive check results. Please check that `
      + `the internet connection is working.`
      + `\n\n`
      + `Details: ${describeError(options.cause)}`,
      options,
    )
    this.name = 'MqttConnectionError'
  }
}

async function backOffConnect (url: string, options: mqtt.IClientOptions, retryCount = 0):
Promise<mqtt.MqttClient> {
  try {
    return await mqtt.connectAsync(url, options, false)
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
  static async connect (): Promise<mqtt.MqttClient> {
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

    try {
      return await backOffConnect(`${url}?authenticationScheme=userApiKey`, options, 0)
    } catch (err) {
      throw new MqttConnectionError({ cause: err })
    }
  }
}
