const { flags } = require('@oclif/command')

const config = require('../services/config')
const defaultOutput = config.data.get('output')

module.exports = {
  output: flags.string({
    char: 'o',
    description: 'output type',
    default: defaultOutput,
    options: ['plain', 'human', 'json'],
  }),

  force: flags.string({
    char: 'f',
    description: 'force mode',
    default: false,
  }),
}
