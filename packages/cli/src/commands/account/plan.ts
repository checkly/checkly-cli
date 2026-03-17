import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import {
  formatPlanSummary,
  formatEntitlementDetail,
  formatFilteredEntitlements,
} from '../../formatters/account-plan'

export default class AccountPlan extends AuthCommand {
  static coreCommand = false
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Show your account plan, entitlements, and feature limits.'

  static args = {
    key: Args.string({
      required: false,
      description: 'Entitlement key to look up (e.g. BROWSER_CHECKS). Shows detail view.',
    }),
  }

  static flags = {
    type: Flags.string({
      char: 't',
      description: 'Filter entitlements by type.',
      options: ['metered', 'flag'],
    }),
    search: Flags.string({
      char: 's',
      description: 'Search entitlements by name or description.',
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AccountPlan)
    this.style.outputFormat = flags.output

    // Validate: key arg is mutually exclusive with --type and --search
    if (args.key && (flags.type || flags.search)) {
      this.error('Cannot use --type or --search when looking up a specific entitlement key.')
    }

    try {
      const { data: plan } = await api.entitlements.getAll()

      // Single key lookup
      if (args.key) {
        const entitlement = plan.entitlements.find(e => e.key === args.key)
        if (!entitlement) {
          this.error(`Entitlement "${args.key}" not found. Use "checkly account plan" to see available keys.`)
        }

        if (flags.output === 'json') {
          this.log(JSON.stringify(entitlement, null, 2))
          return
        }

        const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
        this.log(formatEntitlementDetail(plan, entitlement, fmt))
        return
      }

      // Full JSON output
      if (flags.output === 'json') {
        this.log(JSON.stringify(plan, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      // Filtered view
      if (flags.type || flags.search) {
        let filtered = plan.entitlements

        if (flags.type) {
          filtered = filtered.filter(e => e.type === flags.type)
        }

        if (flags.search) {
          const term = flags.search.toLowerCase()
          filtered = filtered.filter(e =>
            e.name.toLowerCase().includes(term)
            || e.description.toLowerCase().includes(term),
          )
        }

        this.log(formatFilteredEntitlements(plan, filtered, fmt))
        return
      }

      // Default summary view
      this.log(formatPlanSummary(plan, fmt))
    } catch (err: any) {
      this.style.longError('Failed to fetch account plan.', err)
      process.exitCode = 1
    }
  }
}
