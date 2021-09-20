const { version } = require('../package.json')
const updater = require('./services/updater')

const config = require('./services/config')
const defaultConfig = require('./services/default-config')

updater()

const configVersion = config.get('version')
const isInitialized = config.get('isInitialized')

if (isInitialized !== 'true' || !configVersion || version > configVersion) {
  config.store = Object.assign(config.store, defaultConfig)
}

module.exports = require('@oclif/command')
