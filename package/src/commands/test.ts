import * as fs from 'node:fs/promises'
import { Command, Flags } from '@oclif/core'
import { parse } from 'dotenv'
import { runtimes } from '../rest/api'
import ListReporter from '../reporters/list'
import { parseProject } from '../services/project-parser'
import CheckRunner, { Events } from '../services/check-runner'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { filterByFileNamePattern, filterByCheckNamePattern } from '../services/test-filters'
import type { Runtime } from '../rest/runtimes'

async function getEnvs (envFile: string|undefined, envArgs: Array<string>) {
  if (envFile) {
    const envsString = await fs.readFile(envFile, { encoding: 'utf8' })
    return parse(envsString)
  }
  const envsString = `${envArgs.join('\n')}`
  return parse(envsString)
}

export default class Test extends Command {
  static description = 'Test checks on Checkly'
  static flags = {
    location: Flags.string({
      char: 'l',
      description: 'The location to run the checks at.',
      default: 'eu-central-1',
    }),
    grep: Flags.string({
      char: 'g',
      description: 'Only run checks where the check name matches a regular expression.',
      default: '.*',
    }),
    env: Flags.string({
      char: 'e',
      description: 'Env vars to be passed to the test run.',
      exclusive: ['env-file'],
      multiple: true,
      default: [],
    }),
    'env-file': Flags.string({
      description: 'dotenv file path to be passed.',
      exclusive: ['env'],
    }),
  }

  static auth = true

  static args = [
    {
      name: 'files',
      required: false,
      description: 'Only run checks where the file name matches a regular expression',
      default: '.*',
    },
  ]

  static strict = false

  async run (): Promise<void> {
    const { flags, argv: filePatterns } = await this.parse(Test)
    const {
      location,
      grep,
      env,
      'env-file': envFile,
    } = flags
    const cwd = process.cwd()

    const testEnvVars = await getEnvs(envFile, env)
    const checklyConfig = await loadChecklyConfig(cwd)
    const { data: avilableRuntimes } = await runtimes.getAll()
    const project = await parseProject({
      directory: cwd,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.checkMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
      runtimeId: checklyConfig.checks?.runtimeId,
      availableRuntimes: avilableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
    })
    const { checks: checksMap, groups: groupsMap } = project.data
    const checks = Object.entries(checksMap)
      .filter(([_, check]) => {
        return filterByFileNamePattern(filePatterns, check.scriptPath) ||
          filterByFileNamePattern(filePatterns, check.__checkFilePath)
      })
      .filter(([_, check]) => {
        return filterByCheckNamePattern(grep, check.name)
      })
      .map(([key, check]) => {
        check.logicalId = key
        if (Object.keys(testEnvVars).length) {
          check.environmentVariables = check.environmentVariables
            ?.filter((envVar: any) => !testEnvVars[envVar.key]) || []
          for (const [key, value] of Object.entries(testEnvVars)) {
            check.environmentVariables.push({
              key,
              value,
              locked: true,
            })
          }
        }
        // TODO: Add the group to check in a cleaner form
        if (check.groupId) {
          check.group = groupsMap[check.groupId.ref]
          delete check.groupId
        }
        return check
      })
    const reporter = new ListReporter(checks)
    const runner = new CheckRunner(checks, location)
    runner.on(Events.CHECK_INPROGRESS, (check) => {
      reporter.onCheckBegin(check)
    })
    runner.on(Events.CHECK_SUCCESSFUL, (check, result) => {
      if (result.hasFailures) {
        process.exitCode = 1
      }
      reporter.onCheckEnd({
        logicalId: check.logicalId,
        ...result,
      })
    })
    runner.on(Events.CHECK_FAILED, (check, message) => {
      // TODO: We need a different handling here given we have no result here
      console.error('Scheduler failure', message)
      process.exitCode = 1
    })
    runner.on(Events.RUN_FINISHED, () => reporter.onEnd())
    await runner.run()
  }
}
