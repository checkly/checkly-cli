import { assets, testSessions } from '../rest/api'
import { SocketClient } from './socket-client'
import PQueue from 'p-queue'
import * as uuid from 'uuid'
import { EventEmitter } from 'node:events'
import type { MqttClient } from 'mqtt'
import type { Region } from '..'
import { TestResultsShortLinks } from '../rest/test-sessions'

// eslint-disable-next-line no-restricted-syntax
export enum Events {
  CHECK_REGISTERED = 'CHECK_REGISTERED',
  CHECK_INPROGRESS = 'CHECK_INPROGRESS',
  CHECK_ATTEMPT_RESULT = 'CHECK_ATTEMPT_RESULT',
  CHECK_FAILED = 'CHECK_FAILED',
  CHECK_SUCCESSFUL = 'CHECK_SUCCESSFUL',
  CHECK_FINISHED = 'CHECK_FINISHED',
  RUN_STARTED = 'RUN_STARTED',
  RUN_FINISHED = 'RUN_FINISHED',
  ERROR = 'ERROR',
  MAX_SCHEDULING_DELAY_EXCEEDED = 'MAX_SCHEDULING_DELAY_EXCEEDED',
  STREAM_LOGS = 'STREAM_LOGS',
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

export type CheckRunId = string
export type SequenceId = string

export const DEFAULT_CHECK_RUN_TIMEOUT_SECONDS = 600

const DEFAULT_SCHEDULING_DELAY_EXCEEDED_MS = 20000

export default abstract class AbstractCheckRunner extends EventEmitter {
  checks: Map<SequenceId, { check: any }>
  testSessionId?: string
  // If there's an error in the backend and no check result is sent, the check run could block indefinitely.
  // To avoid this case, we set a per-check timeout.
  timeouts: Map<SequenceId, NodeJS.Timeout>
  schedulingDelayExceededTimeout?: NodeJS.Timeout
  accountId: string
  timeout: number
  verbose: boolean
  queue: PQueue

  constructor (
    accountId: string,
    timeout: number,
    verbose: boolean,
  ) {
    super()
    this.checks = new Map()
    this.timeouts = new Map()
    this.queue = new PQueue({ autoStart: false, concurrency: 1 })
    this.timeout = timeout
    this.verbose = verbose
    this.accountId = accountId
  }

  abstract scheduleChecks (checkRunSuiteId: string):
    Promise<{
      testSessionId?: string,
      checks: Array<{ check: any, sequenceId: SequenceId }>,
    }>

  async run () {
    let socketClient = null
    try {
      socketClient = await SocketClient.connect()

      const checkRunSuiteId = uuid.v4()
      // Configure the socket listener and allChecksFinished listener before starting checks to avoid race conditions
      await this.configureResultListener(checkRunSuiteId, socketClient)

      const { testSessionId, checks } = await this.scheduleChecks(checkRunSuiteId)
      this.testSessionId = testSessionId
      this.checks = new Map(
        checks.map(({ check, sequenceId }) => [sequenceId, { check }]),
      )

      // `processMessage()` assumes that `this.timeouts` always has an entry for non-timed-out checks.
      // To ensure that this is the case, we call `setAllTimeouts()` before `queue.start()`.
      // Otherwise, we risk a race condition where check results are received before the timeout is set.
      // This would cause `processMessage()` to mistakenly skip check results and consider the checks timed-out.
      this.setAllTimeouts()
      // Add timeout to fire an event after DEFAULT_SCHEDULING_DELAY_EXCEEDED_MS to let reporters know it's time
      // to display a hint messages if some checks are still being scheduled.
      this.startSchedulingDelayTimeout()
      // `allChecksFinished` should be started before processing check results in `queue.start()`.
      // Otherwise, there could be a race condition causing check results to be missed by `allChecksFinished()`.
      const allChecksFinished = this.allChecksFinished()
      /// / Need to structure the checks depending on how it went
      this.emit(Events.RUN_STARTED, checks, testSessionId)
      // Start the queue after the test session run rest call is completed to avoid race conditions
      this.queue.start()

      await allChecksFinished
      this.emit(Events.RUN_FINISHED, testSessionId)
    } catch (err) {
      this.disableAllTimeouts()
      this.emit(Events.ERROR, err)
    } finally {
      if (socketClient) {
        await socketClient.endAsync()
      }
    }
  }

  private async configureResultListener (checkRunSuiteId: string, socketClient: MqttClient): Promise<void> {
    socketClient.on('message', (topic: string, rawMessage: string|Buffer) => {
      const message = JSON.parse(rawMessage.toString('utf8'))
      const topicComponents = topic.split('/')
      const sequenceId = topicComponents[4]
      const checkRunId = topicComponents[5]
      const subtopic = topicComponents[6]

      this.queue.add(() => this.processMessage(sequenceId, subtopic, message))
    })
    await socketClient.subscribeAsync(`account/${this.accountId}/ad-hoc-check-results/${checkRunSuiteId}/+/+/+`)
  }

  private async processMessage (sequenceId: SequenceId, subtopic: string, message: any) {
    if (!sequenceId) {
      // There should always be a sequenceId, but let's have an early return to make forwards-compatibility easier.
      return
    }

    if (!this.timeouts.has(sequenceId)) {
      // The check has already timed out. We return early to avoid reporting a duplicate result.
      return
    }

    if (!this.checks.get(sequenceId)) {
      return
    }

    const { check } = this.checks.get(sequenceId)!
    if (subtopic === 'run-start') {
      this.emit(Events.CHECK_INPROGRESS, check, sequenceId)
    } else if (subtopic === 'result') {
      const { result, testResultId, resultType } = message
      await this.processCheckResult(result)
      const links = testResultId && result.hasFailures && await this.getShortLinks(testResultId)
      if (resultType === 'FINAL') {
        this.disableTimeout(sequenceId)
        this.emit(Events.CHECK_SUCCESSFUL, sequenceId, check, result, testResultId, links)
        this.emit(Events.CHECK_FINISHED, check)
      } else if (resultType === 'ATTEMPT') {
        this.emit(Events.CHECK_ATTEMPT_RESULT, sequenceId, check, result, links)
      }
    } else if (subtopic === 'error') {
      this.disableTimeout(sequenceId)
      this.emit(Events.CHECK_FAILED, sequenceId, check, message)
      this.emit(Events.CHECK_FINISHED, check)
    } else if (subtopic === 'stream-logs') {
      const buffer = Buffer.from(message.data)
      const jsonString = buffer.toString('utf-8');
      const obj = JSON.parse(jsonString);
      this.emit(Events.STREAM_LOGS, check, sequenceId, obj)

    }
  }

  async processCheckResult (result: any) {
    const {
      region,
      logPath,
      checkRunDataPath,
    } = result.assets
    if (logPath && (this.verbose || result.hasFailures)) {
      result.logs = await assets.getLogs(region, logPath)
    }
    if (checkRunDataPath && (this.verbose || result.hasFailures)) {
      result.checkRunData = await assets.getCheckRunData(region, checkRunDataPath)
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
    Array.from(this.checks.entries()).forEach(([sequenceId, { check }]) =>
      this.timeouts.set(sequenceId, setTimeout(() => {
        this.timeouts.delete(sequenceId)
        let errorMessage = `Reached timeout of ${this.timeout} seconds waiting for check result.`
        // Checkly should always report a result within 240s.
        // If the default timeout was used, we should point the user to the status page and support email.
        if (this.timeout === DEFAULT_CHECK_RUN_TIMEOUT_SECONDS) {
          errorMessage += ' Checkly may be experiencing problems. Please check https://is.checkly.online or reach out to support@checklyhq.com.'
        }
        this.emit(Events.CHECK_FAILED, sequenceId, check, errorMessage)
        this.emit(Events.CHECK_FINISHED, check)
      }, this.timeout * 1000),
      ))
  }

  private disableAllTimeouts () {
    if (!this.checks) {
      return
    }
    Array.from(this.checks.entries()).forEach(([checkRunId]) => this.disableTimeout(checkRunId))

    if (this.schedulingDelayExceededTimeout) {
      clearTimeout(this.schedulingDelayExceededTimeout)
      this.schedulingDelayExceededTimeout = undefined
    }
  }

  private startSchedulingDelayTimeout () {
    let scheduledCheckCount = 0
    const numChecks = this.checks.size
    if (numChecks === 0) {
      return
    }
    this.schedulingDelayExceededTimeout = setTimeout(
      () => {
        this.emit(Events.MAX_SCHEDULING_DELAY_EXCEEDED)
        this.schedulingDelayExceededTimeout = undefined
      },
      DEFAULT_SCHEDULING_DELAY_EXCEEDED_MS,
    )
    this.on(Events.CHECK_INPROGRESS, () => {
      scheduledCheckCount++
      if (scheduledCheckCount === numChecks) clearTimeout(this.schedulingDelayExceededTimeout)
    })
  }

  private disableTimeout (timeoutKey: string) {
    const timeout = this.timeouts.get(timeoutKey)
    clearTimeout(timeout)
    this.timeouts.delete(timeoutKey)
  }

  private async getShortLinks (testResultId: string): Promise<TestResultsShortLinks|undefined> {
    try {
      if (!this.testSessionId) {
        return
      }
      const { data: links } = await testSessions.getResultShortLinks(this.testSessionId, testResultId)
      return links
    } catch {
    }
  }
}
