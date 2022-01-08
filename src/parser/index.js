const {
  parseProject,
  parseChecksTree,
  parseAlertChannelsTree,
  parseAlertChannelSubscriptionsTree
} = require('./resource-parser')
const {
  parseChecklyDirectory,
  parseAlertChannelsDirectory
} = require('./file-parser')

module.exports = async () => {
  const project = parseProject()

  const { alertChannels } = parseAlertChannelsTree(
    parseAlertChannelsDirectory()
  )

  const { checks, groups } = {
    ...(await parseChecksTree(parseChecklyDirectory(), {
      alertChannels,
      project
    }))
  }

  const checkAlertChannelSubscriptions =
    parseAlertChannelSubscriptionsTree(checks)
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
