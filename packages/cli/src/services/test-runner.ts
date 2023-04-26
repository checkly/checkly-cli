import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, CheckRunId } from './abstract-check-runner'
import { GitInformation } from './util'
import { Check } from '../constructs/check'
import { Project } from '../constructs'

import * as uuid from 'uuid'

export default class TestRunner extends AbstractCheckRunner {
  project: Project
  checkConstructs: Check[]
  location: RunLocation
  shouldRecord: boolean
  repoInfo: GitInformation | null
  environment: string | null
  constructor (
    accountId: string,
    project: Project,
    checks: Check[],
    location: RunLocation,
    timeout: number,
    verbose: boolean,
    shouldRecord: boolean,
    repoInfo: GitInformation | null,
    environment: string | null,
  ) {
    super(accountId, timeout, verbose)
    this.project = project
    this.checkConstructs = checks
    this.location = location
    this.shouldRecord = shouldRecord
    this.repoInfo = repoInfo
    this.environment = environment
  }

  async scheduleChecks (
    checkRunSuiteId: string,
  ): Promise<{
    testSessionId?: string,
    checks: Array<{ check: any, checkRunId: CheckRunId, testSessionId?: string }>,
  }> {
    const checkRunIdMap = new Map(
      this.checkConstructs.map((check) => [uuid.v4(), check]),
    )
    const checkRunJobs = Array.from(checkRunIdMap.entries()).map(([checkRunId, check]) => ({
      ...check.synthesize(),
      group: check.groupId ? this.project.data['check-group'][check.groupId.ref].synthesize() : undefined,
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
        repoInfo: this.repoInfo,
        environment: this.environment,
        shouldRecord: this.shouldRecord,
      })
      const { testSessionId, testResultIds } = data
      const checks = Array.from(checkRunIdMap.entries())
        .map(([checkRunId, check]) => ({ check, checkRunId, testResultId: testResultIds?.[check.logicalId] }))
      return { testSessionId, checks }
    } catch (err: any) {
      throw new Error(err.response?.data?.message ?? err.message)
    }
  }
}
