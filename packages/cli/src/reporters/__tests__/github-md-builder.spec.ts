import { GithubMdBuilder } from '../github'
import { generateMapAndTestResultIds } from './helpers'

const testSessionId = '0c4c64b3-79c5-44a6-ae07-b580ce73f328'
const runLocation = 'eu-west-1'
describe('GithubMdBuilder', () => {
  test('renders basic markdown output with no assets & links', () => {
    const { checkFilesMap } = generateMapAndTestResultIds()
    const markdown = new GithubMdBuilder({
      testSessionId: undefined,
      testResultIds: {},
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(markdown).toMatchSnapshot('github-basic-markdown')
  })
  test('renders basic markdown output with assets & links', () => {
    const { checkFilesMap, testResultIds } = generateMapAndTestResultIds()
    const markdown = new GithubMdBuilder({
      testSessionId,
      testResultIds,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(markdown).toMatchSnapshot('github-markdown-with-assets-links')
  })
})
