import * as api from '../../rest/api'
import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { forceFlag } from '../../helpers/flags'

export default class EnvRm extends AuthCommand {
  static hidden = false
  static destructive = true
  static description = 'Remove environment variable via "checkly env rm <key>".'

  static flags = {
    force: forceFlag(),
  }

  static args = {
    key: Args.string({
      name: 'key',
      required: true,
      description: 'Environment variable key to remove.',
    }),
  }

  async run (): Promise<void> {
    const { flags, args } = await this.parse(EnvRm)
    const envVariableKey = args.key

    await this.confirmOrAbort({
      command: 'env rm',
      description: 'Delete environment variable',
      changes: [
        `Will delete environment variable "${envVariableKey}"`,
      ],
      flags,
      args,
      classification: {
        readOnly: EnvRm.readOnly,
        destructive: EnvRm.destructive,
        idempotent: EnvRm.idempotent,
      },
    }, { force: flags.force })

    try {
      await api.environmentVariables.delete(envVariableKey)
      this.style.shortSuccess(`Environment variable "${envVariableKey}" deleted.`)
    } catch (err: any) {
      this.style.longError(`Your environment variable could not be removed.`, err)
      this.exit(1)
    }
  }
}
