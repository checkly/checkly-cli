import { Command, Flags } from '@oclif/core'

import { parseProject } from '../../services/project-parser.js'
import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import {
  Diagnostics,
  Session,
} from '../../constructs/index.js'
import { splitConfigFilePath } from '../../services/util.js'
import commonMessages from '../../messages/common-messages.js'
import { loadSnapshot, Runtime } from '../../runtimes/index.js'
import { Bundler } from '../../services/check-parser/bundler.js'

export type ParseProjectOutput = {
  diagnostics: {
    fatal: boolean
    benign: boolean
    observations: {
      title: string
      message: string
      fatal: boolean
      benign: boolean
    }[]
  }
  payload: {
    project: {
      logicalId: string
      name: string
    }
    sharedFiles: {
      path: string
      content: string
    }[]
    resources: {
      logicalId: string
      type: string
      member: boolean
      payload: unknown
    }[]
  }
}

export default class ParseProjectCommand extends Command {
  static hidden = true
  static description = 'Parses a Checkly project.'

  static flags = {
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
      env: 'CHECKLY_CONFIG_FILE',
    }),
    'default-runtime': Flags.string({
      description: 'The default runtime to use if none is specified.',
      default: '2025.04',
      env: 'CHECKLY_DEFAULT_RUNTIME',
    }),
    'verify-runtime-dependencies': Flags.boolean({
      description: '[default: true] Return an error if checks import dependencies that are not supported by the selected runtime.',
      default: true,
      allowNo: true,
      env: 'CHECKLY_VERIFY_RUNTIME_DEPENDENCIES',
    }),
    'emulate-pw-test': Flags.boolean({
      description: 'Pretend to be the pw-test command. Affects validation.',
      env: 'CHECKLY_EMULATE_PW_TEST',
    }),
    'include': Flags.string({
      description: 'File patterns to include when bundling the test project (e.g., "utils/**/*").',
      multiple: true,
      default: [],
    }),
    'inject-private-location': Flags.string({
      description: 'Pretend that the given private location exists (e.g., "70c4ded4-2229-45a7-acf4-6b1eb56a86df:my-external-private-location").',
      multiple: true,
      delimiter: ',',
      default: [],
    }),
    'stats': Flags.boolean({
      description: 'Print parse/bundle/synthesize timing and heap usage to stderr. '
        + 'Run with NODE_OPTIONS=--expose-gc to also report the retained (post-GC) heap.',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ParseProjectCommand)
    const {
      config: configFilename,
      'default-runtime': defaultRuntime,
      'verify-runtime-dependencies': verifyRuntimeDependencies,
      'emulate-pw-test': emulatePwTest,
      'include': includeFlag,
      'inject-private-location': injectPrivateLocation,
      'stats': stats,
    } = flags

    // Optional heap/timing instrumentation. When --stats is set, sample the
    // heap across the async parse/bundle/synthesize steps (peak), and report
    // per-step durations. JS is single-threaded, so the sampler only fires
    // between awaits — which is exactly where allocations settle.
    const startedAt = performance.now()
    let peakHeapUsed = 0
    let peakRss = 0
    const sampler = stats
      ? setInterval(() => {
          const usage = process.memoryUsage()
          peakHeapUsed = Math.max(peakHeapUsed, usage.heapUsed)
          peakRss = Math.max(peakRss, usage.rss)
        }, 5)
      : undefined
    sampler?.unref()
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const availableRuntimes = await loadSnapshot()

    try {
      if (injectPrivateLocation) {
        Session.privateLocations = injectPrivateLocation.map(loc => {
          const [id, ...rest] = loc.split(':')
          return {
            id,
            slugName: rest.join(':'),
          }
        })
      }

      const parseStartedAt = performance.now()
      const project = await parseProject({
        directory: configDirectory,
        projectLogicalId: checklyConfig.logicalId,
        projectName: checklyConfig.projectName,
        repoUrl: checklyConfig.repoUrl,
        checkMatch: checklyConfig.checks?.checkMatch,
        browserCheckMatch: checklyConfig.checks?.browserChecks?.testMatch,
        multiStepCheckMatch: checklyConfig.checks?.multiStepChecks?.testMatch,
        ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
        checkDefaults: checklyConfig.checks,
        browserCheckDefaults: checklyConfig.checks?.browserChecks,
        availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
          acc[runtime.name] = runtime
          return acc
        }, <Record<string, Runtime>> {}),
        defaultRuntimeId: defaultRuntime,
        verifyRuntimeDependencies,
        checklyConfigConstructs,
        playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
        include: includeFlag.length ? includeFlag : checklyConfig.checks?.include,
        playwrightChecks: checklyConfig.checks?.playwrightChecks,
        loadPlaywrightChecksOnly: emulatePwTest,
        warnOnWebServerConfig: emulatePwTest && !(includeFlag.length > 0),
      })
      const parseMs = performance.now() - parseStartedAt

      const diagnostics = new Diagnostics()
      await project.validate(diagnostics)

      let bundleMs = 0
      let synthesizeMs = 0
      const payload = await (async () => {
        if (diagnostics.isFatal()) {
          return null
        }

        const bundler = await Bundler.createForWorkspace(Session.workspace.unwrap())

        const bundleStartedAt = performance.now()
        const bundle = await project.bundle(bundler)

        const archive = await bundler.finalize()
        bundler.updateMarker(archive.archiveFile)
        bundleMs = performance.now() - bundleStartedAt

        const synthesizeStartedAt = performance.now()
        const synthesized = bundle.synthesize()
        synthesizeMs = performance.now() - synthesizeStartedAt
        return synthesized
      })()

      const output = {
        diagnostics: {
          fatal: diagnostics.isFatal(),
          benign: diagnostics.isBenign(),
          observations: diagnostics.observations.map(diag => {
            return {
              title: diag.title,
              message: diag.message,
              fatal: diag.isFatal(),
              benign: diag.isBenign(),
            }
          }),
        },
        payload,
      }

      if (stats) {
        if (sampler !== undefined) {
          clearInterval(sampler)
        }
        const constructs = Object.values(project.data)
          .reduce((total, record) => total + Object.keys(record).length, 0)
        const heapUsedAfterBytes = process.memoryUsage().heapUsed
        // The retained (live) heap once the work is done — only available when
        // the process is started with --expose-gc.
        const maybeGc = (globalThis as { gc?: () => void }).gc
        let retainedHeapBytes: number | undefined
        if (maybeGc !== undefined) {
          for (let i = 0; i < 4; i++) {
            maybeGc()
          }
          retainedHeapBytes = process.memoryUsage().heapUsed
        }
        const report = {
          constructs,
          resources: payload?.resources?.length ?? 0,
          parseMs: Math.round(parseMs),
          bundleMs: Math.round(bundleMs),
          synthesizeMs: Math.round(synthesizeMs),
          totalMs: Math.round(performance.now() - startedAt),
          peakHeapUsedBytes: peakHeapUsed,
          heapUsedAfterBytes,
          retainedHeapBytes,
          peakRssBytes: peakRss,
        }
        process.stderr.write(`parse-project stats ${JSON.stringify(report)}\n`)
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(output, null, 2))
    } catch (err: any) {
      const output = {
        errors: [{
          name: err.name,
          message: err.message,
        }],
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(output, null, 2))
    }
  }
}
