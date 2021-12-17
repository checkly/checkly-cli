const {
  parseChecksTree,
  parseAlertChannelsTree,
  parseAlertChannelSubscriptionsTree,
} = require('./resource-parser')
const {
  parseChecklyDirectory,
  parseAlertChannelsDirectory,
} = require('./file-parser')

module.exports = async () => {
  const { alertChannels } = parseAlertChannelsTree(
    parseAlertChannelsDirectory()
  )

  const { checks, groups } = {
    ...(await parseChecksTree(parseChecklyDirectory(), {
      alertChannels,
    })),
  }

  const { alertChannelSubscriptions } =
    parseAlertChannelSubscriptionsTree(checks)

  return {
    alertChannels,
    checks,
    groups,
    alertChannelSubscriptions,
  }
}
