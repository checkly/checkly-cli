import { Command, Flags } from '@oclif/core'
import ListReporter from '../reporters/list'
import { parseProject } from '../services/project-parser'
import { runChecks } from '../services/check-runner'

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

    const project = await parseProject(process.cwd())
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
