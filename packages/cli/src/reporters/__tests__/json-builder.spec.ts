import { JsonBuilder } from '../json'
import { generateMapAndTestResultIds } from './helpers'

const testSessionId = '0c4c64b3-79c5-44a6-ae07-b580ce73f328'
const runLocation = 'eu-west-1'
describe('JsonBuilder', () => {
  test('renders basic JSON output with no assets & links', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: false })
    const json = new JsonBuilder({
      testSessionId: undefined,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(json).toMatchSnapshot('json-basic')
  })
  test('renders JSON markdown output with assets & links', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: true })
    const json = new JsonBuilder({
      testSessionId,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(json).toMatchSnapshot('json-with-assets-links')
  })
})
