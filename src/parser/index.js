const {
  parseChecksTree,
  parseAlertChannelsTree,
  parseAlertChannelSubscriptionsTree
} = require('./resource-parser')
const {
  parseChecklyDirectory,
  parseAlertChannelsDirectory
} = require('./file-parser')

module.exports = async () => {
  const { alertChannels } = parseAlertChannelsTree(
    parseAlertChannelsDirectory()
  )

  const { checks, groups } = {
    ...(await parseChecksTree(parseChecklyDirectory(), {
      alertChannels
    }))
  }

  const checkAlertChannelSubscriptions = parseAlertChannelSubscriptionsTree(checks)
  const groupAlertChannelSubscriptions = parseAlertChannelSubscriptionsTree(
    groups,
    'group'
  )

  const alertChannelSubscriptions = {
    ...groupAlertChannelSubscriptions,
    ...checkAlertChannelSubscriptions
  }

  return {
    alertChannels,
    checks,
    groups,
    alertChannelSubscriptions
  }
}
