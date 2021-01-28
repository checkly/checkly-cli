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
    const testFile = path.join('./.checkly', args.name + '.js')
    consola.info('Creating http local server')

    async function bundle () {
      const inputOptions = {
        input: testFile,
        plugins: [commonjs()],
        onwarn: () => {}
      }
      const outputOptions = {
        dir: path.join(__dirname, '../../.checkly/output'),
        format: 'cjs'
      }
      // create a bundle
      const bundle = await rollup.rollup(inputOptions)
      const { output } = await bundle.generate(outputOptions)
      await bundle.write(outputOptions)

      // closes the bundle
      await bundle.close()

      return output
    }

    async function runTest () {
      try {
        await exec('node ' + testFile)
        consola.success('The test passed!')
        return true
      } catch (err) {
        consola.error('The test has some errors')
        consola.error(err)
        return false
      }
    }

    // async function bundle () {
    //   try {
    //     await exec(path.join(__dirname, '../../node_modules/.bin/rollup') + ' ' + testFile + ' --file bundle.js --format cjs')
    //     return true
    //   } catch (err) {
    //     consola.error('The test has some errors')
    //     consola.error(err)
    //     return false
    //   }
    // }

    consola.info('Creating ws local server')
    const wss = new WebSocket.Server({ port: 9999 })
    wss.on('connection', function connection (ws) {
      ws.on('message', function incoming (message) {
        fs.writeFile(testFile, message, async (err) => {
          if (err) {
            throw err
          }

          // success case, the file was saved
          consola.success('Created test file: ' + testFile)
          consola.info('Running script: ' + testFile)

          const spinner = ora().start()
          const res = await runTest()
          spinner.stop()

          if (!res) {
            consola.info('Try to record again a new test')
            return
          }

          const { upload } = await inquirer.prompt([{
            name: 'upload',
            message: 'Would you like to upload the script?',
            type: 'confirm',
            default: 'yes'
          }])

          if (upload) {
            const { checkName } = await inquirer.prompt([{
              name: 'checkName',
              message: 'Enter a friendly name for your check',
              type: 'input',
              default: args.name
            }])

            const [output] = await bundle()

            try {
              await checks.create({ script: output.code, name: checkName })
              consola.success(`Check ${checkName} was uploaded`)
            } catch (err) {
              consola.error(err)
              return process.exit(1)
            }
          }

          return process.exit(0)
        })
      })
    })

    consola.info('Opening chrome, check that headless recorder extension is installed')
    await open('http://localhost:9898', { app: ['google chrome'] })
  }
}

BrowserCommand.description = 'Init Checkly CLI'

module.exports = BrowserCommand
