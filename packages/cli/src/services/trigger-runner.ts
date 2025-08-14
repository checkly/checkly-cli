import { RetryStrategy } from '../constructs'
import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, SequenceId } from './abstract-check-runner'
import { GitInformation } from './util'

export default class TriggerRunner extends AbstractCheckRunner {
  shouldRecord: boolean
  location: RunLocation
  targetTags: string[][]
  envVars: Array<{ key: string, value: string }>
  repoInfo: GitInformation | null
  environment: string | null
  testSessionName: string | undefined
  testRetryStrategy: RetryStrategy | null

  constructor (
    accountId: string,
    timeout: number,
    verbose: boolean,
    shouldRecord: boolean,
    location: RunLocation,
    targetTags: string[][],
    envVars: Array<{ key: string, value: string }>,
    repoInfo: GitInformation | null,
    environment: string | null,
    testSessionName: string | undefined,
    testRetryStrategy: RetryStrategy | null,
  ) {
    super(accountId, timeout, verbose)
    this.shouldRecord = shouldRecord
    this.location = location
    this.targetTags = targetTags
    this.envVars = envVars
    this.repoInfo = repoInfo
    this.environment = environment
    this.testSessionName = testSessionName
    this.testRetryStrategy = testRetryStrategy
  }

  async scheduleChecks (
    checkRunSuiteId: string,
  ): Promise<{
    testSessionId?: string
    checks: Array<{ check: any, sequenceId: SequenceId }>
  }> {
    const { data } = await testSessions.trigger({
      name: this.testSessionName ?? 'Triggered Session',
      shouldRecord: this.shouldRecord,
      runLocation: this.location,
      checkRunSuiteId,
      targetTags: this.targetTags,
      environmentVariables: this.envVars,
      repoInfo: this.repoInfo,
      environment: this.environment,
      testRetryStrategy: this.testRetryStrategy,
    })
    const {
      checks,
      testSessionId,
      sequenceIds,
    } = data
    const augmentedChecks = checks.map(check => ({
      check,
      sequenceId: sequenceIds?.[check.id],
    }))
    return { checks: augmentedChecks, testSessionId }
  }
}
