import { Command, Flags } from '@oclif/core'
import ListReporter from '../reporters/list'
import { parseProject } from '../services/project-parser'
import { runChecks } from '../services/check-runner'
import { loadChecklyConfig } from '../services/checkly-config-loader'

export default class Test extends Command {
  static description = 'Test checks on Checkly'
  static flags = {
    location: Flags.string({
      char: 'l',
      description: 'The location to run the checks on',
      default: 'eu-central-1',
    }),
  }
  // TODO: Add flags for running specific checks

  async run (): Promise<void> {
    const { flags } = await this.parse(Test)
    const { location } = flags
    const cwd = process.cwd()

    const checklyConfig = await loadChecklyConfig(cwd)
    const project = await parseProject({
      directory: cwd,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.checkMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
    })
    const { checks: checksMap, groups: groupsMap } = project.data
    const checks = Object.entries(checksMap).map(([key, check]) => {
      check.logicalId = key
      // TODO: Add the group to check in a cleaner form
      if (check.groupId) {
        check.group = groupsMap[check.groupId.ref]
        delete check.groupId
      }
      return check
    })
    const reporter = new ListReporter(checks)
    await runChecks(checks, location, reporter)
    // TODO - non-zero status code if checks fail
  }
}
