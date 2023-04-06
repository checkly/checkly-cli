import { testSessions, assets } from '../rest/api'
import { SocketClient } from './socket-client'
import PQueue from 'p-queue'
import * as uuid from 'uuid'
import { EventEmitter } from 'node:events'
import type { AsyncMqttClient } from 'async-mqtt'
import { Check } from '../constructs/check'
import { CheckGroup, Project } from '../constructs'
import type { Region } from '..'

// eslint-disable-next-line no-restricted-syntax
export enum Events {
  CHECK_REGISTERED = 'CHECK_REGISTERED',
  CHECK_INPROGRESS = 'CHECK_INPROGRESS',
  CHECK_FAILED = 'CHECK_FAILED',
  CHECK_SUCCESSFUL = 'CHECK_SUCCESSFUL',
  CHECK_FINISHED = 'CHECK_FINISHED',
  RUN_STARTED = 'RUN_STARTED',
  RUN_FINISHED = 'RUN_FINISHED',
  ERROR = 'ERROR',
}

export type PrivateRunLocation = {
  type: 'PRIVATE',
  id: string,
  slugName: string,
}
export type PublicRunLocation = {
  type: 'PUBLIC',
  region: keyof Region,
}
export type RunLocation = PublicRunLocation | PrivateRunLocation

type CheckRunId = string

export default class CheckRunner extends EventEmitter {
  project: Project
  checks: Map<CheckRunId, any>
  groups: Record<string, CheckGroup>
  // If there's an error in the backend and no check result is sent, the check run could block indefinitely.
  // To avoid this case, we set a per-check timeout.
  timeouts: Map<CheckRunId, NodeJS.Timeout>
  location: RunLocation
  accountId: string
  apiKey: string
  timeout: number
  verbose: boolean
  shouldRecord: boolean
  queue: PQueue

  constructor (
    accountId: string,
    apiKey: string,
    project: Project,
    checks: Check[],
    location: RunLocation,
    timeout: number,
    verbose: boolean,
    shouldRecord: boolean,
  ) {
    super()
    this.project = project
    this.checks = new Map(
      checks.map((check) => [uuid.v4(), check]),
    )
    this.groups = project.data.groups
    this.timeouts = new Map()
    this.location = location
    this.accountId = accountId
    this.apiKey = apiKey
    this.timeout = timeout
    this.verbose = verbose
    this.shouldRecord = shouldRecord
    this.queue = new PQueue({ autoStart: false, concurrency: 1 })
  }

  async run () {
    let socketClient = null
    try {
      socketClient = await SocketClient.connect()

      const checkRunSuiteId = uuid.v4()
      // Configure the socket listener and allChecksFinished listener before starting checks to avoid race conditions
      await this.configureResultListener(checkRunSuiteId, socketClient)
      const allChecksFinished = this.allChecksFinished()
      this.setAllTimeouts()

      const { testSessionId, testResultIds } = await this.scheduleAllChecks(checkRunSuiteId)

      // Start the queue after the test session run rest call is completed to avoid race conditions
      this.queue.start()
      this.emit(Events.RUN_STARTED, testSessionId, testResultIds)

      await allChecksFinished
      this.emit(Events.RUN_FINISHED, testSessionId)
    } catch (err) {
      this.disableAllTimeouts()
      this.emit(Events.ERROR, err)
    } finally {
      if (socketClient) {
        await socketClient.end()
      }
    }
  }

  private async scheduleAllChecks (checkRunSuiteId: string): Promise<{
    testSessionId?: string,
    testResultIds?: { [key: string]: string },
  }> {
    const checkRunJobs = Array.from(this.checks.entries()).map(([checkRunId, check]) => ({
      ...check.synthesize(),
      group: check.groupId ? this.groups[check.groupId.ref].synthesize() : undefined,
      groupId: undefined,
      sourceInfo: { checkRunSuiteId, checkRunId },
      logicalId: check.logicalId,
    }))
    try {
      if (!checkRunJobs.length) {
        throw new Error('Unable to find checks to run.')
      }
      const { data } = await testSessions.run({
        name: this.project.name,
        checkRunJobs,
        project: { logicalId: this.project.logicalId },
        runLocation: this.location,
        repoInfo: this.project.repoInfo,
        shouldRecord: this.shouldRecord,
      })
      return data
    } catch (err: any) {
      throw new Error(err.response?.data?.message ?? err.message)
    }
  }

  private async configureResultListener (checkRunSuiteId: string, socketClient: AsyncMqttClient): Promise<void> {
    socketClient.on('message', (topic: string, rawMessage: string|Buffer) => {
      const message = JSON.parse(rawMessage.toString('utf8'))
      const topicComponents = topic.split('/')
      const checkRunId = topicComponents[4]
      const subtopic = topicComponents[5]

      this.queue.add(() => this.processMessage(checkRunId, subtopic, message))
    })
    await socketClient.subscribe(`account/${this.accountId}/ad-hoc-check-results/${checkRunSuiteId}/+/+`)
  }

  private async processMessage (checkRunId: string, subtopic: string, message: any) {
    if (!this.timeouts.has(checkRunId)) {
      // The check has already timed out. We return early to avoid reporting a duplicate result.
      return
    }
    const check = this.checks.get(checkRunId)
    if (subtopic === 'run-start') {
      this.emit(Events.CHECK_INPROGRESS, check)
    } else if (subtopic === 'run-end') {
      this.disableTimeout(checkRunId)
      const { result } = message
      const {
        region,
        logPath,
        checkRunDataPath,
        playwrightTestTraceFiles,
        playwrightTestVideoFiles,
      } = result.assets
      if (logPath && (this.verbose || result.hasFailures)) {
        result.logs = await assets.getLogs(region, logPath)
      }
      if (checkRunDataPath && (this.verbose || result.hasFailures)) {
        result.checkRunData = await assets.getCheckRunData(region, checkRunDataPath)
      }

      try {
        if (result.hasFailures) {
          if (playwrightTestTraceFiles && playwrightTestTraceFiles.length) {
            result.traceFilesUrls = await Promise
              .all(playwrightTestTraceFiles.map((t: string) => assets.getAssetsLink(region, t)))
          }
          if (playwrightTestVideoFiles && playwrightTestVideoFiles.length) {
            result.videoFilesUrls = await Promise
              .all(playwrightTestVideoFiles.map((t: string) => assets.getAssetsLink(region, t)))
          }
        }
      } catch {
        // TODO: remove the try/catch after deploy endpoint to fetch assets link
      }

      this.emit(Events.CHECK_SUCCESSFUL, check, result)
      this.emit(Events.CHECK_FINISHED, check)
    } else if (subtopic === 'error') {
      this.disableTimeout(checkRunId)
      this.emit(Events.CHECK_FAILED, check, message)
      this.emit(Events.CHECK_FINISHED, check)
    }
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

  private setAllTimeouts () {
    Array.from(this.checks.entries()).forEach(([checkRunId, check]) =>
      this.timeouts.set(checkRunId, setTimeout(() => {
        this.timeouts.delete(checkRunId)
        this.emit(Events.CHECK_FAILED, check, `Reached timeout of ${this.timeout} seconds waiting for check result.`)
        this.emit(Events.CHECK_FINISHED, check)
      }, this.timeout * 1000),
      ))
  }

  private disableAllTimeouts () {
    Array.from(this.checks.entries()).forEach(([checkRunId]) => this.disableTimeout(checkRunId))
  }

  private disableTimeout (checkRunId: string) {
    const timeout = this.timeouts.get(checkRunId)
    clearTimeout(timeout)
    this.timeouts.delete(checkRunId)
  }
}
