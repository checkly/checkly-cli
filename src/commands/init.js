const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { Command } = require('@oclif/command')
const { account } = require('./../services/api')
const config = require('./../services/config')
const { checkTemplate, settingsTemplate } = require('../templates/init')

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
      consola.error(' checkly-cli already initialized')
      consola.debug(` Directory \`${process.cwd()}/.checkly\` already exists\n`)
      return process.exit(1)
    }
    fs.mkdirSync(dirName)

    // Fetch required info
    const { data } = await account.findOne()
    const { accountId, name } = data

    config.set('accountId', accountId)

    // Initial Account Settings
    const accountSettingsYml = settingsTemplate({
      accountId,
      name,
      projectName: args.projectName,
    })

    // Example Check YML
    const exampleCheckYml = checkTemplate()

    // Create Settings File
    fs.writeFileSync(path.join(dirName, 'settings.yml'), accountSettingsYml)

    // Create Checks Directory
    fs.mkdirSync(path.join(dirName, 'checks'))

    // Create Example Check
    fs.writeFileSync(
      path.join(dirName, 'checks', 'example.yml'),
      exampleCheckYml
    )

    consola.success(' Project initialized 🦝🎉 \n')
    consola.info(
      ' You can now create checks via `checkly checks create` or view'
    )
    consola.info(
      ' and adjust the example check generated at `.checkly/checks/example.yml`\n'
    )
    consola.debug(
      ` Generated @checkly/cli settings and folders at \`${process.cwd()}/.checkly\``
    )
    return process.exit(0)
  }
}

InitCommand.description = 'Initialise a new Checkly Project'

module.exports = InitCommand
