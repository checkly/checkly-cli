const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')
const { promptUrl, promptLocations } = require('../../services/prompts')

const { locations: locationsApi } = require('../../services/api')
const { CHECK_TYPES, CHECK_FREQUENCIES } = require('../../services/constants')

const apiTemplates = require('../../templates/api')
const browserTemplates = require('../../templates/browser')

async function check (checklyDir) {
  const { data } = await locationsApi.getAll()
  const regions = data.map(({ region }) => region)

  consola.info('Creating new check file')

  const { name, type, url, locations } = await prompt([
    {
      name: 'name',
      type: 'input',
      message: 'Your check name'
    },
    {
      name: 'type',
      type: 'list',
      message: 'What do you want to monitor?',
      choices: [CHECK_TYPES.API, CHECK_TYPES.BROWSER],
      default: [CHECK_TYPES.API]
    },
    promptUrl(),
    promptLocations(regions)
  ])

  const { frequency } = await prompt([
    {
      name: 'frequency',
      type: 'list',
      choices: type === CHECK_TYPES.BROWSER ? CHECK_FREQUENCIES.BROWSER : CHECK_FREQUENCIES.API,
      message: 'Pick your check frequency'
    }
  ])

  const key = name.toLowerCase().replace(/ /g, '-').trim()
  let filePath = path.join(checklyDir, 'checks', key + '.yml')
  let tryIndex = 0

  while (fs.existsSync(filePath)) {
    tryIndex += 1
    filePath = path.join(checklyDir, 'checks', key + tryIndex + '.yml')
  }

  fs.writeFileSync(
    filePath,
    type === CHECK_TYPES.BROWSER
      ? browserTemplates.basic({
        url,
        name,
        frequency: frequency.replace(/[^0-9.]+/, ''),
        locations
      })
      : apiTemplates.basic({
        url,
        name,
        frequency: frequency.replace(/[^0-9.]+/, ''),
        locations
      })
  )

  consola.success(`Created new ${type} check: ${key}`)
}

module.exports = check
