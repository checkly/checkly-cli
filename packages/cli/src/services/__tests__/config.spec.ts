import Conf from 'conf'
import config from '../config'
jest.mock('conf')

describe('config', () => {
  it('should avoid reading config file if environment variables are set', () => {
    process.env.CHECKLY_API_KEY = 'test-api-key'
    const apiKey = config.getApiKey()
    expect(apiKey).toEqual(process.env.CHECKLY_API_KEY)
    expect(Conf).toHaveBeenCalledTimes(0)
    delete process.env.CHECKLY_API_KEY
  })
})
