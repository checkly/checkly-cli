import { Flags } from '@oclif/core'

export function outputFlag (opts: { default: string, options?: string[] }) {
  return Flags.string({
    char: 'o',
    description: 'Output format.',
    options: opts.options ?? [opts.default, 'json', 'md'],
    default: opts.default,
  })
}
