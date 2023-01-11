import { checks as checksApi, assets } from '../rest/api'
import { SocketClient } from './socket-client'
import * as uuid from 'uuid'
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

type PrivateRunLocation = {
  type: 'PRIVATE',
  id: string,
  slugName: string,
}
type PublicRunLocation = {
  type: 'PUBLIC',
  region: string,
}
export type RunLocation = PublicRunLocation | PrivateRunLocation

export default class CheckRunner extends EventEmitter {
  checks: any[]
  location: RunLocation
  constructor (checks: any[], location: RunLocation) {
    super()
    this.checks = checks
    this.location = location
  }

  async run () {
    this.emit(Events.RUN_STARTED)
    const socketClient = await SocketClient.connect()
    await Promise.all(this.checks.map((check) => this.runCheck(socketClient, check)))
    await socketClient.end()
    this.emit(Events.RUN_FINISHED)
  }

  private async runCheck (socketClient: SocketClient, check: any): Promise<void> {
    const websocketClientId = uuid.v4()
    const checkRun = {
      runLocation: this.location,
      websocketClientId,
      ...check,
    }
    this.emit(Events.CHECK_REGISTERED, checkRun)
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
  }

  private async configureResultListener (
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
        if (result.hasFailures && checkRunDataPath) {
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
