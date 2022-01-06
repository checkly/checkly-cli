const consola = require('consola')
const { prompt } = require('inquirer')
const { Command, flags } = require('@oclif/command')

const parser = require('../parser')
const run = require('../modules/run')
const { output } = require('./../services/flags')
const { promptCheck } = require('../services/prompts')
const { CHECK_TYPES } = require('../services/constants')

class RunCommand extends Command {
  static args = [{
    name: 'checkPath',
    required: false,
    description: 'Which check would you like to execute?'
  }]

  async run () {
    const { args, flags } = this.parse(RunCommand)
    const { checks } = await parser()
    let checkPath = args.checkPath

    if (!args.checkPath) {
      const { check } = await prompt([promptCheck({ choices: Object.keys(checks).sort() })])
      checkPath = check
    }

    const check = checks[checkPath]

    if (!check) {
      consola.error(`Check not found, invalid check path ${checkPath}.`)
    }

    check.checkType === CHECK_TYPES.BROWSER
      ? run.browserCheck({ check, location: flags.location })
      : run.apiCheck({ check, location: flags.location })
  }
}

RunCommand.flags = {
  output,
  location: flags.string({
    char: 'l',
    description: 'Where should the check run at?',
    default: 'eu-central-1'
  })
}

RunCommand.description = 'Run and test your checks on Checkly'

module.exports = RunCommand
