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

    const tableLines = markdown.split('\n').filter(line => line.startsWith('|'))
    // 6 columns (including Link) -> 7 delimiters per line
    for (const line of tableLines) {
      expect(line.match(/(?<!\\)\|/g)).toHaveLength(7)
    }
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

  test('escapes pipes and line breaks in check names and filenames so rows keep their columns', () => {
    const map: checkFilesMap = new Map([
      ['folder/a|b.check.ts', new Map([
        ['seq-pipe', {
          result: {
            name: 'API | Production',
            sourceFile: 'folder/a|b.check.ts',
            checkType: 'API',
            responseTime: 10,
          } as any,
          titleString: 'API | Production',
          numRetries: 0,
        }],
        ['seq-newline', {
          result: {
            name: 'API\nProduction',
            sourceFile: 'folder/a|b.check.ts',
            checkType: 'API',
            responseTime: 20,
          } as any,
          titleString: 'API\nProduction',
          numRetries: 0,
        }],
        ['seq-pending', {
          check: { name: 'Pending | Check', getSourceFile: () => 'folder/a|b.check.ts' } as any,
          titleString: 'Pending | Check',
          numRetries: 0,
        }],
      ])],
    ])
    const markdown = new GithubMdBuilder({
      testSessionId: undefined,
      numChecks: 3,
      runLocation,
      checkFilesMap: map,
      maxFailuresReached: 1,
    }).render()

    expect(markdown).toContain('|API \\| Production|API|`folder/a\\|b.check.ts`|10ms |')
    expect(markdown).toContain('|API Production|API|`folder/a\\|b.check.ts`|20ms |')
    expect(markdown).toContain('|Pending \\| Check|-|`folder/a\\|b.check.ts`|- |')

    const tableLines = markdown.split('\n').filter(line => line.startsWith('|'))
    // header, separator and three rows, each one line
    expect(tableLines).toHaveLength(5)
    for (const line of tableLines) {
      // Count unescaped pipes: 5 columns -> 6 delimiters
      expect(line.match(/(?<!\\)\|/g)).toHaveLength(6)
    }
  })

  test('renders - instead of `undefined` when a check lacks sourceFile in a mixed map', () => {
    const map: checkFilesMap = new Map([
      ['folder/api.check.ts', new Map([
        ['seq-with-file', {
          result: {
            name: 'File Check',
            sourceFile: 'folder/api.check.ts',
            checkType: 'API',
            responseTime: 10,
          } as any,
          titleString: 'File Check',
          numRetries: 0,
        }],
      ])],
      [undefined, new Map([
        ['seq-remote-done', {
          result: {
            name: 'Remote Finished',
            checkType: 'API',
            responseTime: 25,
          } as any,
          titleString: 'Remote Finished',
          numRetries: 0,
        }],
        ['seq-remote-pending', {
          check: { name: 'Remote Pending', checkType: 'API' } as any,
          titleString: 'Remote Pending',
          numRetries: 0,
        }],
      ])],
    ])

    const markdown = new GithubMdBuilder({
      testSessionId,
      numChecks: 3,
      runLocation,
      checkFilesMap: map,
    }).render()

    expect(markdown).not.toContain('undefined')
    expect(markdown).toContain('|✅ Pass|File Check|API|`folder/api.check.ts`|10ms ||')
    expect(markdown).toContain('|✅ Pass|Remote Finished|API|-|25ms ||')
    expect(markdown).toContain('|⏹️ Not finished|Remote Pending|API|-|- ||')
  })
})
