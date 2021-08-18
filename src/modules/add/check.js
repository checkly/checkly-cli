const fs = require('fs')
const path = require('path')
const { prompt } = require('inquirer')
const consola = require('consola')

const { locations: locationsApi } = require('../../services/api')
const { getChecklyDirName } = require('../../services/files')

const apiTemplates = require('../../templates/api')
const browserTemplates = require('../../templates/browser')

async function check() {
  const { data } = await locationsApi.getAll()
  const regions = data.map(({ region }) => region)

  consola.info('Creting new check file')

  const { name, type, url, locations } = await prompt([
    {
      name: 'name',
      type: 'input',
      message: 'Your check name',
    },
    {
      name: 'type',
      type: 'list',
      message: 'What do you want to monitor?',
      choices: ['API', 'BROWSER'],
      default: ['API'],
    },
    {
      name: 'url',
      type: 'input',
      validate: (url) =>
        url.match(/^(https?|chrome):\/\/[^\s$.?#].[^\s]*$/gm)
          ? true
          : 'Please enter a valid URL',
      message: 'Which is the URL you want to monitor',
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

  const { frequency } = await prompt([
    {
      name: 'frequency',
      type: 'list',
      choices:
        type === 'BROWSER'
          ? [1, 5, 10, 15, 30, 60, 720, 1440]
          : [0, 1, 5, 10, 15, 30, 60, 720, 1440],
      message: 'Pick your check frequency',
    },
  ])

  const key = name.toLowerCase().replace(/ /g, '-').trim()
  let filePath = path.join(getChecklyDirName(), 'checks', key + '.yml')
  let tryIndex = 0

  while (fs.existsSync(filePath)) {
    tryIndex += 1
    filePath = path.join(getChecklyDirName(), 'checks', key + tryIndex + '.yml')
  }

  fs.writeFileSync(
    filePath,
    type === 'BROWSER'
      ? browserTemplates.basic({ url, name, frequency, locations })
      : apiTemplates.basic({ url, name, frequency, locations })
  )

  consola.success(`Created new ${type} check: ${key}`)
}

module.exports = check
