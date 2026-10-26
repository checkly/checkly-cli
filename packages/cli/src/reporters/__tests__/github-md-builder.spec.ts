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
  test('labels a check the CLI stopped waiting for as timed out, not failed', () => {
    const row = (name: string, timedOut: boolean) => [`seq-${name}`, {
      result: { name, sourceFile: 'folder/timeout.check.ts', hasFailures: true, runError: 'Error', timedOut },
      titleString: name,
      numRetries: 1,
    }] as const
    const map: checkFilesMap = new Map([
      ['folder/timeout.check.ts', new Map([
        row('Slow check', true),
        row('Crashed check', false),
      ])],
    ])
    const markdown = new GithubMdBuilder({
      testSessionId,
      numChecks: 2,
      runLocation,
      checkFilesMap: map,
    }).render()
    expect(markdown).toContain('|⏱️ Timed out (1 retry)|Slow check|')
    expect(markdown).toContain('|❌ Fail (1 retry)|Crashed check|')
    expect(markdown).toContain('## Execution Errors')
  })
  test('shows the retry count in the status cell of a check that needed retries', () => {
    const row = (name: string, hasFailures: boolean, numRetries: number) => [`seq-${name}`, {
      result: { name, sourceFile: 'folder/retry.check.ts', hasFailures, checkType: 'API', responseTime: 10 },
      titleString: name,
      numRetries,
    }] as const
    const map: checkFilesMap = new Map([
      ['folder/retry.check.ts', new Map([
        row('Flaky check', false, 2),
        row('Broken check', true, 1),
        row('Clean check', false, 0),
      ])],
    ])
    const markdown = new GithubMdBuilder({
      testSessionId,
      numChecks: 3,
      runLocation,
      checkFilesMap: map,
    }).render()
    expect(markdown).toContain('|✅ Pass (2 retries)|Flaky check|')
    expect(markdown).toContain('|❌ Fail (1 retry)|Broken check|')
    expect(markdown).toContain('|✅ Pass|Clean check|')
  })

  test('reports checks without a result as not finished when the run stopped early', () => {
    const map = generateMapAndTestResultIds({ includeTestResultIds: true })
    map.get('folder/api.check.ts')!.set('seq-slow', {
      check: { name: 'Slow Check', getSourceFile: () => 'folder/api.check.ts' } as any,
      titleString: 'Slow Check',
      numRetries: 0,
    })
    const markdown = new GithubMdBuilder({
      testSessionId: '0c4c64b3-79c5-44a6-ae07-b580ce73f328',
      numChecks: 3,
      runLocation: 'eu-west-1',
      checkFilesMap: map,
      maxFailuresReached: 2,
    }).render()

    expect(markdown).toContain('Stopped after **2** failed checks (max failures limit)')
    expect(markdown).toContain('|⏹️ Not finished|Slow Check|-|`folder/api.check.ts`|- ||')
  })

  test('shows the retry count of a check that retried before the run stopped early', () => {
    const map = generateMapAndTestResultIds({ includeTestResultIds: true })
    map.get('folder/api.check.ts')!.set('seq-slow', {
      check: { name: 'Slow Check', getSourceFile: () => 'folder/api.check.ts' } as any,
      titleString: 'Slow Check',
      numRetries: 1,
    })
    const markdown = new GithubMdBuilder({
      testSessionId,
      numChecks: 3,
      runLocation,
      checkFilesMap: map,
      maxFailuresReached: 2,
    }).render()

    expect(markdown).toContain('|⏹️ Not finished (1 retry)|Slow Check|')
  })
})
