const { parseChecksTree, parseAlertChannelsTree } = require('./resource-parser')
const {
  parseChecklyDirectory,
  parseAlertChannelsDirectory,
} = require('./file-parser')

module.exports = async () => {
  const { alertChannels } = await parseAlertChannelsTree(
    parseAlertChannelsDirectory()
  )

  const { checks, groups } = {
    ...(await parseChecksTree(parseChecklyDirectory(), {
      alertChannels,
    })),
  }

  console.log(
    JSON.stringify(
      {
        alertChannels,
        checks,
        groups,
      },
      null,
      2
    )
  )

  return {
    alertChannels,
    checks,
    groups,
  }
}
