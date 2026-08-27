import { describe, it, expect } from 'vitest'

import { ConfigFileDiagnostic, ConfigFileDiagnostics, InvalidConfigError } from '../config-diagnostics.js'
import { Diagnostics, ErrorDiagnostic, WarningDiagnostic } from '../../constructs/diagnostics.js'

describe('ConfigFileDiagnostic', () => {
  it('prefixes the title with the config file name and delegates severity', () => {
    const underlying = new ErrorDiagnostic({
      title: 'Invalid property value',
      message: 'The value is not valid.',
      error: new Error('The value is not valid.'),
    })
    const diagnostic = new ConfigFileDiagnostic('checkly.config.ts', underlying)
    expect(diagnostic.title).toBe('[checkly.config.ts] Invalid property value')
    expect(diagnostic.message).toBe('The value is not valid.')
    expect(diagnostic.isFatal()).toBe(true)
    expect(diagnostic.isBenign()).toBe(false)
  })
})

describe('ConfigFileDiagnostics', () => {
  it('wraps added diagnostics in ConfigFileDiagnostic', () => {
    const diagnostics = new ConfigFileDiagnostics('checkly.config.ts')
    diagnostics.add(new WarningDiagnostic({
      title: 'Some warning',
      message: 'Something looks off.',
    }))
    expect(diagnostics.isFatal()).toBe(false)
    expect(diagnostics.observations).toEqual([
      expect.objectContaining({
        title: '[checkly.config.ts] Some warning',
      }),
    ])
  })

  it('renders before later diagnostics when extended into a collector first', () => {
    const configDiagnostics = new ConfigFileDiagnostics('checkly.config.ts')
    configDiagnostics.add(new WarningDiagnostic({
      title: 'Config warning',
      message: 'A config-level warning.',
    }))

    const diagnostics = new Diagnostics()
    diagnostics.extend(configDiagnostics)
    diagnostics.add(new WarningDiagnostic({
      title: 'Construct warning',
      message: 'A construct-level warning.',
    }))

    expect(diagnostics.observations.map(diagnostic => diagnostic.title)).toEqual([
      '[checkly.config.ts] Config warning',
      'Construct warning',
    ])
  })
})

describe('InvalidConfigError', () => {
  it('composes its message from the fatal observations', () => {
    const diagnostics = new ConfigFileDiagnostics('checkly.config.ts')
    diagnostics.add(new ErrorDiagnostic({
      title: 'Invalid property value',
      message: 'The value provided for property "bundle" is not valid.',
      error: new Error('The value provided for property "bundle" is not valid.'),
    }))
    diagnostics.add(new WarningDiagnostic({
      title: 'Some warning',
      message: 'Not included in the message.',
    }))

    const error = new InvalidConfigError(diagnostics)
    expect(error.name).toBe('InvalidConfigError')
    expect(error.diagnostics).toBe(diagnostics)
    expect(error.message).toContain('Checkly configuration is not valid:')
    expect(error.message).toContain('[checkly.config.ts] Invalid property value')
    expect(error.message).toContain('The value provided for property "bundle" is not valid.')
    expect(error.message).not.toContain('Not included in the message.')
  })
})
