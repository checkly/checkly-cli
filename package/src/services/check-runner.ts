import { checks as checksApi, assets } from '../rest/api'
import { SocketClient } from './socket-client'
import * as uuid from 'uuid'
import PQueue from 'p-queue'
import { EventEmitter, once } from 'node:events'

export enum Events {
  CHECK_REGISTERED = 'CHECK_REGISTERED',
  CHECK_INPROGRESS = 'CHECK_INPROGRESS',
  CHECK_FAILED = 'CHECK_FAILED',
  CHECK_SUCCESSFUL = 'CHECK_SUCCESSFUL',
  CHECK_FINISHED = 'CHECK_FINISHED',
  RUN_STARTED = 'RUN_STARTED',
  RUN_FINISHED = 'RUN_FINISHED'
}
export default class CheckRunner extends EventEmitter {
  checks: any[]
  location: string
  concurrency: number
  constructor (checks: any[], location: string, concurrency = 5) {
    super()
    this.checks = checks
    this.location = location
    this.concurrency = concurrency
  }

  async run () {
    this.emit(Events.RUN_STARTED)
    const socketClient = await SocketClient.connect()
    // TODO: Remove the queue and run all checks in parallel?
    const queue = new PQueue({ concurrency: this.concurrency })
    for (const check of this.checks) {
      const websocketClientId = uuid.v4()
      const checkRun = {
        runLocation: this.location,
        websocketClientId,
        ...check,
      }
      this.emit(Events.CHECK_REGISTERED, checkRun)
      queue.add(async () => {
        // Configure the listener before triggering the check run
        const checkEventEmitter = await this.configureResultListener(websocketClientId, check, socketClient)
        try {
          await checksApi.run(checkRun)
        } catch (err: any) {
          if (err?.response?.status === 402) {
            const errorMessage = `Failed to run a check. ${err.response.data.message}`
            this.emit(Events.CHECK_FAILED, checkRun, new Error(errorMessage))
            this.emit(Events.CHECK_FINISHED, check)
            // TODO: Find a way to abort. The latest version supports this but doesn't work with TS
            return
          }
          this.emit(Events.CHECK_FAILED, checkRun, err)
          this.emit(Events.CHECK_FINISHED, check)
        }
        await once(checkEventEmitter, 'finished')
      })
    }
    await queue.onIdle()
    await socketClient.end()
    this.emit(Events.RUN_FINISHED)
  }

  async configureResultListener (
    websocketClientId: string,
    check: any,
    socketClient: SocketClient,
  ): Promise<EventEmitter> {
    const baseTopic = `${check.checkType.toLowerCase()}-check-results/${websocketClientId}`
    const runStartTopic = `${baseTopic}/run-start`
    const runEndTopic = `${baseTopic}/run-end`
    const runErrorTopic = `${baseTopic}/error`

    const checkEventEmitter = new EventEmitter()
    await socketClient.subscribe({
      [runStartTopic]: () => {
        this.emit(Events.CHECK_INPROGRESS, check)
      },
      [runEndTopic]: async (message: any) => {
        const { result } = message
        const { region, logPath, checkRunDataPath } = result.assets
        if (result.hasFailures && logPath) {
          result.logs = await assets.getLogs(region, logPath)
        }
        if (result.hasFailures && result.checkType === 'API') {
          result.checkRunData = await assets.getCheckRunData(region, checkRunDataPath)
        }
        await socketClient.unsubscribe([runStartTopic, runEndTopic, runErrorTopic])
        this.emit(Events.CHECK_SUCCESSFUL, check, result)
        this.emit(Events.CHECK_FINISHED, check)
        checkEventEmitter.emit('finished')
      },
      [runErrorTopic]: async (message: any) => {
        await socketClient.unsubscribe([runStartTopic, runEndTopic, runErrorTopic])
        this.emit(Events.CHECK_FAILED, check, message)
        this.emit(Events.CHECK_FINISHED, check)
        checkEventEmitter.emit('finished')
      },
    })
    return checkEventEmitter
  }
}
