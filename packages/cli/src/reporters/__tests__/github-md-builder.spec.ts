import { describe, expect, test, vi } from 'vitest'

import { GithubMdBuilder } from '../github.js'
import type { checkFilesMap } from '../abstract-list.js'
import { generateMapAndTestResultIds } from './helpers.js'

vi.mock('../../rest/api', () => ({
  getDefaults: () => ({
    baseURL: 'https://api.checklyhq.com',
    accountId: 'test-account-123',
    Authorization: 'Bearer test-key',
    apiKey: 'test-key',
  }),
}))

const testSessionId = '0c4c64b3-79c5-44a6-ae07-b580ce73f328'
const runLocation = 'eu-west-1'
describe('GithubMdBuilder', () => {
  test('renders basic markdown output with no assets & links', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: false })
    const markdown = new GithubMdBuilder({
      testSessionId: undefined,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(markdown).toMatchSnapshot('github-basic-markdown')
  })
  test('renders basic markdown output with assets & links', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: true })
    const markdown = new GithubMdBuilder({
      testSessionId,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(markdown).toMatchSnapshot('github-markdown-with-assets-links')
  })
  test('renders markdown output for a check that failed with a run error', () => {
    const runError = 'Reached timeout of 240 seconds waiting for check result. Use a custom timeout with --timeout'
    // A check that failed with a run error (e.g. the CLI timing out while waiting for a
    // result) has no check type, response time or test result ID.
    const map: checkFilesMap = new Map([
      ['folder/timeout.check.ts', new Map([
        ['seq-timeout', {
          result: {
            name: 'Timed out check',
            sourceFile: 'folder/timeout.check.ts',
            hasFailures: true,
            runError,
          },
          titleString: 'Timed out check',
          numRetries: 0,
        }],
      ])],
    ])
    const markdown = new GithubMdBuilder({
      testSessionId,
      numChecks: 1,
      runLocation,
      checkFilesMap: map,
    }).render()
    expect(markdown).toMatchSnapshot('github-markdown-with-run-error')
    expect(markdown).not.toContain('undefined')
    expect(markdown).not.toContain('NaN')
    expect(markdown).toContain('## Execution Errors')
    expect(markdown).toContain(runError)
  })
})
