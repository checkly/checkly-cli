const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { Command } = require('@oclif/command')
const { account } = require('../services/api')
const { settingsTemplate } = require('../templates/settings')

class InitCommand extends Command {
  static args = [
    {
      name: 'projectName',
      required: true,
      description: 'Project name',
      default: path.basename(process.cwd()),
    },
  ]

  async run() {
    const { args } = this.parse(InitCommand)
    const dirName = path.join(__dirname, '../../.checkly')

    // Setup repo .checkly dir
    if (fs.existsSync(dirName)) {
      consola.error('checkly-cli already initialized')
      return process.exit(1)
    }
    fs.mkdirSync(dirName)

    // Fetch required info
    const { data } = await account.findOne()
    const { accountId, name } = data

    // Initial Account Settings
    const yml = settingsTemplate({
      accountId,
      name,
      projectName: args.projectName,
    })

    // Create Settings File
    fs.writeFileSync(path.join(dirName, 'settings.yml'), yml)
    // Create Checks Directory
    fs.mkdirSync(path.join(dirName, 'checks'))

    consola.success('Project initialized 🦝')
    return process.exit(0)
  }
}

InitCommand.description = 'Initialise a new Checkly Project'

module.exports = InitCommand
