const path = require('path')
const { default: PQueue } = require('p-queue')
const { Command, flags } = require('@oclif/command')

const { parseChecklyResources } = require('./../parser/resource-parser')
const parser = require('../parser')
const run = require('../modules/run')
const { output } = require('./../services/flags')
const { CHECK_TYPES } = require('../services/constants')
const ListReporter = require('../reporters/list')

const tryPackageParser = async () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  try {
    const packageJson = require(packageJsonPath)
    const checklyConf = packageJson.checkly
    if (!checklyConf) {
      return null
    }
    if (!checklyConf.projectName) {
      return null
    }

    const rootFolder = checklyConf.projectPath ? path.join(process.cwd(), checklyConf.projectPath) : process.cwd()

    return parseChecklyResources(checklyConf.projectName, rootFolder)
  } catch (err) {
    return null
  }
}

class TestCommand extends Command {
  async run () {
    const { flags } = this.parse(TestCommand)
    const { checks, groups } = await tryPackageParser() || await parser()
    const queue = new PQueue({ concurrency: flags.parallel })

    const array = Object.entries(checks).map(([key, check]) => {
      check.logicalId = key
      return check
    })
    const reporter = new ListReporter()
    reporter.onBegin(array)
    for (const check of array) {
      const group = groups[check.groupId?.ref]
      queue.add(async () => {
        reporter.onCheckBegin(check)
        let result
        if (check.checkType === CHECK_TYPES.BROWSER.toUpperCase()) {
          result = await run.browserCheck({ check, group, location: flags.location })
        } else if (check.checkType === CHECK_TYPES.API.toUpperCase()) {
          result = await run.apiCheck({ check, group, location: flags.location })
        } else if (check.checkType === CHECK_TYPES.PROGRAMMABLE.toUpperCase()) {
          result = await run.programmableCheck({ check, group, location: flags.location })
        } else {
          throw new Error('Unsupported check type')
        }
        result.logicalId = check.logicalId
        reporter.onCheckEnd(result)
      })
    }
    await queue.onIdle()
    reporter.onEnd()
    process.exit(0)
  }
}

TestCommand.flags = {
  output,
  location: flags.string({
    char: 'l',
    description: 'Where should the check run at?',
    default: 'eu-central-1',
  }),
  parallel: flags.integer({
    char: 'p',
    description: 'How many check should run in parallel?',
    default: 5,
  }),
}

TestCommand.description = 'Test your checks on Checkly'

module.exports = TestCommand
