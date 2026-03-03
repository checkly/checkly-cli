import { Flags } from '@oclif/core'

export function outputFlag (opts: { default: string, options?: string[] }) {
  return Flags.string({
    char: 'o',
    description: 'Output format.',
    options: opts.options ?? [opts.default, 'json', 'md'],
    default: opts.default,
  })
}

export function forceFlag () {
  return Flags.boolean({
    char: 'f',
    description: 'Skip confirmation prompt.',
    default: false,
  })
}

export function dryRunFlag () {
  return Flags.boolean({
    description: 'Preview what would happen without executing.',
    default: false,
  })
}
