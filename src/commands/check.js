const { Command } = require('@oclif/command')

class CheckCommand extends Command {
  async run () {
    console.log('Running the checks...')
  }
}

CheckCommand.description = 'Run Checks'

module.exports = CheckCommand
