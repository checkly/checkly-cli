import { describe, expect, test, vi } from 'vitest'

import { GithubMdBuilder } from '../github'
import { generateMapAndTestResultIds } from './helpers'

vi.mock('../../rest/api', () => ({
  getDefaults: () => ({
    baseURL: 'https://api.checklyhq.com',
    accountId: 'test-account-123',
    Authorization: 'Bearer test-key',
    apiKey: 'test-key'
  })
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
})
