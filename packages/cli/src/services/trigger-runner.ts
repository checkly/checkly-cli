import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, CheckRunId } from './abstract-check-runner'
import { GitInformation } from './util'

export default class TriggerRunner extends AbstractCheckRunner {
  shouldRecord: boolean
  location: RunLocation
  targetTags: string[][]
  envVars: Array<{ key: string, value: string }>
  repoInfo: GitInformation | null
  environment: string | null
  testSessionName: string | undefined

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
  ) {
    super(accountId, timeout, verbose)
    this.shouldRecord = shouldRecord
    this.location = location
    this.targetTags = targetTags
    this.envVars = envVars
    this.repoInfo = repoInfo
    this.environment = environment
    this.testSessionName = testSessionName
  }

  async scheduleChecks (
    checkRunSuiteId: string,
  ): Promise<{
    testSessionId?: string,
    checks: Array<{ check: any, checkRunId: CheckRunId, testSessionId?: string }>,
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
      })
      const {
        checks,
        checkRunIds,
        testSessionId,
        testResultIds,
      }: {
        checks: Array<any>,
        checkRunIds: Record<string, CheckRunId>,
        testSessionId: string,
        testResultIds: Record<string, string>,
      } = data
      const checksMap: Record<string, any> = checks.reduce((acc: Record<string, any>, check: any) => {
        acc[check.id] = check
        return acc
      }, {})
      const augmentedChecks = Object.entries(checkRunIds).map(([checkId, checkRunId]) => ({
        checkRunId,
        check: checksMap[checkId],
        testResultId: testResultIds?.[checkId],
      }))
      return { checks: augmentedChecks, testSessionId }
    } catch (err: any) {
      throw new Error(err.response?.data?.message ?? err.message)
    }
  }
}
