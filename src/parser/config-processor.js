const bundle = require('./bundler')

// This should be a part of the cdk resources so bundling happens while the config is required
async function processConfig (config) {
  if (config.checks) {
    for (const logicalId in config.checks) {
      const check = config.checks[logicalId]
      if (check.entry) {
        bundle(check)
      }
    }
  }
  return config
}

module.exports = { processConfig }
