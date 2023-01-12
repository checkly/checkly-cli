import * as mqtt from 'async-mqtt'
import { sockets } from '../rest/api'

export class SocketClient {
  client: mqtt.AsyncClient
  handlers: Record<string, (message: any) => Promise<void>|void> = {}

  constructor (client: mqtt.AsyncClient) {
    this.client = client
    const handlers = this.handlers
    client.on('message', async (topic: string, message: string|Buffer) => {
      const handler = handlers[topic]
      if (!handler) return
      await handler(JSON.parse(message.toString('utf8')))
    })
  }

  static async connect () {
    const url = await sockets.getPresignedUrl()
    const client = await mqtt.connectAsync(url)
    return new SocketClient(client)
  }

  /**
  * Subscribe to topics on the socket.
  * Due to implementation details, wildcards aren't supported.
  * Note that AWS has a limit of 8 topics per subscribe request.
  */
  async subscribe (topicHandlers: Record<string, (message: any) => Promise<void>|void>): Promise<void> {
    for (const [topic, handler] of Object.entries(topicHandlers)) {
      this.handlers[topic] = handler
    }
    await this.client.subscribe(Object.keys(topicHandlers))
  }

  async unsubscribe (topics: string[]): Promise<void> {
    await this.client.unsubscribe(topics)
    topics.forEach((topic) => delete this.handlers[topic])
  }

  async end (): Promise<void> {
    await this.client.end()
  }
}
