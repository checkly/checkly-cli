import * as mqtt from 'async-mqtt'
import config from '../services/config'

export class SocketClient {
  static connect (): Promise<mqtt.AsyncMqttClient> {
    const url = config.getMqttUrl()
    const accountId = config.getAccountId()
    const apiKey = config.getApiKey()
    const options = {
      reconnectPeriod: 0,
      username: accountId,
      password: apiKey,
    }
    return mqtt.connectAsync(`${url}?authenticationScheme=userApiKey`, options, false)
  }
}
