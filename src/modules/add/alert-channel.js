const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')

const alertChannelTemplates = require('../../templates/alert-channel')
const { ALERT_CHANNEL_TYPES } = require('../../services/constants')

async function alertChannel (checklyDir) {
  consola.info('Creating new alert channel')

  const { name, type } = await prompt([
    {
      name: 'name',
      type: 'input',
      message: 'Your alert channel name'
    },
    {
      name: 'type',
      type: 'list',
      choices: Object.values(ALERT_CHANNEL_TYPES)
    }
  ])

  const alertChannelsDirPath = path.join(checklyDir, 'alert-channels')
  if (!fs.existsSync(alertChannelsDirPath)) {
    fs.mkdirSync(alertChannelsDirPath)
  }

  const key = name.toLowerCase().replace(/ /g, '-').trim()
  let filePath = path.join(alertChannelsDirPath, key + '.yml')
  let tryIndex = 0

  while (fs.existsSync(filePath)) {
    tryIndex += 1
    filePath = path.join(alertChannelsDirPath, key + tryIndex + '.yml')
  }

  fs.writeFileSync(
    filePath,
    alertChannelTemplates[type.toLowerCase()]()
  )

  consola.success(`Created new alert channel: ${key}`)
}

module.exports = alertChannel
