import chalk from 'chalk'
import type { Entitlement, AccountPlan, AccountLocations } from '../rest/entitlements'
import {
  type OutputFormat,
  type ColumnDef,
  type DetailField,
  renderTable,
  renderDetailFields,
} from './render'

// --- Shared helpers ---

function formatEnabled (enabled: boolean, format: OutputFormat): string {
  const label = enabled ? 'Yes' : 'No'
  if (format === 'md') return label
  return enabled ? chalk.green(label) : chalk.red(label)
}

// --- Upgrade path helper ---

export function formatUpgradePath (e: Entitlement): string | null {
  if (e.enabled) return null
  const parts: string[] = []

  if (e.requiredPlan) {
    const planName = e.requiredPlanDisplayName || titleCase(e.requiredPlan)
    parts.push(`${planName} plan`)
  }

  if (e.requiredAddon) {
    const addonName = e.requiredAddon.displayName || titleCase(e.requiredAddon.name)
    const tierName = e.requiredAddon.tierDisplayName || titleCase(e.requiredAddon.tier.replace(/^TIER_/, ''))
    parts.push(`${addonName} ${tierName} add-on`)
  }

  return parts.length > 0 ? parts.join(' + ') : null
}

function titleCase (s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// --- Locations helper ---

export function formatLocations (locations: AccountLocations, format: OutputFormat): string {
  const available = locations.all.filter(l => l.available)
  const total = locations.all.length
  const summary = `${available.length} of ${total} available (max ${locations.maxPerCheck} per check)`

  const lines: string[] = []
  if (format === 'md') {
    lines.push(`**Locations:** ${summary}`)
  } else {
    lines.push(`${chalk.cyan.bold('Locations:')} ${summary}`)
  }

  // Only list individual names when not all are available
  if (available.length < total && available.length > 0) {
    const names = available.map(l => l.name).join(', ')
    if (format === 'md') {
      lines.push('')
      lines.push(names)
    } else {
      lines.push(`  ${chalk.dim(names)}`)
    }
  }

  return lines.join('\n')
}

// --- Column definitions ---

const NAME_WIDTH = 50
const UPGRADE_WIDTH = 45
export const CONTACT_SALES_URL = 'https://www.checklyhq.com/contact-sales/'
const CONTACT_SALES_LABEL = 'Contact sales'

/**
 * Returns the appropriate upgrade URL for a disabled entitlement:
 * - CONTRACT plan → contact sales
 * - Self-serve plan/addon → billing checkout
 * - No upgrade data → contact sales (fallback)
 */
export function getEntitlementUpgradeUrl (e: Entitlement, checkoutUrl: string): string {
  if (e.requiredPlan === 'CONTRACT') return CONTACT_SALES_URL
  if (e.requiredPlan || e.requiredAddon) return checkoutUrl
  return CONTACT_SALES_URL
}

function upgradeLabel (e: Entitlement): string {
  if (e.enabled) return '-'
  return formatUpgradePath(e) ?? CONTACT_SALES_LABEL
}

const upgradeColumn: ColumnDef<Entitlement> = {
  header: 'Required Upgrade',
  width: UPGRADE_WIDTH,
  value: e => upgradeLabel(e),
}

const meteredColumns: ColumnDef<Entitlement>[] = [
  {
    header: 'Name',
    width: NAME_WIDTH,
    value: e => e.name,
  },
  {
    header: 'Limit',
    width: 10,
    align: 'right',
    value: e => e.quantity !== undefined ? String(e.quantity) : '-',
  },
  upgradeColumn,
  {
    header: 'Key',
    value: e => chalk.dim(e.key),
  },
]

const flagColumns: ColumnDef<Entitlement>[] = [
  {
    header: 'Name',
    width: NAME_WIDTH,
    value: e => e.name,
  },
  {
    header: 'Enabled',
    width: 10,
    value: (e, format) => formatEnabled(e.enabled, format),
  },
  upgradeColumn,
  {
    header: 'Key',
    value: e => chalk.dim(e.key),
  },
]

const mixedColumns: ColumnDef<Entitlement>[] = [
  {
    header: 'Name',
    width: NAME_WIDTH,
    value: e => e.name,
  },
  {
    header: 'Type',
    width: 10,
    value: e => e.type,
  },
  {
    header: 'Enabled',
    width: 10,
    value: (e, fmt) => formatEnabled(e.enabled, fmt),
  },
  {
    header: 'Limit',
    width: 10,
    align: 'right',
    value: e => e.type === 'metered' && e.quantity !== undefined ? String(e.quantity) : '-',
  },
  upgradeColumn,
  {
    header: 'Key',
    value: e => chalk.dim(e.key),
  },
]

// --- Detail view fields ---

const detailFields = (upgradeUrl: string): DetailField<Entitlement>[] => [
  { label: 'Key', value: e => e.key },
  { label: 'Name', value: e => e.name },
  { label: 'Description', value: e => e.description },
  { label: 'Type', value: e => e.type },
  {
    label: 'Enabled',
    value: (e, format) => formatEnabled(e.enabled, format),
  },
  {
    label: 'Limit',
    value: e => e.type === 'metered' && e.quantity !== undefined ? String(e.quantity) : null,
  },
  {
    label: 'Required Upgrade',
    value: e => e.enabled ? null : (formatUpgradePath(e) ?? CONTACT_SALES_LABEL),
  },
  {
    label: 'Upgrade Link',
    value: e => e.enabled ? null : getEntitlementUpgradeUrl(e, upgradeUrl),
  },
]

// --- Row highlighting ---

/**
 * Post-process a rendered table to highlight rows where the entitlement
 * is disabled (needs an upgrade). Applies magenta to the full row.
 * Line 0 is the header — left untouched.
 */
function highlightDisabledRows (tableStr: string, items: Entitlement[]): string {
  const tableLines = tableStr.split('\n')
  return tableLines.map((line, i) => {
    if (i === 0) return line // header row
    const item = items[i - 1]
    if (item && !item.enabled) return chalk.magenta(line)
    return line
  }).join('\n')
}

// --- Public formatting functions ---

export function formatPlanHeader (plan: AccountPlan, format: OutputFormat, upgradeUrl?: string): string {
  const lines: string[] = []

  if (format === 'md') {
    lines.push(`# Plan: ${plan.planDisplayName}`)
    if (upgradeUrl) {
      lines.push(`Self-service upgrade: ${upgradeUrl}`)
      lines.push(`For Enterprise: ${CONTACT_SALES_URL}`)
    }
  } else {
    lines.push(`${chalk.cyan.bold('Plan:')} ${chalk.bold(plan.planDisplayName)}`)
    if (upgradeUrl) {
      lines.push(`${chalk.cyan.bold('Self-service upgrade:')} ${chalk.underline(upgradeUrl)}`)
      lines.push(`${chalk.cyan.bold('For Enterprise:')} ${chalk.underline(CONTACT_SALES_URL)}`)
    }
  }

  // Locations
  if (plan.locations) {
    lines.push('')
    lines.push(formatLocations(plan.locations, format))
  }

  const addonEntries: string[] = []
  if (plan.addons.communicate) {
    addonEntries.push(`Communicate: ${plan.addons.communicate.tierDisplayName}`)
  }
  if (plan.addons.resolve) {
    addonEntries.push(`Resolve: ${plan.addons.resolve.tierDisplayName}`)
  }

  if (addonEntries.length > 0) {
    lines.push('')
    if (format === 'md') {
      lines.push('## Add-ons')
      lines.push('')
      for (const entry of addonEntries) {
        lines.push(`- ${entry}`)
      }
    } else {
      lines.push(chalk.cyan.bold('Add-ons:'))
      for (const entry of addonEntries) {
        lines.push(`  ${entry}`)
      }
    }
  }

  return lines.join('\n')
}

export function formatPlanSummary (plan: AccountPlan, format: OutputFormat, upgradeUrl?: string): string {
  const metered: Entitlement[] = []
  const enabledFlags: Entitlement[] = []
  const disabledFlags: Entitlement[] = []
  let enabledMeteredCount = 0

  for (const e of plan.entitlements) {
    if (e.type === 'metered') {
      metered.push(e)
      if (e.enabled) enabledMeteredCount++
    } else if (e.enabled) {
      enabledFlags.push(e)
    } else {
      disabledFlags.push(e)
    }
  }

  const lines: string[] = []

  lines.push(formatPlanHeader(plan, format, upgradeUrl))
  lines.push('')

  // Metered entitlements table
  if (format === 'md') {
    lines.push(`## Metered entitlements (${enabledMeteredCount} of ${metered.length} enabled)`)
  } else {
    lines.push(chalk.cyan.bold(`Metered entitlements (${enabledMeteredCount} of ${metered.length} enabled):`))
  }
  lines.push('')
  const tableStr = renderTable(meteredColumns, metered, format)
  lines.push(format === 'terminal' ? highlightDisabledRows(tableStr, metered) : tableStr)

  // Flag summary line
  lines.push('')
  if (format === 'md') {
    lines.push(`${enabledFlags.length} additional features enabled, ${disabledFlags.length} not included in your plan.`)
    lines.push('Use `--type flag` to see feature details, `--disabled` to see only missing features, or `--search` to filter.')
  } else {
    lines.push(
      `${chalk.green.bold(String(enabledFlags.length))} additional features enabled, `
      + `${chalk.magenta.bold(String(disabledFlags.length))} not included in your plan.`,
    )
    lines.push(chalk.dim('Use --type flag to see feature details, --disabled to see only missing features, or --search to filter.'))
  }

  return lines.join('\n')
}

export function formatEntitlementDetail (
  plan: AccountPlan,
  entitlement: Entitlement,
  format: OutputFormat,
  upgradeUrl?: string,
): string {
  const lines: string[] = []

  lines.push(formatPlanHeader(plan, format, upgradeUrl))
  lines.push('')
  lines.push(renderDetailFields('Entitlement', detailFields(upgradeUrl || ''), entitlement, format))

  return lines.join('\n')
}

export function formatFilteredEntitlements (
  plan: AccountPlan,
  filtered: Entitlement[],
  format: OutputFormat,
  upgradeUrl?: string,
): string {
  const lines: string[] = []

  lines.push(formatPlanHeader(plan, format, upgradeUrl))
  lines.push('')

  if (filtered.length === 0) {
    lines.push(format === 'md' ? 'No matching entitlements found.' : chalk.dim('No matching entitlements found.'))
    return lines.join('\n')
  }

  // Decide columns based on content
  const hasMetered = filtered.some(e => e.type === 'metered')
  const hasFlags = filtered.some(e => e.type === 'flag')

  let tableStr: string
  if (hasMetered && !hasFlags) {
    tableStr = renderTable(meteredColumns, filtered, format)
  } else if (hasFlags && !hasMetered) {
    tableStr = renderTable(flagColumns, filtered, format)
  } else {
    tableStr = renderTable(mixedColumns, filtered, format)
  }
  // Only highlight disabled rows when there's a mix — if everything is disabled
  // (e.g. --disabled filter), the pink becomes noise rather than signal.
  const hasMix = filtered.some(e => e.enabled) && filtered.some(e => !e.enabled)
  lines.push(format === 'terminal' && hasMix ? highlightDisabledRows(tableStr, filtered) : tableStr)

  lines.push('')
  lines.push(`${filtered.length} entitlement${filtered.length === 1 ? '' : 's'} shown.`)

  return lines.join('\n')
}
