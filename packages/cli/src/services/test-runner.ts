import * as uuid from 'uuid'

import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, SequenceId } from './abstract-check-runner'
import { GitInformation } from './util'
import { Check } from '../constructs/check'
import { RetryStrategy } from '../constructs'
import { ProjectBundle, ResourceDataBundle } from '../constructs/project-bundle'
import { pullSnapshots } from '../services/snapshot-service'
import { PlaywrightCheckBundle } from '../constructs/playwright-check-bundle'


export default class TestRunner extends AbstractCheckRunner {
  projectBundle: ProjectBundle
  checkBundles: ResourceDataBundle<Check>[]
  location: RunLocation
  shouldRecord: boolean
  repoInfo: GitInformation | null
  environment: string | null
  updateSnapshots: boolean
  baseDirectory: string
  testRetryStrategy: RetryStrategy | null

  constructor (
    accountId: string,
    projectBundle: ProjectBundle,
    checkBundles: ResourceDataBundle<Check>[],
    location: RunLocation,
    timeout: number,
    verbose: boolean,
    shouldRecord: boolean,
    repoInfo: GitInformation | null,
    environment: string | null,
    updateSnapshots: boolean,
    baseDirectory: string,
    testRetryStrategy: RetryStrategy | null,
  ) {
    super(accountId, timeout, verbose)
    this.projectBundle = projectBundle
    this.checkBundles = checkBundles
    this.location = location
    this.shouldRecord = shouldRecord
    this.repoInfo = repoInfo
    this.environment = environment
    this.updateSnapshots = updateSnapshots
    this.baseDirectory = baseDirectory
    this.testRetryStrategy = testRetryStrategy
  }

  async scheduleChecks (
    checkRunSuiteId: string,
  ): Promise<{
    testSessionId?: string,
    checks: Array<{ check: any, sequenceId: SequenceId }>,
  }> {
    const checkRunJobs = this.checkBundles.map(({ construct: check, bundle }) => {
      // Playwright checks lazy load groups so they're only present in the
      // bundle. This is a hack but for now it works.
      const groupId = bundle instanceof PlaywrightCheckBundle
        ? bundle.groupId
        : check.groupId
      return {
        ...bundle.synthesize(),
        testRetryStrategy: this.testRetryStrategy,
        group: groupId ? this.projectBundle.data['check-group'][groupId.ref].bundle.synthesize() : undefined,
        groupId: undefined,
        sourceInfo: {
          checkRunSuiteId,
          checkRunId: uuid.v4(),
          updateSnapshots: this.updateSnapshots,
        },
        logicalId: check.logicalId,
        filePath: check.getSourceFile(),
      }
    })
    try {
      if (!checkRunJobs.length) {
        throw new Error('Unable to find checks to run.')
      }
      const { data } = await testSessions.run({
        name: this.projectBundle.project.name,
        checkRunJobs,
        project: { logicalId: this.projectBundle.project.logicalId },
        runLocation: this.location,
        repoInfo: this.repoInfo,
        environment: this.environment,
        shouldRecord: this.shouldRecord,
      })
      const { testSessionId, sequenceIds } = data
      const checks = this.checkBundles.map(({ construct: check }) => ({ check, sequenceId: sequenceIds?.[check.logicalId] }))
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
