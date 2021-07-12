const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { Command } = require('@oclif/command')

class InitCommand extends Command {
  static args = [
    {
      projectName: 'projectName',
      required: true,
      description: ''
    }
  ];

  async run () {
    const { args } = this.parse(InitCommand)
    const dirName = path.join(__dirname, '../../.checkly')

    if (fs.existsSync(dirName)) {
      consola.error('Project already initialized')
      return process.exit(1)
    }

    fs.mkdirSync(dirName)
    const yml = `project: ${args.projectName}
    locations: ['us-east-1']
    browser: {}
    api: {}
    `
    fs.writeFileSync(path.join(dirName, 'settings.yml'), yml)
    consola.success('Project initialized 🦝')
    return process.exit(0)
  }
}

InitCommand.description = 'Init Checkly CLI'

module.exports = InitCommand
