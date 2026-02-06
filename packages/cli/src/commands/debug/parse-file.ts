import path from 'node:path'

import { Command, Flags } from '@oclif/core'

import { Parser } from '../../services/check-parser/parser'
import { detectPackageManager } from '../../services/check-parser/package-files/package-manager'
import { DependencyParseError } from '../../services/check-parser/errors'

export default class ParseFileCommand extends Command {
  static hidden = true
  static description = 'Parses and outputs relevant details of a code file.'

  static flags = {
    'file': Flags.string({
      required: true,
    }),
    'restricted': Flags.boolean({
      default: false,
    }),
    'detect-workspace': Flags.boolean({
      default: true,
      allowNo: true,
    }),
    'supported-module': Flags.string({
      multiple: true,
      default: [],
    }),
    'check-unsupported-modules': Flags.boolean({
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ParseFileCommand)
    const {
      file: codeFile,
      restricted,
      'detect-workspace': detectWorkspace,
      'supported-module': supportedNpmModules,
      'check-unsupported-modules': checkUnsupportedModules,
    } = flags

    const codeDir = path.dirname(codeFile)

    const packageManager = await detectPackageManager(codeDir)

    const workspace = detectWorkspace
      ? await packageManager.lookupWorkspace(codeDir)
      : undefined

    const errors = []
    let result

    try {
      const parser = new Parser({
        workspace,
        restricted,
        supportedNpmModules,
        checkUnsupportedModules,
      })

      result = await parser.parse(codeFile)
    } catch (err: any) {
      if (err instanceof DependencyParseError) {
        errors.push({
          name: err.name,
          message: err.message,
          entrypoint: err.entrypoint,
          missingFiles: err.missingFiles,
          unsupportedNpmDependencies: err.unsupportedNpmDependencies,
          parseErrors: err.parseErrors,
        })
      } else {
        errors.push({
          name: err.name,
          message: err.message,
        })
      }
    }

    const output = {
      errors,
      result,
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, null, 2))
  }
}
