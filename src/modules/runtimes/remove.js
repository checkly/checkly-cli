const { promises: fs } = require('fs')
const consola = require('consola')
const path = require('path')
const config = require('../../services/config')
const runtimesFolder = config.data.get('runtimesFolder')

async function remove ({ runtimeVersion }) {
  try {
    await fs.rmdir(path.join(runtimesFolder, runtimeVersion), { recursive: true })
    consola.success(`Runtime ${runtimeVersion} removed \n`)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = remove
