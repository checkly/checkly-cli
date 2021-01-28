const consola = require('consola')
const { Command } = require('@oclif/command')
const fs = require('fs')
const path = require('path')
class InitCommand extends Command {
  static args = [
    {
      name: 'name',
      required: false,
      description: ''
    }
  ];

  async run () {
    const { args } = this.parse(InitCommand)

    const dirName = path.join(__dirname, '../../.checkly2')

    const fs = require('fs') // Or `import fs from "fs";` with ESM
    if (fs.existsSync(dirName)) {
      consola.error('Project already initialized')
      return process.exit(1)
    }

    fs.mkdirSync(dirName)
    const yml = `yaml:
    - A complete JavaScript implementation
    - https://www.npmjs.com/package/yaml
    `
    fs.writeFileSync(path.join(dirName, 'settings.yml'), yml)
    consola.success('Project initialized 🦝')
    return process.exit(0)
  }
}

InitCommand.description = 'Init Checkly CLI'

module.exports = InitCommand
