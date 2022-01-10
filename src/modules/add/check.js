const fs = require('fs')
const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')

const { locations: locationsApi } = require('../../services/api')
const { promptUrl, promptLocations } = require('../../services/prompts')
const { CHECK_TYPES, CHECK_FREQUENCIES } = require('../../services/constants')

const apiTemplates = require('../../templates/api')
const browserTemplates = require('../../templates/browser')

const parser = require('../../parser')
const NONE = '(none)'

async function check (checklyDir) {
  const { data } = await locationsApi.getAll()
  const regions = data.map(({ region }) => region)

  consola.info('Creating new check file')

  const { groups } = await parser()
  let selectedGroup

  if (Object.keys(groups).length) {
    const { group } = await prompt([
      {
        name: 'group',
        type: 'list',
        message: 'In which group do you want to create the check?',
        choices: [NONE, ...Object.keys(groups)],
        default: [NONE]
      }
    ])

    selectedGroup = group === NONE ? null : group
  }

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
    promptLocations({ choices: regions })
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
  const checkPath = selectedGroup ? `checks/${selectedGroup}` : 'checks'
  let filePath = path.join(checklyDir, checkPath, key + '.yml')
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
