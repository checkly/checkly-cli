import { describe, expect, it, vi } from 'vitest'

import { CommandStyle } from '../command-style.js'
import { NotFoundError, ServerError } from '../../rest/errors.js'

function createStyle (hint: string | undefined, outputFormat?: string) {
  const command = {
    log: vi.fn(),
    notFoundHint: vi.fn(() => hint),
    searchedAccount: vi.fn(() => hint ? { id: 'acc-1', name: 'Acme' } : undefined),
  }
  const style = new CommandStyle(command as any)
  style.outputFormat = outputFormat
  const lines = () => command.log.mock.calls.map(([line]) => String(line ?? ''))
  return { style, lines }
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
