const { Command } = require('@oclif/command')

const { exportMaC } = require('../modules/pulumi')
const { output } = require('../services/flags')
const { basepath } = require('../services/args')

class PulumiCommand extends Command {
  static args = [basepath]

  async run () {
    const { args, flags } = this.parse(PulumiCommand)
    console.log(`exporting to: '${args.path}`)
    return exportMaC({ ...flags, basePath: args.path })
  }
}

PulumiCommand.description = 'Export existing checks to pulumi project'
PulumiCommand.flags = { output }

module.exports = PulumiCommand
