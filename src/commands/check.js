const { Command } = require('@oclif/command')

// Jest might add a better API for running in the future https://github.com/facebook/jest/issues/5048
const jest = require('jest')

class CheckCommand extends Command {
  async run () {
    console.log('Running the checks...')

    await jest.run(`--config='${__dirname}/../services/jest-config.js'`)   
  }
}

CheckCommand.description = 'Run Checks'

module.exports = CheckCommand
