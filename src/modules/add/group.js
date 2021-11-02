const fs = require('fs')
const path = require('path')
const { prompt } = require('inquirer')
const consola = require('consola')

const { locations: locationsApi } = require('../../services/api')
const groupSettingsTemplates = require('../../templates/group')

async function check(checklyDir) {
  const { data } = await locationsApi.getAll()
  const regions = data.map(({ region }) => region)

  consola.info('Creating new group directory')

  const { name, locations } = await prompt([
    {
      name: 'name',
      type: 'input',
      message: 'Your group name',
    },
    {
      name: 'locations',
      type: 'checkbox',
      choices: regions,
      validate: (locations) =>
        locations.length > 0 ? true : 'You have to pick at least one location',
      message: 'Select your target locations (we recommend to pick at least 2)',
    },
  ])

  const key = name.toLowerCase().replace(/ /g, '-').trim()
  let filePath = path.join(checklyDir, 'checks', key)
  let tryIndex = 0

  while (fs.existsSync(filePath)) {
    tryIndex += 1
    filePath = path.join(checklyDir, 'checks', key + tryIndex)
  }

  fs.mkdirSync(path.join(checklyDir, 'checks', key))

  fs.writeFileSync(
    path.join(filePath, 'settings.yml'),
    groupSettingsTemplates({ name, locations })
  )

  consola.success(`Created new group: ${key}`)
}

module.exports = check
