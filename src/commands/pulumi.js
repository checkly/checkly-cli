const { Command, flags } = require('@oclif/command')

const { exportMaC } = require('../modules/pulumi')
const { basepath } = require('../services/args')

class PulumiCommand extends Command {
  static args = [basepath]
  static flags = {
    import: flags.boolean({ char: 'i' }),
  }

  async run () {
    const { args, flags } = this.parse(PulumiCommand)
    console.log(`exporting to: '${args.path} ${flags.import ? 'importing existing resources' : ''}`)
    return exportMaC({ ...flags, basePath: args.path, importFromPulumi: flags.import })
  }
}

PulumiCommand.description = 'Export existing checks to pulumi project'

module.exports = PulumiCommand
