import { describe, it, expect, vi, afterEach } from 'vitest'
import { prepareReportersTypes, validateDetachReporterTypes } from '../test-helper.js'
import type { CliMode } from '../cli-mode.js'

const cliMode = vi.hoisted(() => ({ value: 'interactive' as CliMode }))
vi.mock('../cli-mode.js', () => ({ detectCliMode: () => cliMode.value }))

afterEach(() => {
  cliMode.value = 'interactive'
})

describe('prepareReportersTypes', () => {
  it('returns list reporter by default', () => {
    const result = prepareReportersTypes(undefined, [])
    expect(result).toEqual(['list'])
  })

  it('returns list reporter when flag is empty', () => {
    const result = prepareReportersTypes([], [])
    expect(result).toEqual(['list'])
  })

  it('returns the ci reporter by default in CI', () => {
    cliMode.value = 'ci'
    expect(prepareReportersTypes(undefined, [])).toEqual(['ci'])
  })

  it('returns the ci reporter by default for an agent', () => {
    cliMode.value = 'agent'
    expect(prepareReportersTypes(undefined, [])).toEqual(['ci'])
  })

  it('still honours an explicit reporter in CI', () => {
    cliMode.value = 'ci'
    expect(prepareReportersTypes(['list'], [])).toEqual(['list'])
  })

  it('returns a single reporter when one flag is passed', () => {
    const result = prepareReportersTypes(['json'], [])
    expect(result).toEqual(['json'])
  })

  it('falls back to config reporters when no flag is passed', () => {
    const result = prepareReportersTypes(undefined, ['list', 'json'])
    expect(result).toEqual(['list', 'json'])
  })

  it('CLI flag takes precedence over config reporters', () => {
    const result = prepareReportersTypes(['dot'], ['list', 'json'])
    expect(result).toEqual(['dot'])
  })

  it('CLI --reporter flag supports multiple values', () => {
    const result = prepareReportersTypes(['list', 'json'], ['list', 'dot'])
    expect(result).toEqual(['list', 'json'])
  })
})

describe('validateDetachReporterTypes', () => {
  it('allows streaming reporters in detach mode', () => {
    expect(() => validateDetachReporterTypes(['list', 'dot', 'ci'])).not.toThrow()
  })

  it('rejects json reporter in detach mode', () => {
    expect(() => validateDetachReporterTypes(['json'])).toThrow('--detach does not support --reporter json')
  })

  it('rejects github reporter in detach mode', () => {
    expect(() => validateDetachReporterTypes(['github'])).toThrow('--detach does not support --reporter github')
  })

  it('rejects file reporters mixed with streaming reporters in detach mode', () => {
    expect(() => validateDetachReporterTypes(['list', 'json', 'github'])).toThrow(
      '--detach does not support --reporter json, --reporter github',
    )
  })
})
