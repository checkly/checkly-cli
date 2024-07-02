import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, SequenceId } from './abstract-check-runner'
import { GitInformation } from './util'
import { Check } from '../constructs/check'
import { RetryStrategyBuilder } from '../constructs'
import { Project } from '../constructs'
import { pullSnapshots } from '../services/snapshot-service'

import * as uuid from 'uuid'

export default class TestRunner extends AbstractCheckRunner {
  project: Project
  checkConstructs: Check[]
  location: RunLocation
  shouldRecord: boolean
  repoInfo: GitInformation | null
  environment: string | null
  updateSnapshots: boolean
  baseDirectory: string
  retries: number
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
    updateSnapshots: boolean,
    baseDirectory: string,
    retries: number,
  ) {
    super(accountId, timeout, verbose)
    this.project = project
    this.checkConstructs = checks
    this.location = location
    this.shouldRecord = shouldRecord
    this.repoInfo = repoInfo
    this.environment = environment
    this.updateSnapshots = updateSnapshots
    this.baseDirectory = baseDirectory
    this.retries = retries
  }

  async scheduleChecks (
    checkRunSuiteId: string,
  ): Promise<{
    testSessionId?: string,
    checks: Array<{ check: any, sequenceId: SequenceId }>,
  }> {
    const checkRunJobs = this.checkConstructs.map(check => ({
      ...check.synthesize(),
      retryStrategy: this.retries ? RetryStrategyBuilder.fixedStrategy({
        //
        maxRetries: this.retries,
        baseBackoffSeconds: 0,
      }) : undefined,
      group: check.groupId ? this.project.data['check-group'][check.groupId.ref].synthesize() : undefined,
      groupId: undefined,
      sourceInfo: {
        checkRunSuiteId,
        checkRunId: uuid.v4(),
        updateSnapshots: this.updateSnapshots,
        includeSequenceIdInSocketUpdates: true,
      },
      logicalId: check.logicalId,
      filePath: check.getSourceFile(),
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
      const { testSessionId, sequenceIds } = data
      const checks = this.checkConstructs.map(check => ({ check, sequenceId: sequenceIds?.[check.logicalId] }))
      return { testSessionId, checks }
    } catch (err: any) {
      throw new Error(err.response?.data?.message ?? err.response?.data?.error ?? err.message)
    }
  }

  async processCheckResult (result: any) {
    await super.processCheckResult(result)
    if (this.updateSnapshots) {
      await pullSnapshots(this.baseDirectory, result.assets?.snapshots)
    }
  }
}
