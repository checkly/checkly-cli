import { describe, expect, it } from 'vitest'
import { Parser } from '@oclif/core'
import ChecksGet from '../checks/get.js'

// Exercises oclif's real flag-relationship validation (dependsOn/exclusive),
// which the API-mocking command specs bypass by stubbing `parse`.
function parseChecksGet (argv: string[]) {
  return Parser.parse(argv, {
    flags: ChecksGet.flags as any,
    args: ChecksGet.args as any,
    strict: ChecksGet.strict,
  })
}

describe('checks get flag parsing', () => {
  it('allows `checks get <id>` with no flags', async () => {
    // Regression: `--include-attempts` having a `default` made oclif treat it as
    // always-provided, so its `dependsOn: result` wrongly required --result on
    // every invocation ("All of the following must be provided ...: --result").
    const { args, flags } = await parseChecksGet(['1d46f688-28ab-4f7f-8572-fe7d207d0594'])
    expect(args.id).toBe('1d46f688-28ab-4f7f-8572-fe7d207d0594')
    expect(flags['include-attempts']).toBeFalsy()
  })

  it('requires --result when --include-attempts is passed', async () => {
    await expect(parseChecksGet(['some-id', '--include-attempts'])).rejects.toThrow(/--result/)
  })

  it('accepts --include-attempts together with --result', async () => {
    const { flags } = await parseChecksGet(['some-id', '--result', 'r-1', '--include-attempts'])
    expect(flags['include-attempts']).toBe(true)
    expect(flags.result).toBe('r-1')
  })
})
