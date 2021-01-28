// const { nodeResolve } = require('@rollup/plugin-node-resolve')
const inquirer = require('inquirer')
const rollup = require('rollup')
// const { babel } = require('@rollup/plugin-babel')
const commonjs = require('@rollup/plugin-commonjs')
const consola = require('consola')
const { Command } = require('@oclif/command')
const WebSocket = require('ws')
const open = require('open')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const ora = require('ora')
const { yml, update } = require('../yml')

// const raccoon = require('../raccoon')
// const config = require('../config')
const { checks } = require('../sdk')
require('../server')

const path = require('path')
const fs = require('fs')

class BrowserCommand extends Command {
  static args = [
    {
      name: 'name',
      required: true,
      description:
        'Check name'
    }
  ];

  async run () {
    const { args } = this.parse(BrowserCommand)
    const testFile = path.join('./.checkly', args.name + '.api.js')

    if (yml.api[args.name]) {
      const { exists } = await inquirer.prompt([{
        name: 'exists',
        message: `The browser check ${args.name} already exists, do you want to overwrite it?`,
        type: 'confirm',
        default: args.name
      }])

      if (!exists) {
        return process.exit(0)
      }
    }

    yml.api[args.name] = yml.api[args.name] || {
      file: args.name + '.api.js',
      activated: true
    }

    const sample = `
    it('Async test', async done => {
      done()
    })
    `

    fs.writeFileSync(testFile, sample, 'utf8')

    update(yml)

    process.exit(0)
  }
}

BrowserCommand.description = 'Init Checkly CLI'

module.exports = BrowserCommand
