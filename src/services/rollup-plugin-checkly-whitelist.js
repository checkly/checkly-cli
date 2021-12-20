const https = require('https')
const consola = require('consola')
const chalk = require('chalk')

module.exports = function plugin (options = {}) {
  return {
    name: 'checkly-whitelist',
    async generateBundle (bundleOptions, bundle) {
      https.get('https://api.checklyhq.com/v1/runtimes', (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          const runtimes = JSON.parse(data)
          const runtime = runtimes.find(
            (runtime) => runtime.name === options.runtime
          )
          const latestRuntimeDeps = Object.keys(runtime.dependencies)

          Object.values(bundle).forEach((script) => {
            script.imports.forEach((i) => {
              if (!latestRuntimeDeps.includes(i)) {
                console.log('\n')
                consola.error(`Package ${chalk.blue.bold(i)} not allowed!`)
                this.error('Invalid import in required Checkly check script.')
              }
            })
          })
        })
      })
    }
  }
}
