const updateNotifier = require('update-notifier')
const config = require('./config')
const pkg = require('../../package.json')

module.exports = function () {
  const notifier = updateNotifier({
    pkg,
    updateCheckInterval: 1000 * 60,
  })

  if (config.get('env') !== 'development') {
    notifier.notify({ isGlobal: true })
  }
}
