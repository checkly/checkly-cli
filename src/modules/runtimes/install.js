const { promises: fs } = require('fs')
const consola = require('consola')
const { runtimes } = require('../../services/api')
const path = require('path')
const { promisify } = require('util')
const exec = promisify(require('child_process').exec)
const config = require('../../services/config')
const runtimesFolder = config.data.get('runtimesFolder')

const template = (runtimeId, dependencies) => `{
    "name": "@checkly/cli",
    "version": "0.0.1",
    "description": "Checkly Local Runtime ${runtimeId}",
    "license": "MIT",
    "devDependencies": ${dependencies}
}`

async function install ({ runtimeVersion }) {
  try {
    const { data } = await runtimes.get(runtimeVersion)

    // TODO: Remove node from the deps list
    delete data.dependencies.node

    await fs.mkdir(path.join(runtimesFolder, runtimeVersion), { recursive: true })
    await fs.writeFile(path.join(runtimesFolder, `${runtimeVersion}/package.json`),
      template(runtimeVersion, JSON.stringify(data.dependencies)))

    consola.success(`Installing ${runtimeVersion} \n`)

    await exec('npm install --no-audit', {
      cwd: path.join(runtimesFolder, runtimeVersion),
    })
    consola.success(`Runtime ${runtimeVersion} installed \n`)
    return data
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = install
