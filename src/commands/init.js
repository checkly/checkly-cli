const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')
const { Command } = require('@oclif/command')

const config = require('./../services/config')
const { force } = require('./../services/flags')
const { projects } = require('./../services/api')
const { promptUrl } = require('../services/prompts')
const { getRepoUrl } = require('./../services/utils')
const { CONFIGURATION_MODES, CHECK_TYPES } = require('./../services/constants')

const apiTemplates = require('../templates/api')
const browserTemplates = require('../templates/browser')
const projectTemplate = require('../templates/project')

// TODO: Move this into a service
function createChecklyDirectory ({ dirName, mode, checkTypes, url }) {
  fs.mkdirSync(dirName)
  fs.mkdirSync(path.join(dirName, 'checks'))

  if (checkTypes.includes(CHECK_TYPES.API)) {
    fs.writeFileSync(
      path.join(dirName, 'checks', 'example-api.yml'),
      apiTemplates[mode]({ url })
    )
  }

  if (checkTypes.includes(CHECK_TYPES.BROWSER)) {
    fs.writeFileSync(
      path.join(dirName, 'checks', 'example-browser.yml'),
      browserTemplates[mode]({ url })
    )
  }
}

function createProjectFile ({ dirName, projectName, projectId }) {
  const projectYml = projectTemplate({
    projectName,
    projectId
  })

  fs.writeFileSync(path.join(dirName, 'settings.yml'), projectYml)
}

class InitCommand extends Command {
  static args = [
    {
      name: 'projectName',
      required: true,
      description: 'Project name',
      default: path.basename(process.cwd())
    }
  ]

  async run () {
    const { args, flags } = this.parse(InitCommand)
    const { force } = flags
    const cwd = process.cwd()
    const dirName = path.join(cwd, '.checkly')
    let project = {}

    if (fs.existsSync(dirName)) {
      consola.error(' checkly-cli already initialized')
      consola.debug(` Directory \`${cwd}/.checkly\` already exists\n`)
      return process.exit(1)
    }

    try {
      const { data } = await projects.create({
        accountId: config.getAccountId(),
        name: args.projectName,
        repoUrl: await getRepoUrl(cwd),
        activated: true,
        muted: false,
        state: {}
      })
      project = data
    } catch (e) {
      consola.error('Failed to create project - please try again.')
      throw new Error(e)
    }

    if (!force) {
      const { checkTypes, url, mode } = await prompt([
        {
          name: 'checkTypes',
          type: 'checkbox',
          message: 'What do you want to monitor?',
          validate: (checkTypes) =>
            checkTypes.length > 0 ? true : 'You have to pick at least one type',
          choices: [CHECK_TYPES.API, CHECK_TYPES.BROWSER],
          default: [CHECK_TYPES.API]
        },
        promptUrl,
        {
          name: 'mode',
          type: 'list',
          message:
            'Which kind of setup do you want to use?\n(if it\'s your first time with Checkly, we recommend to keep with "Basic")',
          choices: [CONFIGURATION_MODES.BASIC, CONFIGURATION_MODES.ADVANCED],
          default: CONFIGURATION_MODES.BASIC
        }
      ])
      createChecklyDirectory({ url, mode, checkTypes, dirName })
    } else {
      createChecklyDirectory({
        url: 'https://google.com',
        mode: 'basic',
        checkTypes: CHECK_TYPES.API,
        dirName
      })
    }

    createProjectFile({
      dirName,
      projectName: args.projectName,
      projectId: project.id
    })

    consola.success(' Project initialized 🎉 \n')
    consola.info(' You can now create checks via `checkly add`')
    consola.info(
      ' Or check out the example check generated under `.checkly/checks/`\n'
    )
    consola.debug(
      ` Generated @checkly/cli settings and folders at \`${cwd}/.checkly\``
    )
    return process.exit(0)
  }
}

InitCommand.description = 'Initialise a new Checkly Project'

InitCommand.flags = {
  force
}

module.exports = InitCommand
