import * as uuid from 'uuid'

import { testSessions } from '../rest/api'
import AbstractCheckRunner, { RunLocation, SequenceId } from './abstract-check-runner'
import { GitInformation } from './util'
import { Check } from '../constructs/check'
import { RetryStrategy, SharedFile } from '../constructs'
import { ProjectBundle, ResourceDataBundle } from '../constructs/project-bundle'
import { pullSnapshots } from '../services/snapshot-service'
import { PlaywrightCheckBundle } from '../constructs/playwright-check-bundle'

export default class TestRunner extends AbstractCheckRunner {
  projectBundle: ProjectBundle
  checkBundles: ResourceDataBundle<Check>[]
  sharedFiles: SharedFile[]
  location: RunLocation
  shouldRecord: boolean
  repoInfo: GitInformation | null
  environment: string | null
  updateSnapshots: boolean
  baseDirectory: string
  testRetryStrategy: RetryStrategy | null
  streamLogs: boolean

  constructor (
    accountId: string,
    projectBundle: ProjectBundle,
    checkBundles: ResourceDataBundle<Check>[],
    sharedFiles: SharedFile[],
    location: RunLocation,
    timeout: number,
    verbose: boolean,
    shouldRecord: boolean,
    repoInfo: GitInformation | null,
    environment: string | null,
    updateSnapshots: boolean,
    baseDirectory: string,
    testRetryStrategy: RetryStrategy | null,
    streamLogs?: boolean,
  ) {
    super(accountId, timeout, verbose)
    this.projectBundle = projectBundle
    this.checkBundles = checkBundles
    this.sharedFiles = sharedFiles
    this.location = location
    this.shouldRecord = shouldRecord
    this.repoInfo = repoInfo
    this.environment = environment
    this.updateSnapshots = updateSnapshots
    this.baseDirectory = baseDirectory
    this.testRetryStrategy = testRetryStrategy
    this.streamLogs = streamLogs ?? false
  }

  async scheduleChecks (
    checkRunSuiteId: string,
  ): Promise<{
    testSessionId?: string
    checks: Array<{ check: any, sequenceId: SequenceId }>
  }> {
    const checkRunJobs = this.checkBundles.map(({ construct: check, bundle }) => {
      // Get the group reference - Playwright checks store it in the bundle,
      // other checks store it in the check construct (as groupId)
      const group = bundle instanceof PlaywrightCheckBundle
        ? bundle.group
        : check.groupId

      return {
        ...bundle.synthesize(),
        testRetryStrategy: this.testRetryStrategy,
        group: group ? this.projectBundle.data['check-group'][group.ref].bundle.synthesize() : undefined,
        sourceInfo: {
          checkRunSuiteId,
          checkRunId: uuid.v4(),
          updateSnapshots: this.updateSnapshots,
        },
        logicalId: check.logicalId,
        filePath: check.getSourceFile(),
      }
    })

    if (!checkRunJobs.length) {
      throw new Error('Unable to find checks to run.')
    }
    const { data } = await testSessions.run({
      name: this.projectBundle.project.name,
      checkRunJobs,
      project: { logicalId: this.projectBundle.project.logicalId },
      sharedFiles: this.sharedFiles,
      runLocation: this.location,
      repoInfo: this.repoInfo,
      environment: this.environment,
      shouldRecord: this.shouldRecord,
      streamLogs: this.streamLogs,
    })
    const { testSessionId, sequenceIds } = data
    const checks = this.checkBundles.map(({ construct: check }) => {
      return { check, sequenceId: sequenceIds?.[check.logicalId] }
    })
    return { testSessionId, checks }
  }

  async processCheckResult (result: any) {
    await super.processCheckResult(result)
    if (this.updateSnapshots) {
      await pullSnapshots(this.baseDirectory, result.assets?.snapshots)
    }
  }
}
