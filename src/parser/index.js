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

  console.log(
    JSON.stringify(
      {
        alertChannels,
        checks,
        groups,
        alertChannelSubscriptions,
      },
      null,
      2
    )
  )

  return {
    alertChannels,
    checks,
    groups,
    alertChannelSubscriptions,
  }
}
