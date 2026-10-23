import { describe, expect, it } from 'vitest'
import { Parser } from '@oclif/core'
import Test from '../test.js'
import Trigger from '../trigger.js'

// Exercises oclif's real flag validation (min/exclusive), which the
// API-mocking command specs bypass by stubbing `parse`.
function parse (command: typeof Test | typeof Trigger, argv: string[]) {
  return Parser.parse(argv, {
    flags: command.flags as any,
    args: (command as any).args,
    strict: false,
  })
}

describe('--max-failures flag parsing', () => {
  for (const command of [Test, Trigger]) {
    describe(command.name, () => {
      it('accepts a positive limit', async () => {
        const { flags } = await parse(command, ['--max-failures', '2'])
        expect(flags['max-failures']).toBe(2)
      })

      it('rejects a limit below 1', async () => {
        await expect(parse(command, ['--max-failures', '0'])).rejects.toThrow(/greater than or equal to 1/)
      })

      it('rejects --max-failures together with --detach', async () => {
        await expect(parse(command, ['--max-failures', '1', '--detach'])).rejects.toThrow(/--detach/)
      })

      it('allows --detach on its own', async () => {
        const { flags } = await parse(command, ['--detach'])
        expect(flags.detach).toBe(true)
      })
    })
  }

  it('rejects --max-failures together with --update-snapshots for checkly test', async () => {
    await expect(parse(Test, ['--max-failures', '1', '--update-snapshots'])).rejects.toThrow(/--update-snapshots/)
  })
})
