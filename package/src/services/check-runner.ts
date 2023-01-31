import { checks as checksApi, assets } from '../rest/api'
import { SocketClient } from './socket-client'
import * as uuid from 'uuid'
import { EventEmitter } from 'node:events'
import type { AsyncMqttClient } from 'async-mqtt'

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
  checks: Map<string, any> // A map of checkRunId->check
  location: RunLocation
  accountId: string
  apiKey: string

  constructor (accountId: string, apiKey: string, checks: any[], location: RunLocation) {
    super()
    this.checks = new Map(
      checks.map((check) => [uuid.v4(), check]),
    )
    this.location = location
    this.accountId = accountId
    this.apiKey = apiKey
  }

  async run () {
    this.emit(Events.RUN_STARTED)
    const socketClient = await SocketClient.connect()

    const checkRunSuiteId = uuid.v4()
    // Configure the socket listener and allChecksFinished listener before starting checks to avoid race conditions
    await this.configureResultListener(checkRunSuiteId, socketClient)
    const allChecksFinished = this.allChecksFinished()

    await this.scheduleAllChecks(checkRunSuiteId)

    await allChecksFinished
    await socketClient.end()
    this.emit(Events.RUN_FINISHED)
  }

  private async scheduleAllChecks (checkRunSuiteId: string): Promise<void> {
    const checkEntries = Array.from(this.checks.entries())
    await Promise.all(checkEntries.map(
      ([checkRunId, check]) => this.scheduleCheck(checkRunSuiteId, checkRunId, check),
    ))
  }

  private async scheduleCheck (checkRunSuiteId: string, checkRunId: string, check: any): Promise<void> {
    const checkRun = {
      ...check,
      runLocation: this.location,
      sourceInfo: { checkRunId, checkRunSuiteId },
      // We keep passing the websocket client ID for the case of old Agent versions.
      // If the old Agent doesn't receive a client ID, it won't publish socket updates.
      websocketClientId: uuid.v4(),
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

  private async configureResultListener (checkRunSuiteId: string, socketClient: AsyncMqttClient): Promise<void> {
    socketClient.on('message', async (topic: string, rawMessage: string|Buffer) => {
      const message = JSON.parse(rawMessage.toString('utf8'))
      const topicComponents = topic.split('/')
      const checkRunId = topicComponents[4]
      const subtopic = topicComponents[5]
      const check = this.checks.get(checkRunId)!
      if (subtopic === 'run-start') {
        this.emit(Events.CHECK_INPROGRESS, check)
      } else if (subtopic === 'run-end') {
        const { result } = message
        const { region, logPath, checkRunDataPath } = result.assets
        if (result.hasFailures && logPath) {
          result.logs = await assets.getLogs(region, logPath)
        }
        if (result.hasFailures && checkRunDataPath) {
          result.checkRunData = await assets.getCheckRunData(region, checkRunDataPath)
        }
        this.emit(Events.CHECK_SUCCESSFUL, check, result)
        this.emit(Events.CHECK_FINISHED, check)
      } else if (subtopic === 'error') {
        this.emit(Events.CHECK_FAILED, check, message)
        this.emit(Events.CHECK_FINISHED, check)
      }
    })
    await socketClient.subscribe(`account/${this.accountId}/ad-hoc-check-results/${checkRunSuiteId}/+/+`)
  }

  private allChecksFinished (): Promise<void> {
    let finishedCheckCount = 0
    const numChecks = this.checks.size
    if (numChecks === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.on(Events.CHECK_FINISHED, () => {
        finishedCheckCount++
        if (finishedCheckCount === numChecks) resolve()
      })
    })
  }
}
