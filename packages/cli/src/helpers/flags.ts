import { Flags } from '@oclif/core'

export interface FlagAlias {
  alias: string
  flag: string
}

export function normalizeFlagAliases (argv: string[], aliases: FlagAlias[]): string[] {
  if (aliases.length === 0) {
    return [...argv]
  }

  const flagByAlias = new Map(aliases.map(({ alias, flag }) => [alias, flag]))
  const passthroughIndex = argv.indexOf('--')
  const argsToNormalize = passthroughIndex === -1 ? argv : argv.slice(0, passthroughIndex)
  const passthroughArgs = passthroughIndex === -1 ? [] : argv.slice(passthroughIndex)

  return [
    ...argsToNormalize.map(arg => {
      const match = arg.match(/^(-[a-z0-9-]+)(?:=(.*))?$/i)
      const alias = match?.[1]
      const flag = alias ? flagByAlias.get(alias) : undefined

      if (!flag) {
        return arg
      }

      const value = match?.[2]
      return value === undefined ? flag : `${flag}=${value}`
    }),
    ...passthroughArgs,
  ]
}

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

export function planIdFlag () {
  return Flags.string({
    description: 'Target a specific import plan by ID, skipping interactive plan selection.',
  })
}
