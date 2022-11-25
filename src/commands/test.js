const { default: PQueue } = require('p-queue')
const { Command, flags } = require('@oclif/command')

const parser = require('../parser')
const run = require('../modules/run')
const { output } = require('./../services/flags')
const { CHECK_TYPES } = require('../services/constants')
const ListReporter = require('../reporters/list')

class TestCommand extends Command {
  async run () {
    const { flags } = this.parse(TestCommand)
    const { checks, groups } = await parser()
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
        const result = check.checkType === CHECK_TYPES.BROWSER.toUpperCase()
          ? await run.browserCheck({ check, group, location: flags.location })
          : await run.apiCheck({ check, group, location: flags.location })
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
