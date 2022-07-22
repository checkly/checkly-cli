const { Command } = require('@oclif/command')

const checks = require('../modules/pulumi')
const { output } = require('../services/flags')
const { id } = require('../services/args')

class PulumiCommand extends Command {
  static args = [id]

  async run () {
    const { args, flags } = this.parse(PulumiCommand)
    /* strip id
rename checkType to type
drop frequencyOffset
drop created_at, updated_at,
drop groupid, grouporder, replace later with checkly.checkgroup
externalize scripts to folders
 */

    switch (args.action) {
      default:
        return checks.list({ ...flags })
    }
  }
}

PulumiCommand.description = 'Export existing checks to pulumi project'
PulumiCommand.flags = { output }

module.exports = PulumiCommand
