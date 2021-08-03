const fs = require('fs')
const { readFile } = require('fs/promises')
const path = require('path')
const consola = require('consola')
const { Command } = require('@oclif/command')
const { account, projects } = require('./../services/api')
const config = require('./../services/config')
const { defaultCheckTemplate, settingsTemplate } = require('../templates/init')

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

    // Example Check YML
    const exampleCheckYml = defaultCheckTemplate()

    // Create Checks Directory
    fs.mkdirSync(path.join(dirName, 'checks'))

    // Create Example Check
    fs.writeFileSync(
      path.join(dirName, 'checks', 'example.yml'),
      exampleCheckYml
    )

    // Get package.json
    const pkg = JSON.parse(
      await readFile(path.join(__dirname, '../../package.json'))
    )

    // Grab repository name from repo url
    const repo = pkg.repository.url.match(
      /.*\/(?<author>[\w,\-,_]+)\/(?<project>[\w,\-,_]+)(.git)?$/
    )

    // Create project on backend
    const savedProject = await projects.create({
      accountId,
      repoUrl: `${repo.groups.author}/${repo.groups.project}`,
      name: args.projectName,
      activated: true,
      muted: false,
    })

    // Generate initial account settings
    const accountSettingsYml = settingsTemplate({
      accountId,
      accountName: name,
      projectName: args.projectName,
      projectId: savedProject.data.id,
    })

    // Write settings file
    fs.writeFileSync(path.join(dirName, 'settings.yml'), accountSettingsYml)

    consola.success(' Project initialized 🎉 \n')
    consola.info(' You can now create checks via `checkly checks create`')
    consola.info(
      ' Or check out the example check generated at `.checkly/checks/example.yml`\n'
    )
    consola.debug(
      ` Generated @checkly/cli settings and folders at \`${process.cwd()}/.checkly\``
    )
    return process.exit(0)
  }
}

InitCommand.description = 'Initialise a new Checkly Project'

module.exports = InitCommand
