import axios from 'axios'
import * as api from '../api'

jest.mock('axios')
const { get } = axios as jest.Mocked<typeof import('axios').default>

const fixture = [
  {
    name: '2023.02',
    description: 'Main updates are Playwright 1.32.1, faker 7.6.0 and the addition of date-fns 2.29.3 and ws 8.13.0. We are also dropping support for Mocha.',
    stage: 'CURRENT',
    nodeVersion: '16.x',
    dependencies: {
      axios: '0.27.2',
    },
  },
  {
    name: '2022.10',
    description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer',
    stage: 'STABLE',
    nodeVersion: '16.x',
    dependencies: {
      axios: '0.27.2',
    },
  },
  {
    name: '2022.02',
    description: 'Main updates are Playwright 1.20.2 and Puppeteer 13.7.0 and Node.js 14.x',
    stage: 'STABLE',
    nodeVersion: '14.x',
    dependencies: {
      axios: '0.26.0',
    },
  },
]

describe('api', () => {
  beforeAll(() => {
    jest.resetAllMocks()
  })

  it('should return runtimes', async () => {
    get.mockResolvedValueOnce({ data: fixture })
    const { data: runtimes } = await api.runtimes.getAll()
    expect(runtimes).toEqual(fixture)
  })

  // TODO: unit test interceptors function
  it('should handle slow connection error', async () => {
    get.mockRejectedValue({
      error: {
        response: {
          status: 408,
        },
      },
    })
    try {
      await api.runtimes.getAll()
      expect(false).toBe(true)
    } catch (error: any) {
      expect(true).toBe(true)
    }
  })
})
