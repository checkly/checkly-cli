import { Flags } from '@oclif/core'
import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import type { CheckDTO } from '../../rest/checks'

export default class ChecksList extends AuthCommand {
  static hidden = false
  static description = 'List all checks in your Checkly account.'

  static examples = [
    '$ npx checkly checks list',
    '$ npx checkly checks list --check-type BROWSER',
    '$ npx checkly checks list --tag production --activated',
    '$ npx checkly checks list --json',
  ]

  static flags = {
    'check-type': Flags.string({
      description: 'Filter by check type (API, BROWSER, HEARTBEAT, MULTI_STEP, TCP, PLAYWRIGHT, URL, DNS, ICMP)',
      options: ['API', 'BROWSER', 'HEARTBEAT', 'ICMP', 'MULTI_STEP', 'TCP', 'PLAYWRIGHT', 'URL', 'DNS'],
    }),
    'tag': Flags.string({
      description: 'Filter by tag name',
    }),
    'activated': Flags.boolean({
      description: 'Show only activated checks',
      allowNo: true,
    }),
    'muted': Flags.boolean({
      description: 'Show only muted checks',
      allowNo: true,
    }),
    'json': Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ChecksList)

    const checks = await api.checks.listAll({
      checkType: flags['check-type'],
      tag: flags.tag,
      activated: flags.activated,
      muted: flags.muted,
    })

    if (checks.length === 0) {
      this.log('No checks found.')
      return
    }

    if (flags.json) {
      this.log(JSON.stringify(checks, null, 2))
      return
    }

    this.log(`Found ${checks.length} check${checks.length === 1 ? '' : 's'}:\n`)

    // Column widths
    const nameWidth = Math.min(40, Math.max(4, ...checks.map(c => c.name.length)))

    // Header
    const header = [
      pad('NAME', nameWidth),
      pad('TYPE', 12),
      pad('STATUS', 10),
      pad('FREQ', 6),
      pad('LOCATIONS', 20),
      'TAGS',
    ].join('  ')
    this.log(header)
    this.log('─'.repeat(header.length))

    for (const check of checks) {
      const status = formatStatus(check)
      const locations = formatLocations(check)
      const tags = check.tags.length > 0 ? check.tags.join(', ') : '-'

      this.log([
        pad(truncate(check.name, nameWidth), nameWidth),
        pad(check.checkType, 12),
        pad(status, 10),
        pad(`${check.frequency}m`, 6),
        pad(locations, 20),
        tags,
      ].join('  '))
    }
  }
}

function formatStatus (check: CheckDTO): string {
  if (!check.activated) return 'disabled'
  if (check.muted) return 'muted'
  return 'active'
}

function formatLocations (check: CheckDTO): string {
  const count = check.locations.length + check.privateLocations.length
  if (count === 0) return '-'
  if (count <= 2) return [...check.locations, ...check.privateLocations].join(', ')
  return `${count} locations`
}

function truncate (str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len - 1) + '…'
}

function pad (str: string, len: number): string {
  return str.padEnd(len)
}
