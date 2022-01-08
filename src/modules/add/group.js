const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')

const groupSettingsTemplates = require('../../templates/group')
const { promptLocations } = require('../../services/prompts')
const { locations: locationsApi } = require('../../services/api')

async function check (checklyDir) {
  const { data } = await locationsApi.getAll()
  const regions = data.map(({ region }) => region)

  consola.info('Creating new group directory')

  const { name, locations } = await prompt([
    {
      name: 'name',
      type: 'input',
      message: 'Your group name'
    },

    promptLocations({ choices: regions })
  ])

  const checksDirPath = path.join(checklyDir, 'checks')
  if (!fs.existsSync(checksDirPath)) {
    fs.mkdirSync(checksDirPath)
  }

  const key = name.toLowerCase().replace(/ /g, '-').trim()
  let filePath = path.join(checksDirPath, key)
  let tryIndex = 0

  while (fs.existsSync(filePath)) {
    tryIndex += 1
    filePath = path.join(checksDirPath, key + tryIndex)
  }

  fs.mkdirSync(path.join(checksDirPath, key))

  fs.writeFileSync(
    path.join(filePath, 'settings.yml'),
    groupSettingsTemplates({ name, locations })
  )

  consola.success(`Created new group: ${key}`)
}

module.exports = check
