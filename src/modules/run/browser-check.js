const consola = require('consola')
const { v4: uuidv4 } = require('uuid')

const { checks, sockets, assets } = require('../../services/api')
const SocketClient = require('../../services/socket-client.js')

async function browserCheck ({ check, location }) {
  // Setup Websocket IoT Core Connection
  const presignedIotUrl = await sockets.getSignedUrl()

  // Connect to our IoT Core SiWgned URL
  const socketClientId = uuidv4()
  const socketClient = new SocketClient()
  await socketClient.connect(presignedIotUrl.data.url)
  return new Promise((resolve, reject) => {
    // Setup event handlers for various message types
    socketClient.onMessageReceived(async (topic, message) => {
      const type = topic.split('/')[2]
      switch (type) {
        case 'run-start':
          consola.debug('run-start', message)
          break
        case 'run-end': {
          consola.debug('run-end', message)
          const {
            result: {
              assets: {
                region,
                logPath,
              },
            },
          } = message
          const { data: logs } = await assets.get('log', region, logPath)
          resolve({
            ...message.result,
            logs,
          })
          break
        }
        case 'error':
          consola.debug('error', message)
          socketClient.end()
          reject(message)
          break
      }
    })

    // Subscribe to the 'browser-check-run' topic with this clients socketId
    socketClient.subscribe(`browser-check-results/${socketClientId}/#`)
    // TODO: We should eventually unsubscribe

    const browserCheck = {
      ...check,
      websocketClientId: socketClientId,
      runLocation: location,
      // Joi doesn't allow the reference syntax for groups.
      // TODO: Come up with a more appropriate fix for this.
      groupId: null,
    }

    checks.run(browserCheck).then(results => {
      if (results.status !== 202) {
        socketClient.end()
        resolve()
      }
    }).catch(err => {
      socketClient.end()
      resolve(err)
    })
  })
}

module.exports = browserCheck
