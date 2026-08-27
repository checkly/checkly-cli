import { describe, it, expect, vi } from 'vitest'

import { BaseCommand } from '../baseCommand.js'
import { CommandStyle } from '../../helpers/command-style.js'
import { ConfigFileDiagnostics, InvalidConfigError } from '../../services/config-diagnostics.js'
import { Diagnostics, ErrorDiagnostic, NoticeDiagnostic, WarningDiagnostic } from '../../constructs/diagnostics.js'

function createCommandContext () {
  let exitCodeValue: number | undefined
  return {
    style: {
      diagnostics: CommandStyle.prototype.diagnostics,
      actionFailure: vi.fn(),
      longError: vi.fn(),
      longWarning: vi.fn(),
      longInfo: vi.fn(),
      shortError: vi.fn(),
    },
    exit: vi.fn((code: number) => {
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    catch: (BaseCommand.prototype as any).catch,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('CommandStyle', () => {
  describe('diagnostics()', () => {
    it('dispatches diagnostics by severity', () => {
      const ctx = createCommandContext()

      const diagnostics = new Diagnostics()
      diagnostics.add(new ErrorDiagnostic({
        title: 'error title',
        message: 'error message',
        error: new Error('error message'),
      }))
      diagnostics.add(new WarningDiagnostic({
        title: 'warning title',
        message: 'warning message',
      }))
      diagnostics.add(new NoticeDiagnostic({
        title: 'notice title',
        message: 'notice message',
      }))

      ctx.style.diagnostics(diagnostics)

      expect(ctx.style.longError).toHaveBeenCalledWith('error title', 'error message')
      expect(ctx.style.longWarning).toHaveBeenCalledWith('warning title', 'warning message')
      expect(ctx.style.longInfo).toHaveBeenCalledWith('notice title', 'notice message')
    })
  })
})

describe('BaseCommand', () => {
  describe('catch()', () => {
    it('renders config diagnostics and exits 1 on InvalidConfigError', () => {
      const ctx = createCommandContext()

      const diagnostics = new ConfigFileDiagnostics('checkly.config.ts')
      diagnostics.add(new ErrorDiagnostic({
        title: 'Invalid property value',
        message: 'The value is not valid.',
        error: new Error('The value is not valid.'),
      }))

      expect(() => ctx.catch.call(ctx, new InvalidConfigError(diagnostics)))
        .toThrow('EXIT_1')

      expect(ctx.style.longError).toHaveBeenCalledWith(
        '[checkly.config.ts] Invalid property value',
        'The value is not valid.',
      )
      expect(ctx.style.shortError).toHaveBeenCalledWith('Your Checkly configuration file is not valid.')
      expect(ctx.exitCodeValue).toBe(1)
    })
  })
})
