const {
  parseChecklyConfig,
} = require('./config-parser')

module.exports = async () => {
  return parseChecklyConfig()
}
