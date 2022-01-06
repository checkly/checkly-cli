const chalk = require('chalk')
const consola = require('consola')
const { v4: uuidv4 } = require('uuid')

const { checks, sockets } = require('../../services/api')
const SocketClient = require('../../services/socket-client.js')

async function browserCheck ({ check, location }) {
  try {
  // Setup Websocket IoT Core Connection
    const presignedIotUrl = await sockets.getSignedUrl()
    consola.debug(`IoT Signed Url: ${presignedIotUrl.data.url}\n`)

    // Connect to our IoT Core Signed URL
    const socketClientId = uuidv4()
    const socketClient = new SocketClient()
    await socketClient.connect(presignedIotUrl.data.url)

    // Setup event handlers for various message types
    socketClient.onMessageReceived((topic, message) => {
      const type = topic.split('/')[2]
      switch (type) {
        case 'run-start':
          consola.debug('run-start', message)
          consola.info(' Browser check run started..')
          break
        case 'run-end':
          consola.debug('run-end', message)
          consola.info(' Check run complete')

          // Print duration in milliseconds
          consola.success(
            ` Run duration ${chalk.bold.blue(
              new Date(message.result.endTime).getTime() -
                new Date(message.result.startTime).getTime()
            )}ms`
          )
          break
        case 'error':
          consola.debug('error', message)
          consola.error(' Check run error', message)
          break
        case 'screenshot-uploads':
          consola.debug('screenshot-uploads', message)
          consola.info(' Screenshots:')

          // Print screenshot URLs of each taken screenshot
          message.files.forEach((file, index) => {
            console.log(` [${chalk.bold.blue(index + 1)}]`, file.url)
          })
          consola.log()
          break
        case 'logfile':
          consola.debug('logfile', message)
          consola.log('')
          consola.info(' Console Log:')
          message.file.forEach((msg, index) => {
            consola.log({
              tag: msg.level.toUpperCase(),
              message: ` [${chalk.bold.blue(index + 1)}] ${msg.msg}`,
              time: msg.time,
              badge: false
            })
          })

          // Logfiles are sent last, so we can close the socket and exit at this point
          socketClient.end()
          process.exit(0)
      }
    })

    // Subscribe to the 'browser-check-run' topic with this clients socketId
    socketClient.subscribe(`browser-check-results/${socketClientId}/#`)

    const browserCheck = {
      ...check,
      websocketClientId: socketClientId,
      runLocation: location
    }

    const results = await checks.run(browserCheck)

    if (results.status === 202) {
      consola.info('Check successfully submitted')
    } else {
      consola.error('Error submitting check', results)
    }
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = browserCheck
