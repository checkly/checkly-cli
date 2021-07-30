const consola = require('consola')
const YAML = require('yaml')
const { v4: uuidv4 } = require('uuid')
const { checks, socket } = require('../../services/api')
const SocketClient = require('../../services/socket-client.js')

async function runCheck(checkName = '') {
  try {
    // Setup Websocket IoT Core Connection
    const presignedIotUrl = await socket.getSignedUrl()
    consola.debug(` IoT Signed Url: ${presignedIotUrl.data.url}\n`)

    // Subscribe to our IoT Core Signed URL
    const socketClientId = uuidv4()
    const socketClient = new SocketClient()
    await socketClient.connect(presignedIotUrl.data.url)
    socketClient.onMessageReceived((topic, message) => {
      const type = topic.split('/')[2]
      switch (type) {
        case 'run-start':
          consola.info('run-start', message)
          // this.checkRun.type = message.type
          // this.checkRun.state = browserCheckRunStates.RUNNING
          break
        case 'run-end':
          consola.info('run-end', message)
          // this.checkRun.state = browserCheckRunStates.ENDED
          // this.checkRun.results = Object.assign(
          //   this.checkRun.results,
          //   message.result
          // )
          break
        case 'error':
          consola.info('error', message)
          // this.checkRun.hasErrors = true
          break
        case 'screenshot-uploads':
          consola.info('screenshot-uploads', message)
          // this.checkRun.uploads = message.files
          break
        case 'logfile':
          consola.info('logfile', message)
        // this.checkRun.logFile = message.file
      }
    })

    socketClient.subscribe(`browser-check-results/${socketClientId}/#`)

    // Get requeste check from local yml file (by checkName)
    const rawChecks = await checks.getAllLocal()
    const parsedChecks = rawChecks.map((rawCheck) => YAML.parse(rawCheck))
    const selectedCheck = parsedChecks.filter(
      (check) => check.name === checkName
    )

    // Build check payload object
    const browserCheck = {
      ...selectedCheck[0],
      _id: 'c0aa8396-d330-4f36-81e4-f80be035753d',
      websocketClientId: socketClientId,
      runLocation: 'eu-central-1',
      runtimeId: '2020.01',
    }

    // consola.debug(JSON.stringify(browserCheck, null, 2))

    // Submit check to API
    const results = await checks.run(browserCheck)

    if (results.status === 202) {
      consola.success(' Check successfully submitted\n')
    }
  } catch (err) {
    consola.error(err)
  }
}

module.exports = runCheck
