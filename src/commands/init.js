const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { Command } = require('@oclif/command')
const { prompt } = require('inquirer')

const config = require('./../services/config')
const { force } = require('./../services/flags')
const { projects } = require('./../services/api')
const { getRepoUrl } = require('./../services/utils')

const apiTemplates = require('../templates/api')
const browserTemplates = require('../templates/browser')
const projectTemplate = require('../templates/project')

const API = 'API'
const BROWSER = 'BROWSER'

const BASIC = 'basic'
const ADVANCED = 'advanced'

// TODO: Move this into a service
function createChecklyDirectory({ dirName, mode, checkTypes, url }) {
  fs.mkdirSync(dirName)
  fs.mkdirSync(path.join(dirName, 'checks'))

  if (checkTypes.includes(API)) {
    fs.writeFileSync(
      path.join(dirName, 'checks', 'example-api.yml'),
      apiTemplates[mode]({ url })
    )
  }

  if (checkTypes.includes(BROWSER)) {
    fs.writeFileSync(
      path.join(dirName, 'checks', 'example-browser.yml'),
      browserTemplates[mode]({ url })
    )
  }
}

function createProjectFile({ dirName, projectName, projectId }) {
  const projectYml = projectTemplate({
    projectName,
    projectId,
  })

  fs.writeFileSync(path.join(dirName, 'settings.yml'), projectYml)
}

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
    const cwd = process.cwd()
    const dirName = path.join(cwd, './.checkly')

    if (fs.existsSync(dirName)) {
      consola.error(' checkly-cli already initialized')
      consola.debug(` Directory \`${process.cwd()}/.checkly\` already exists\n`)
      return process.exit(1)
    }

    const { checkTypes, url, mode } = await prompt([
      {
        name: 'checkTypes',
        type: 'checkbox',
        message: 'What do you want to monitor?',
        validate: (checkTypes) =>
          checkTypes.length > 0 ? true : 'You have to pick at least one type',
        choices: [API, BROWSER],
        default: [API],
      },
      {
        name: 'url',
        type: 'input',
        validate: (url) =>
          url.match(/^(https?|chrome):\/\/[^\s$.?#].[^\s]*$/gm)
            ? true
            : 'Please enter a valid URL',
        message: 'Which URL would you like to monitor?',
      },
      {
        name: 'mode',
        type: 'list',
        message:
          'Which kind of setup do you want to use?\n(if it\'s your first time with Checkly, we recommend to keep with "Basic")',
        choices: [BASIC, ADVANCED],
        default: BASIC,
      },
    ])

    const { data: project } = await projects.create({
      accountId: config.getAccountId(),
      name: args.projectName,
      repoUrl: await getRepoUrl(cwd),
      activated: true,
      muted: false,
      state: {},
    })

    createChecklyDirectory({ url, mode, checkTypes, dirName })
    createProjectFile({
      dirName,
      projectName: args.projectName,
      projectId: project.id,
    })

    consola.success(' Project initialized 🎉 \n')
    consola.info(' You can now create checks via `checkly checks create`')
    consola.info(
      ' Or check out the example check generated at `.checkly/checks/example.yml`\n'
    )
    consola.debug(
      ` Generated @checkly/cli settings and folders at \`${cwd}/.checkly\``
    )
    return process.exit(0)
  }
}

InitCommand.description = 'Initialise a new Checkly Project'

InitCommand.flags = {
  force,
}

module.exports = InitCommand
