/* eslint-disable no-undef */
const Conf = require('conf')

describe('Config', () => {
  it('should set the channel and version', async () => {
    const newConfig = new Conf({
      configName: 'jest-test',
      defaults: {
        accountId: 'abc123321cba',
        accountName: 'checkly-test-1',
        ver: '0.0.1-test',
      },
    })
    expect(newConfig.store).toHaveProperty('accountId', 'abc123321cba')
    expect(newConfig.store).toHaveProperty('accountName', 'checkly-test-1')
    expect(newConfig.store).toHaveProperty('ver', '0.0.1-test')
  })
})
