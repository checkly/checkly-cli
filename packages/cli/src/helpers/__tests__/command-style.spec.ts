import { describe, expect, it, vi, afterEach } from 'vitest'
import { ux } from '@oclif/core'

import { CommandStyle } from '../command-style.js'
import { NotFoundError, ServerError } from '../../rest/errors.js'

function createStyle (hint: string | undefined, outputFormat?: string) {
  const command = {
    log: vi.fn(),
    logToStderr: vi.fn(),
    notFoundHint: vi.fn(() => hint),
    searchedAccount: vi.fn(() => hint ? { id: 'acc-1', name: 'Acme' } : undefined),
  }
  const style = new CommandStyle(command as any)
  style.outputFormat = outputFormat
  const lines = () => command.log.mock.calls.map(([line]) => String(line ?? ''))
  const errLines = () => command.logToStderr.mock.calls.map(([line]) => String(line ?? ''))
  return { style, command, lines, errLines }
}

const notFound = () => new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'No such test session.' })

describe('CommandStyle.longError', () => {
  it('adds the command\'s hint to an error saying a resource was not found', () => {
    const { style, lines } = createStyle('Searched account "Acme" (acc-1).')
    style.longError('Failed to get test session details.', notFound())

    expect(lines().join('\n')).toContain('No such test session.')
    expect(lines().join('\n')).toContain('  Searched account "Acme" (acc-1).')
  })

  it('reports the hint and the searched account as their own JSON fields', () => {
    const { style, lines } = createStyle('Searched account "Acme" (acc-1).', 'json')
    style.longError('Failed to get test session details.', notFound())

    expect(lines().map(line => JSON.parse(line))).toEqual([{
      error: 'Failed to get test session details.',
      detail: 'No such test session.',
      hint: 'Searched account "Acme" (acc-1).',
      searchedAccount: { id: 'acc-1', name: 'Acme' },
    }])
  })

  it('leaves both fields out without a hint', () => {
    const { style, lines } = createStyle(undefined, 'json')
    style.longError('Failed to get test session details.', notFound())

    expect(lines().map(line => JSON.parse(line))).toEqual([{
      error: 'Failed to get test session details.',
      detail: 'No such test session.',
    }])
  })

  it('leaves other errors as they are', () => {
    const { style, lines } = createStyle('Searched account "Acme" (acc-1).')
    style.longError('Failed.', new ServerError({ statusCode: 503, error: 'Unavailable', message: 'Down' }))

    expect(lines().join('\n')).not.toContain('Searched account')
  })
})

describe('CommandStyle output streams', () => {
  const startSpy = vi.spyOn(ux.action, 'start')
  const stopSpy = vi.spyOn(ux.action, 'stop')

  afterEach(() => {
    startSpy.mockClear()
    stopSpy.mockClear()
  })

  it('renders the spinner and its separator line on stderr, not stdout', () => {
    const { style, command } = createStyle(undefined)
    command.fancy = true

    style.actionStart('Parsing your project')
    expect(startSpy).toHaveBeenCalledWith('Parsing your project')
    expect(startSpy).not.toHaveBeenCalledWith('Parsing your project', undefined, { stdout: true })

    style.actionSuccess()
    expect(stopSpy).toHaveBeenCalledWith('✅')

    style.actionStart('Deploying project')
    style.actionFailure()
    expect(stopSpy).toHaveBeenCalledWith('❌')

    // The blank separator line follows the spinner to stderr.
    expect(command.logToStderr).toHaveBeenCalled()
    expect(command.log).not.toHaveBeenCalled()
  })

  it('does not start a spinner when fancy output is off', () => {
    const { style, command } = createStyle(undefined)
    command.fancy = false

    style.actionStart('Parsing your project')

    expect(startSpy).not.toHaveBeenCalled()
  })

  it('prints warnings to stderr only', () => {
    const { style, command, lines, errLines } = createStyle(undefined)

    style.longWarning('Checkly skill is out of date', 'Re-install to update.')
    style.shortWarning('No Checkly config file found')

    const stderr = errLines().join('\n')
    expect(stderr).toContain('Checkly skill is out of date')
    expect(stderr).toContain('Re-install to update.')
    expect(stderr).toContain('No Checkly config file found')
    expect(lines()).toEqual([])
    expect(command.log).not.toHaveBeenCalled()
  })

  it('keeps JSON error documents on stdout', () => {
    const { style, lines } = createStyle(undefined, 'json')

    style.shortError('Your Checkly configuration file is not valid.')

    expect(lines().map(line => JSON.parse(line))).toEqual([{
      error: 'Your Checkly configuration file is not valid.',
    }])
  })
})
