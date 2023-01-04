import { Command, Flags } from '@oclif/core'
import ListReporter from '../reporters/list'
import { parseProject } from '../services/project-parser'
import { runChecks } from '../services/check-runner'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { filterByFileNamePattern, filterByCheckNamePattern } from '../services/test-filters'

export default class Test extends Command {
  static description = 'Test checks on Checkly'
  static flags = {
    location: Flags.string({
      char: 'l',
      description: 'The location to run the checks on',
      default: 'eu-central-1',
    }),
    grep: Flags.string({
      char: 'g',
      description: 'Only run checks where the check name matches a regular expression.',
      default: '.*',
    }),
  }

  static auth = true

  static args = [
    {
      name: 'files',
      required: false,
      description: 'Only run checks where the file name matches a regular expression',
      default: '.*',
    },
  ]

  static strict = false

  async run (): Promise<void> {
    const { flags, argv: filePatterns } = await this.parse(Test)
    const { location, grep } = flags
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
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
    })
    const { checks: checksMap, groups: groupsMap } = project.data
    const checks = Object.entries(checksMap)
      .filter(([_, check]) => {
        return filterByFileNamePattern(filePatterns, check.scriptPath) ||
          filterByFileNamePattern(filePatterns, check.__checkFilePath)
      })
      .filter(([_, check]) => {
        return filterByCheckNamePattern(grep, check.name)
      })
      .map(([key, check]) => {
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
