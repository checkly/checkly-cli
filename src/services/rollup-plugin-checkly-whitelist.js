const http = require('http')
const consola = require('consola')
const chalk = require('chalk')

module.exports = function plugin(options = {}) {
  return {
    name: 'checkly-whitelist',
    async generateBundle(bundleOptions, bundle, isWrite) {
      http.get('http://localhost:3000/v1/runtimes', (res) => {
        let data = ''

        // called when a data chunk is received.
        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          const runtimes = JSON.parse(data)
          const latestRuntimeDeps = Object.keys(runtimes[0].dependencies)

          // console.log(latestRuntimeDeps)

          Object.values(bundle).forEach((script) => {
            // console.log(script.imports)

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
