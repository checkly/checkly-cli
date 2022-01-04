const chalk = require('chalk')
const consola = require('consola')
const { v4: uuidv4 } = require('uuid')
const search = require('cli-fuzzy-search')
const { Command, flags } = require('@oclif/command')

const parser = require('../parser')
const { checks, socket } = require('../services/api')
const SocketClient = require('../services/socket-client.js')

class RunCommand extends Command {
  static args = [{
    name: 'checkPath',
    required: false,
    description: 'Which check would you like to execute?'
  }]

  async run () {
    try {
      const { args, flags } = this.parse(RunCommand)

      // Setup Websocket IoT Core Connection
      const presignedIotUrl = await socket.getSignedUrl()
      consola.debug(` IoT Signed Url: ${presignedIotUrl.data.url}\n`)

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

      const { checks: parsedChecks } = await parser()
      let selectedCheck = ''
      if (args.checkPath) {
        selectedCheck = Object.entries(parsedChecks).find(
          ([name, check]) => name === args.checkPath
        )
      } else {
        consola.info(
          ' No check name passed, please search to make a selection below.\n'
        )
        selectedCheck = await search({
          data: Object.entries(parsedChecks).map(([name, check]) => {
            return { ...check, label: name }
          }),
          size: Object.entries(parsedChecks).length + 1,
          cache: false,
          debounceDelay: 200
        })
      }

      if (!selectedCheck) {
        consola.error(' No check found with that name, please try again.')
        process.exit(1)
      }

      // Build check payload object
      const browserCheck = {
        ...selectedCheck,
        websocketClientId: socketClientId,
        runLocation: flags.location
      }

      // Submit check to API
      const results = await checks.run(browserCheck)

      if (results.status === 202) {
        consola.info(' Check successfully submitted')
      } else {
        consola.error(' Error submitting check', results)
      }
    } catch (err) {
      consola.error(err)
      throw err
    }
  }
}

RunCommand.flags = {
  location: flags.string({
    char: 'l',
    description: 'Where should the check run at?',
    default: 'eu-central-1'
  })
}

RunCommand.description = 'Run and test your checks on Checkly'

module.exports = RunCommand
