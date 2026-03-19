import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import {
  formatPlanSummary,
  formatEntitlementDetail,
  formatFilteredEntitlements,
  getEntitlementUpgradeUrl,
  CONTACT_SALES_URL,
} from '../../formatters/account-plan'
import type { Entitlement } from '../../rest/entitlements'

function withUpgradeUrl (e: Entitlement, checkoutUrl: string) {
  if (e.enabled) return e
  return { ...e, upgradeUrl: getEntitlementUpgradeUrl(e, checkoutUrl) }
}

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
    disabled: Flags.boolean({
      description: 'Show only entitlements not included in your plan.',
      default: false,
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AccountPlan)
    this.style.outputFormat = flags.output

    // Validate: key arg is mutually exclusive with --type, --search, and --disabled
    if (args.key && (flags.type || flags.search || flags.disabled)) {
      this.error('Cannot use --type, --search, or --disabled when looking up a specific entitlement key.')
    }

    let plan
    try {
      const resp = await api.entitlements.getAll()
      plan = resp.data
    } catch (err: any) {
      this.style.longError('Failed to fetch account plan.', err)
      process.exitCode = 1
      return
    }

    const { accountId } = api.getDefaults()
    const checkoutUrl = `https://app.checklyhq.com/accounts/${accountId}/billing/checkout`

    // Single key lookup
    if (args.key) {
      const entitlement = plan.entitlements.find(e => e.key === args.key)
      if (!entitlement) {
        this.error(`Entitlement "${args.key}" not found. Use "checkly account plan" to see available keys.`)
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(withUpgradeUrl(entitlement, checkoutUrl), null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log(formatEntitlementDetail(plan, entitlement, fmt, checkoutUrl))
      return
    }

    // Apply filters (--type, --search, --disabled)
    const hasFilters = flags.type || flags.search || flags.disabled
    let filtered = plan.entitlements

    if (flags.disabled) {
      filtered = filtered.filter(e => !e.enabled)
    }

    if (flags.type) {
      filtered = filtered.filter(e => e.type === flags.type)
    }

    if (flags.search) {
      const term = flags.search.toLowerCase()
      filtered = filtered.filter(e =>
        e.key.toLowerCase().includes(term)
        || e.name.toLowerCase().includes(term)
        || e.description.toLowerCase().includes(term),
      )
    }

    // JSON output (respects filters)
    if (flags.output === 'json') {
      const enriched = filtered.map(e => withUpgradeUrl(e, checkoutUrl))
      if (hasFilters) {
        this.log(JSON.stringify(enriched, null, 2))
      } else {
        this.log(JSON.stringify({
          ...plan,
          checkoutUrl,
          contactSalesUrl: CONTACT_SALES_URL,
          entitlements: enriched,
        }, null, 2))
      }
      return
    }

    const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

    // Filtered view
    if (hasFilters) {
      this.log(formatFilteredEntitlements(plan, filtered, fmt, checkoutUrl))
      return
    }

    // Default summary view
    this.log(formatPlanSummary(plan, fmt, checkoutUrl))
  }
}
