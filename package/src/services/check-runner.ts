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

export type PrivateRunLocation = {
  type: 'PRIVATE',
  id: string,
  slugName: string,
}
export type PublicRunLocation = {
  type: 'PUBLIC',
  region: string,
}
export type RunLocation = PublicRunLocation | PrivateRunLocation

export default class CheckRunner extends EventEmitter {
  checks: Map<string, any>
  location: RunLocation
  constructor (checks: any[], location: RunLocation) {
    super()
    this.location = location
    this.checks = new Map(
      checks.map((check) => [check.logicalId, check]),
    )
  }

  async run () {
    this.emit(Events.RUN_STARTED)

    const socketClient = await SocketClient.connect()
    const websocketClientId = uuid.v4()
    await this.configureResultListener(websocketClientId, socketClient)
    await Promise.all(Array.from(this.checks.values()).map((check) => this.scheduleCheck(websocketClientId, check)))
    await this.allChecksFinished()
    await socketClient.end()
    this.emit(Events.RUN_FINISHED)
  }

  private async scheduleCheck (websocketClientId: string, check: any): Promise<void> {
    const checkRun = {
      runLocation: this.location,
      websocketClientId,
      sourceInfo: { logicalId: check.logicalId, ephemeral: true },
      ...check,
    }
    this.emit(Events.CHECK_REGISTERED, checkRun)
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
  }

  private async configureResultListener (websocketClientId: string, socketClient: SocketClient) {
    const checks = this.checks // Assign a variable so that it's available in the arrow functions
    const checkTypes = ['browser', 'api']
    for (const checkType of checkTypes) {
      const subscriptions: any = {}
      subscriptions[`${checkType}-check-results/${websocketClientId}/run-start`] = (message: any) => {
        // Old private locations (<v1.0.6) won't pass the sourceInfo in /run-start.
        // In this case, we emit the event with check=undefined.
        const logicalId = message?.sourceInfo?.logicalId
        const check = checks.get(logicalId)
        this.emit(Events.CHECK_INPROGRESS, check)
      }
      subscriptions[`${checkType}-check-results/${websocketClientId}/run-end`] = async (message: any) => {
        const { result } = message
        const check = checks.get(result.sourceInfo.logicalId)!
        const { region, logPath, checkRunDataPath } = result.assets
        if (result.hasFailures && logPath) {
          result.logs = await assets.getLogs(region, logPath)
        }
        if (result.hasFailures && checkRunDataPath) {
          result.checkRunData = await assets.getCheckRunData(region, checkRunDataPath)
        }
        this.emit(Events.CHECK_SUCCESSFUL, check, result)
        this.emit(Events.CHECK_FINISHED, check)
      }
      subscriptions[`${checkType}-check-results/${websocketClientId}/error`] = (message: any) => {
        // Old private locations (<v1.0.6) won't pass the sourceInfo in /run-end.
        // In this case, we emit the events with check=undefined.
        const logicalId = message?.sourceInfo?.logicalId
        const check = checks.get(logicalId)
        this.emit(Events.CHECK_FAILED, check, message)
        this.emit(Events.CHECK_FINISHED, check)
      }
      // Note that there is a limit in AWS of 8 subscriptions per subscribe request.
      await socketClient.subscribe(subscriptions)
    }
  }

  private allChecksFinished (): Promise<void> {
    let finishedCheckCount = 0
    const checks = this.checks
    return new Promise((resolve) => {
      this.on(Events.CHECK_FINISHED, () => {
        finishedCheckCount++
        if (finishedCheckCount === checks.size) resolve()
      })
    })
  }
}
