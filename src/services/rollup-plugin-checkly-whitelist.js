const http = require('http')
const consola = require('consola')
const chalk = require('chalk')

module.exports = function plugin(options = {}) {
  return {
    name: 'checkly-whitelist',
    async generateBundle(bundleOptions, bundle, isWrite) {
      // Use dynamic API endpoint from our cli config options / env
      http.get('http://localhost:3000/v1/runtimes', (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          const runtimes = JSON.parse(data)
          // runtimes[0] = 2021.06 - should be dynamic and passed in somehow most likely
          const latestRuntimeDeps = Object.keys(runtimes[0].dependencies)

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
    },
  }
}
