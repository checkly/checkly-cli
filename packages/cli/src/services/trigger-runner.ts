import { RetryStrategy } from '../constructs'
import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, SequenceId } from './abstract-check-runner'
import { GitInformation } from './util'

export class NoMatchingChecksError extends Error {}

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
    testSessionId?: string,
    checks: Array<{ check: any, sequenceId: SequenceId }>,
  }> {
    try {
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
      }: {
        checks: Array<any>,
        testSessionId: string,
        testResultIds: Record<string, string>,
        sequenceIds: Record<string, SequenceId>
      } = data
      if (!checks.length) {
        // Currently the BE will never return an empty `checks` array, it returns a 403 instead.
        // This is added to make the old CLI versions compatible if we ever change this, though.
        throw new NoMatchingChecksError()
      }
      const augmentedChecks = checks.map(check => ({
        check,
        sequenceId: sequenceIds?.[check.id],
      }))
      return { checks: augmentedChecks, testSessionId }
    } catch (err: any) {
      if (err.response?.data?.errorCode === 'ERR_NO_MATCHING_CHECKS') {
        throw new NoMatchingChecksError()
      }
      throw new Error(err.response?.data?.message ?? err.message)
    }
  }
}
