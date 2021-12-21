// We need this module to run the tests from a clean slate.
// If there is no auth.json, all units tests will fail initially.
// TODO: we might want to improve this later, it seems pretty hacky
const Conf = require('conf')
const authSchema = {
  _: { type: 'string' },
  apiKey: { type: 'string' }
}
const dataSchema = {
  _: { type: 'string' },
  output: { type: 'string', pattern: 'human|json|plain' },
  collectMetricts: { type: 'boolean' },
  accountId: { type: 'string' },
  accountName: { type: 'string' }
}

const config1 = {
  auth: new Conf({
    configName: 'auth',
    projectSuffix: 'test',
    schema: authSchema
  }),
  data: new Conf({
    configName: 'config',
    projectSuffix: 'test',
    schema: dataSchema
  })
}

config1.auth.set('apiKey', '123abc')
config1.data.set('output', 'json')
config1.data.set('accountName', 'Test Account')
config1.data.set('accountId', 'abc123')
const config = require('../src/services/config')

config.auth.set('apiKey', '123abc')
config.data.set('output', 'json')
config.data.set('accountName', 'Test Account')
config.data.set('accountId', 'abc123')
