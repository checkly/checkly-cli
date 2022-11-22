const {
  parseChecklyConfig,
} = require('./config-parser')
const {
  processConfig,
} = require('./config-processor')

module.exports = async () => {
  const config = await parseChecklyConfig()
  return processConfig(config)
}
